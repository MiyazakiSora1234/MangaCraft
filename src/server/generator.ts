// 生成パイプライン：全体の構成 → ページごとのネーム → コマ画像
import { buildLayout } from "../shared/layout.ts";
import { isPageBusy, type ContentRating, type Page, type Project, type RegenerateMode, type Style, type StyleRef } from "../shared/types.ts";
import { buildImagePrompt, generatePanelImage, releaseImageModel } from "./images/index.ts";
import { llm } from "./llm/index.ts";
import { newId, saveProject } from "./store.ts";

// LLM と画像生成は同じ GPU を使うので、片方を使う前にもう片方を VRAM から降ろす
// （両方載ると 16GB では収まらず、メモリ不足で極端に遅くなる）
const prepareGpuForLlm = releaseImageModel;
const prepareGpuForImages = () => llm.release();

// 処理中のページ（"<作品ID>:<ページ番号>"）。同じページの処理が重ならないようにする
const running = new Set<string>();
const pageKey = (project: Project, n: number) => `${project.id}:${n}`;

// ページを操作できない（生成中・生成待ち）か
export function isPageLocked(project: Project, n: number): boolean {
  const page = project.pages[n - 1];
  return running.has(pageKey(project, n)) || (page !== undefined && isPageBusy(page));
}

const errorMessage = (err: unknown) => (err as Error)?.message || String(err);

// ---------- 中断 ----------
// 作品ごとの中断の合図。中断すると、通信中の LLM・画像生成を打ち切り、その作品の処理は次の区切りで止まる

const controllers = new Map<string, AbortController>();

function signalFor(project: Project): AbortSignal {
  let controller = controllers.get(project.id);
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    controllers.set(project.id, controller);
  }
  return controller.signal;
}

// 生成中の処理がある作品か
export function isProjectRunning(project: Project): boolean {
  return project.status === "planning" || project.pages.some((p) => isPageLocked(project, p.number));
}

// 中断したページ。描き直し途中のコマは前の絵に戻し、絵がないコマは失敗扱いにする
function markCancelled(page: Page): void {
  page.status = "cancelled";
  page.error = "中断しました。「このページを作り直す」で再開できます。";
  for (const panel of page.panels) {
    if (panel.image.status !== "pending" && panel.image.status !== "drawing") continue;
    panel.image = panel.image.url
      ? { ...panel.image, status: "done", error: null }
      : { ...panel.image, status: "error", error: "中断しました" };
  }
}

export function cancelProject(project: Project): void {
  controllers.get(project.id)?.abort();
  controllers.delete(project.id);
  if (project.status === "planning") {
    project.status = "cancelled";
    project.error = "中断しました。";
  }
  for (const page of project.pages) if (isPageBusy(page)) markCancelled(page);
  saveProject(project);
}

// 同じページへの処理を 1 つに限り、終わったら必ず保存する
async function exclusive(project: Project, n: number, fn: () => Promise<void>): Promise<void> {
  const key = pageKey(project, n);
  if (running.has(key)) return;
  running.add(key);
  try {
    await fn();
  } finally {
    running.delete(key);
    saveProject(project);
  }
}

// 作画が終わったページの状態を、コマの結果から決める
function settlePage(page: Page): void {
  const failed = page.panels.filter((p) => p.image.status === "error").length;
  page.status = failed ? "error" : "done";
  page.error = failed ? `${failed}コマの画像生成に失敗しました。コマをクリックして描き直せます。` : null;
}

const newLayout = (project: Project, page: Page) => buildLayout(page.panels, `${project.id}:${page.number}:${Date.now()}`);

// ---------- 作品 ----------

interface NewProject {
  synopsis: string;
  pageCount: number;
  style: Style;
  title: string;
  rating: ContentRating;
  model: string;
}

export function createProject({ synopsis, pageCount, style, title, rating, model }: NewProject): Project {
  const project: Project = {
    id: newId(),
    createdAt: new Date().toISOString(),
    status: "planning",
    error: null,
    input: { synopsis, pageCount, title },
    rating,
    model,
    style,
    title: title || "生成中…",
    logline: "",
    facts: [],
    characters: [],
    outline: [],
    pages: [],
  };
  saveProject(project);
  runProject(project).catch((err) => console.error(err));
  return project;
}

export function retryPlan(project: Project): void {
  project.status = "planning";
  project.error = null;
  saveProject(project);
  runProject(project).catch((err) => console.error(err));
}

async function runProject(project: Project): Promise<void> {
  const signal = signalFor(project);
  try {
    await prepareGpuForLlm();
    const plan = await llm.generatePlan({ ...project.input, style: project.style, rating: project.rating, model: project.model }, signal);
    signal.throwIfAborted();
    Object.assign(project, {
      title: plan.title,
      logline: plan.logline,
      facts: plan.facts,
      characters: plan.characters,
      outline: plan.pages,
      status: "ready",
      pages: plan.pages.map((p): Page => ({ number: p.page, status: "pending", error: null, layout: null, panels: [] })),
    });
    saveProject(project);
  } catch (err) {
    if (signal.aborted) return; // 中断（状態は cancelProject で変えてある）
    console.error("[plan]", err);
    project.status = "error";
    project.error = errorMessage(err);
    saveProject(project);
    return;
  }
  // 1) 全ページのネームを先に作る。前のページの終わり方を踏まえて続きを書けるよう、1ページずつ順番に
  for (const page of project.pages) {
    if (signal.aborted) return;
    await runPage(project, page.number, { draw: false });
  }
  // 2) LLM を VRAM から降ろしてから、まとめて作画する
  await prepareGpuForImages();
  for (const page of project.pages) {
    if (signal.aborted) return;
    if (page.panels.length && page.status === "pending") await runPage(project, page.number, { mode: "images" });
  }
}

// ---------- ページ ----------

interface RunPageOptions {
  instruction?: string;
  mode?: RegenerateMode; // all = ネームから作る / images = 絵だけ描き直す
  draw?: boolean; // false ならネームまで作って作画待ち（pending）にする
}

function runPage(project: Project, n: number, { instruction = "", mode = "all", draw = true }: RunPageOptions): Promise<void> {
  const page = project.pages[n - 1];
  const signal = signalFor(project);
  return exclusive(project, n, async () => {
    try {
      page.error = null;
      if (mode === "all" || !page.panels.length) {
        page.status = "scripting";
        await prepareGpuForLlm();
        saveProject(project);
        const script = await llm.generatePageScript({ project, pageNumber: n, instruction }, signal);
        signal.throwIfAborted();
        page.panels = script.panels.map((p) => ({ ...p, image: { url: null, status: "pending", error: null } }));
        page.layout = newLayout(project, page);
        if (draw) await prepareGpuForImages();
      } else {
        page.panels.forEach((p) => { p.image = { ...p.image, status: "pending", error: null }; });
      }
      if (!draw) {
        page.status = "pending";
        return;
      }
      page.status = "drawing";
      saveProject(project);
      for (let i = 0; i < page.panels.length; i++) await drawPanel(project, page, i, instruction, signal);
      settlePage(page);
    } catch (err) {
      if (signal.aborted) {
        markCancelled(page);
        return;
      }
      console.error(`[page ${n}]`, err);
      page.status = "error";
      page.error = errorMessage(err);
    }
  });
}

// 以下の再生成は、最初の await までが同期的に走るので、応答を返す前にページの状態が「生成中」に変わる
export function regeneratePage(project: Project, n: number, opts: { mode: RegenerateMode; instruction: string }): void {
  runPage(project, n, opts).catch((err) => console.error(err));
}

export function regeneratePanel(project: Project, n: number, i: number, instruction = ""): void {
  const page = project.pages[n - 1];
  const signal = signalFor(project);
  exclusive(project, n, async () => {
    page.status = "drawing";
    page.error = null;
    try {
      await drawPanel(project, page, i, instruction, signal);
      settlePage(page);
    } catch {
      markCancelled(page); // drawPanel が投げるのは中断のときだけ
    }
  }).catch((err) => console.error(err));
}

// コマ割りだけ組み直す（LLM も画像生成も使わないので一瞬で終わる。絵はコマの形に合わせて切り抜かれる）
export function relayoutPage(project: Project, n: number): Page {
  const page = project.pages[n - 1];
  page.layout = newLayout(project, page);
  saveProject(project);
  return page;
}

// ---------- コマ ----------

// 中断されたときだけ例外を投げる（画像生成の失敗はコマを失敗扱いにして続ける）
async function drawPanel(project: Project, page: Page, i: number, extra: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const panel = page.panels[i];
  const aspect = page.layout?.panels[i]?.aspect ?? 1;
  panel.image.status = "drawing";
  saveProject(project);
  try {
    const url = await generatePanelImage({
      projectId: project.id,
      key: `p${page.number}-${i}`,
      prompt: buildImagePrompt({ panel, style: project.style, characters: project.characters, rating: project.rating, extra }),
      aspect,
      label: panel.description,
      styleRef: project.styleRef?.url,
      signal,
    });
    panel.image = { url, status: "done", error: null };
    // まだ見本がなければ、最初に描けた「人物が写っているコマ」を絵柄の見本にする
    if (!project.styleRef && panel.characters.length) {
      project.styleRef = { url, page: page.number, panel: i, auto: true };
    }
  } catch (err) {
    if (signal.aborted) throw err;
    console.error(`[image p${page.number}-${i}]`, err);
    panel.image = { ...panel.image, status: "error", error: errorMessage(err) };
  }
  saveProject(project);
}

// コマの絵を絵柄の見本にする（n が null なら解除）
export function setStyleRef(project: Project, n: number | null, i = 0): StyleRef | null {
  if (n === null) {
    project.styleRef = null;
  } else {
    const url = project.pages[n - 1]?.panels[i]?.image?.url;
    if (!url) throw new Error("まだ絵がないコマは見本にできません");
    project.styleRef = { url, page: n, panel: i, auto: false };
  }
  saveProject(project);
  return project.styleRef;
}

// ---------- 起動時 ----------

// サーバ再起動で中断された処理をエラー扱いにして、作り直せる状態にする
export function recoverInterrupted(projects: Project[]): void {
  for (const project of projects) {
    let changed = false;
    if (project.status === "planning") {
      project.status = "error";
      project.error = "サーバ再起動により中断されました。";
      changed = true;
    }
    for (const page of project.pages) {
      if (isPageBusy(page)) {
        page.status = "error";
        page.error = "サーバ再起動により中断されました。作り直してください。";
        page.panels.forEach((p) => { if (p.image.status !== "done") p.image.status = "error"; });
        changed = true;
      }
    }
    if (changed) saveProject(project);
  }
}
