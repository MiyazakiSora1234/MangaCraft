// HTTP サーバ（API と、ビルド済みの画面・コマ画像の配信）
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { normalizeBubbles } from "../shared/bubbles.ts";
import { normalizeModelName, type AppConfig, type Page, type Project, type ProjectSummary } from "../shared/types.ts";
import { findMinorReference } from "./adult.ts";
import { config, defaultModelFor } from "./config.ts";
import {
  cancelProject, createProject, isPageLocked, isProjectRunning, recoverInterrupted, regeneratePage, regeneratePanel, relayoutPage, retryPlan,
  setStyleRef,
} from "./generator.ts";
import { llm } from "./llm/index.ts";
import { deleteProject, getProject, IMAGE_DIR, initStore, listProjects, saveProject } from "./store.ts";
import { resolveStyle, STYLES } from "./styles.ts";

const CLIENT_DIR = path.resolve("dist/client");
const MAX_SYNOPSIS = 4000;
const MAX_INSTRUCTION = 500;

const app = express();
app.use(express.json({ limit: "200kb" }));

// ---------- リクエストの検証 ----------

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Locals {
  project: Project;
  page: Page;
  pageNumber: number;
}
const locals = (res: Response) => res.locals as Locals;

// :id / :n / :i を検証して res.locals に入れる
app.param("id", (_req, res, next, id: string) => {
  const project = getProject(id);
  if (!project) return next(new HttpError(404, "作品が見つかりません"));
  locals(res).project = project;
  next();
});

app.param("n", (_req, res, next, value: string) => {
  const n = Number(value);
  const page = locals(res).project.pages[n - 1];
  if (!page) return next(new HttpError(404, "ページが見つかりません"));
  Object.assign(locals(res), { page, pageNumber: n });
  next();
});

app.param("i", (_req, res, next, value: string) => {
  if (!locals(res).page.panels[Number(value)]) return next(new HttpError(404, "コマが見つかりません"));
  next();
});

// 生成中のページは操作させない
function ensureIdle(_req: Request, res: Response, next: NextFunction) {
  const { project, pageNumber } = locals(res);
  if (isPageLocked(project, pageNumber)) return next(new HttpError(409, "このページは生成中です。完了後に操作してください。"));
  next();
}

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

// 成人向けの作品に、未成年を想起させる言葉が入るのを防ぐ
function rejectMinorReference(project: Pick<Project, "rating">, where: string, ...texts: string[]) {
  if (project.rating !== "adult") return;
  const word = findMinorReference(...texts);
  if (word) throw new HttpError(400, `${where}に未成年を想起させる言葉（「${word}」）が含まれるため、成人向けの作品では使えません。`);
}

// ---------- API ----------

app.get("/api/config", (_req, res) => {
  const body: AppConfig = {
    styles: STYLES,
    maxPages: config.maxPages,
    mock: config.mock,
    defaultModels: { general: defaultModelFor("general"), adult: defaultModelFor("adult") },
  };
  res.json(body);
});

// 文章生成に使えるモデル（Ollama に入っているもの）
app.get("/api/models", async (_req, res) => {
  try {
    res.json(await llm.listModels());
  } catch (err) {
    throw new HttpError(502, (err as Error).message);
  }
});

const summary = (p: Project): ProjectSummary => ({
  id: p.id,
  title: p.title,
  status: p.status,
  createdAt: p.createdAt,
  pageCount: p.input.pageCount,
  style: p.style.label,
  rating: p.rating,
  cover: p.pages[0]?.panels?.find((x) => x.image?.url)?.image.url ?? null,
});

app.get("/api/projects", (_req, res) => {
  res.json(listProjects().map(summary));
});

app.post("/api/projects", async (req, res) => {
  const synopsis = String(req.body.synopsis ?? "").trim();
  const title = text(req.body.title, 60);
  const pageCount = Math.floor(Number(req.body.pageCount));
  if (synopsis.length < 10) throw new HttpError(400, "ストーリーの概要を10文字以上で入力してください");
  // UTF-8 以外で送られた文字は U+FFFD に化ける。化けたまま渡すと AI が無関係な話を作るので弾く
  if (/�/.test(synopsis + title)) throw new HttpError(400, "文字化けしています。UTF-8 で送信してください");
  if (synopsis.length > MAX_SYNOPSIS) throw new HttpError(400, `概要は${MAX_SYNOPSIS}文字以内にしてください`);
  if (!(pageCount >= 1 && pageCount <= config.maxPages)) throw new HttpError(400, `ページ数は1〜${config.maxPages}で指定してください`);
  const customStyle = String(req.body.customStyle ?? "").slice(0, 300);
  const rating = req.body.rating === "adult" ? "adult" : "general";
  if (rating === "adult" && req.body.adultConfirmed !== true) throw new HttpError(400, "成人向けの作品を作るには、18歳以上であることの確認が必要です");
  rejectMinorReference({ rating }, "概要・タイトル・絵柄", synopsis, title, customStyle);
  const model = normalizeModelName(String(req.body.model || defaultModelFor(rating)));
  const models = config.mock ? null : await llm.listModels().catch(() => null);
  if (models && !models.some((m) => m.name === model)) {
    throw new HttpError(400, `モデル ${model} が Ollama に入っていません。ターミナルで「ollama pull ${model}」を実行してください。`);
  }
  const style = resolveStyle(String(req.body.styleId ?? ""), customStyle);
  const project = createProject({ synopsis, pageCount, style, title, rating, model: config.mock ? "mock" : model });
  res.status(201).json({ id: project.id });
});

app.get("/api/projects/:id", (_req, res) => {
  res.json(locals(res).project);
});

app.delete("/api/projects/:id", async (_req, res) => {
  await deleteProject(locals(res).project.id);
  res.status(204).end();
});

app.post("/api/projects/:id/retry", (_req, res) => {
  const { project } = locals(res);
  if (project.status !== "error" && project.status !== "cancelled") throw new HttpError(409, "再試行できる状態ではありません");
  retryPlan(project);
  res.status(202).json({ ok: true });
});

// 生成を中断する（構成中なら構成を、ページの生成中ならそのページを止める）
app.post("/api/projects/:id/cancel", (_req, res) => {
  const { project } = locals(res);
  if (!isProjectRunning(project)) throw new HttpError(409, "生成中ではありません");
  cancelProject(project);
  res.json(project);
});

// 絵柄の見本にするコマを選ぶ（{ page, panel }。{ clear: true } で解除）
app.post("/api/projects/:id/style-ref", (req, res) => {
  const { project } = locals(res);
  try {
    const ref = req.body.clear ? setStyleRef(project, null) : setStyleRef(project, Number(req.body.page), Number(req.body.panel));
    res.json({ styleRef: ref });
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});

// ページの作り直し（mode: all = ネームから / images = 絵だけ）
app.post("/api/projects/:id/pages/:n/regenerate", ensureIdle, (req, res) => {
  const { project, pageNumber } = locals(res);
  const mode = req.body.mode === "images" ? "images" : "all";
  const instruction = text(req.body.instruction, MAX_INSTRUCTION);
  rejectMinorReference(project, "要望", instruction);
  regeneratePage(project, pageNumber, { mode, instruction });
  res.status(202).json({ ok: true });
});

// コマ割りだけ組み直す（絵とセリフはそのまま）
app.post("/api/projects/:id/pages/:n/relayout", ensureIdle, (_req, res) => {
  const { project, page, pageNumber } = locals(res);
  if (!page.panels.length) throw new HttpError(409, "まだコマがありません");
  res.json(relayoutPage(project, pageNumber));
});

// 1コマだけ描き直す
app.post("/api/projects/:id/pages/:n/panels/:i/regenerate", ensureIdle, (req, res) => {
  const { project, pageNumber } = locals(res);
  const instruction = text(req.body.instruction, MAX_INSTRUCTION);
  rejectMinorReference(project, "要望", instruction);
  regeneratePanel(project, pageNumber, Number(req.params.i), instruction);
  res.status(202).json({ ok: true });
});

// セリフの手直し
app.patch("/api/projects/:id/pages/:n/panels/:i/bubbles", ensureIdle, (req, res) => {
  const { project, page } = locals(res);
  if (!Array.isArray(req.body.bubbles)) throw new HttpError(400, "bubbles が不正です");
  const panel = page.panels[Number(req.params.i)];
  const bubbles = normalizeBubbles(req.body.bubbles, { max: 4, textLength: 80, speakerLength: 30 });
  rejectMinorReference(project, "セリフ", ...bubbles.flatMap((b) => [b.speaker, b.text]));
  panel.bubbles = bubbles;
  saveProject(project);
  res.json(panel);
});

// ---------- 配信 ----------

app.use("/images", express.static(IMAGE_DIR, { maxAge: "7d", immutable: true }));
// 画面はハッシュ（#/...）でページを切り替えるので、配信するのは index.html とビルド済みの部品だけ。
// index.html は毎回確認させ、更新後に古い画面が残らないようにする（部品はファイル名に版が入るので長くキャッシュしてよい）
app.use(express.static(CLIENT_DIR, {
  setHeaders: (res, file) => {
    res.setHeader("Cache-Control", file.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable");
  },
}));
app.get("/", (_req, res) => {
  res.status(404).send("画面がビルドされていません。npm run build を実行してください。");
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "サーバエラーが発生しました" });
});

// ---------- 起動 ----------

recoverInterrupted(await initStore());

app.listen(config.port, () => {
  console.log(`MangaCraft: http://localhost:${config.port}`);
  console.log(`  ストーリー生成: ${llm.describe()}`);
  console.log(`  画像生成: ${config.mock ? "仮画像" : config.diffusersUrl}`);
});

process.on("SIGTERM", () => process.exit(0));
