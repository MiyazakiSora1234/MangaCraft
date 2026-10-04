// HTTP サーバ（API と、ビルド済みの画面・コマ画像の配信）
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { normalizeBubbles } from "../shared/bubbles.ts";
import type { AppConfig, Page, Project, ProjectSummary } from "../shared/types.ts";
import { config } from "./config.ts";
import {
  createProject, isPageLocked, recoverInterrupted, regeneratePage, regeneratePanel, relayoutPage, retryPlan, setStyleRef,
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

// ---------- API ----------

app.get("/api/config", (_req, res) => {
  const body: AppConfig = { styles: STYLES, maxPages: config.maxPages, mock: config.mock };
  res.json(body);
});

const summary = (p: Project): ProjectSummary => ({
  id: p.id,
  title: p.title,
  status: p.status,
  createdAt: p.createdAt,
  pageCount: p.input.pageCount,
  style: p.style.label,
  cover: p.pages[0]?.panels?.find((x) => x.image?.url)?.image.url ?? null,
});

app.get("/api/projects", (_req, res) => {
  res.json(listProjects().map(summary));
});

app.post("/api/projects", (req, res) => {
  const synopsis = String(req.body.synopsis ?? "").trim();
  const title = text(req.body.title, 60);
  const pageCount = Math.floor(Number(req.body.pageCount));
  if (synopsis.length < 10) throw new HttpError(400, "ストーリーの概要を10文字以上で入力してください");
  // UTF-8 以外で送られた文字は U+FFFD に化ける。化けたまま渡すと AI が無関係な話を作るので弾く
  if (/�/.test(synopsis + title)) throw new HttpError(400, "文字化けしています。UTF-8 で送信してください");
  if (synopsis.length > MAX_SYNOPSIS) throw new HttpError(400, `概要は${MAX_SYNOPSIS}文字以内にしてください`);
  if (!(pageCount >= 1 && pageCount <= config.maxPages)) throw new HttpError(400, `ページ数は1〜${config.maxPages}で指定してください`);
  const style = resolveStyle(String(req.body.styleId ?? ""), String(req.body.customStyle ?? "").slice(0, 300));
  const project = createProject({ synopsis, pageCount, style, title });
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
  if (project.status !== "error") throw new HttpError(409, "再試行できる状態ではありません");
  retryPlan(project);
  res.status(202).json({ ok: true });
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
  regeneratePage(project, pageNumber, { mode, instruction: text(req.body.instruction, MAX_INSTRUCTION) });
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
  regeneratePanel(project, pageNumber, Number(req.params.i), text(req.body.instruction, MAX_INSTRUCTION));
  res.status(202).json({ ok: true });
});

// セリフの手直し
app.patch("/api/projects/:id/pages/:n/panels/:i/bubbles", ensureIdle, (req, res) => {
  const { project, page } = locals(res);
  if (!Array.isArray(req.body.bubbles)) throw new HttpError(400, "bubbles が不正です");
  const panel = page.panels[Number(req.params.i)];
  panel.bubbles = normalizeBubbles(req.body.bubbles, { max: 4, textLength: 80, speakerLength: 30 });
  saveProject(project);
  res.json(panel);
});

// ---------- 配信 ----------

app.use("/images", express.static(IMAGE_DIR, { maxAge: "7d", immutable: true }));
app.use(express.static(CLIENT_DIR));
// 画面はハッシュでページを切り替えるので、API 以外はすべて index.html を返す
app.get(/^(?!\/api\/|\/images\/).*/, (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"), (err) => {
    if (err) res.status(404).send("画面がビルドされていません。npm run build を実行してください。");
  });
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
