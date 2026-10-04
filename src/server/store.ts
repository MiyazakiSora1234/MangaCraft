// 作品を data/projects/<id>.json に保存するシンプルなファイルストア。
// 単一プロセス前提で、メモリ上のオブジェクトを正とし、変更時に書き出す。
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.ts";
import type { Project } from "../shared/types.ts";

export const DATA_DIR = path.resolve(config.dataDir);
const PROJECT_DIR = path.join(DATA_DIR, "projects");
export const IMAGE_DIR = path.join(DATA_DIR, "images");

const cache = new Map<string, Project>();
const writeQueue = new Map<string, Promise<void>>();

export async function initStore(): Promise<Project[]> {
  await fs.mkdir(PROJECT_DIR, { recursive: true });
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  for (const file of await fs.readdir(PROJECT_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const project = JSON.parse(await fs.readFile(path.join(PROJECT_DIR, file), "utf8")) as Project;
      cache.set(project.id, project);
    } catch (err) {
      console.warn(`[store] ${file} を読み込めませんでした:`, (err as Error).message);
    }
  }
  return [...cache.values()];
}

export function newId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function getProject(id: string): Project | null {
  return cache.get(id) ?? null;
}

export function listProjects(): Project[] {
  return [...cache.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveProject(project: Project): Promise<void> {
  project.updatedAt = new Date().toISOString();
  cache.set(project.id, project);
  // 同じ作品への書き込みは直列化し、一時ファイル経由で置き換える
  const prev = writeQueue.get(project.id) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      const file = path.join(PROJECT_DIR, `${project.id}.json`);
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(project, null, 2));
      await fs.rename(tmp, file);
    })
    .catch((err) => console.error("[store] 保存に失敗:", err));
  writeQueue.set(project.id, next);
  return next;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!cache.has(id)) return false;
  cache.delete(id);
  await (writeQueue.get(id) ?? Promise.resolve());
  writeQueue.delete(id);
  await fs.rm(path.join(PROJECT_DIR, `${id}.json`), { force: true });
  await fs.rm(path.join(IMAGE_DIR, id), { recursive: true, force: true });
  return true;
}

// 保存済みのコマ画像（/images/<作品ID>/<ファイル>）の実ファイルパス
export function imagePath(url: string): string | null {
  const m = String(url).match(/^\/images\/([\w-]+)\/([\w.-]+)$/);
  return m ? path.join(IMAGE_DIR, m[1], m[2]) : null;
}

// コマ画像を保存して、ブラウザから参照する URL を返す
export async function saveImage(projectId: string, key: string, buffer: Buffer, ext: string): Promise<string> {
  const dir = path.join(IMAGE_DIR, projectId);
  await fs.mkdir(dir, { recursive: true });
  // 作り直し時にブラウザキャッシュが残らないよう毎回ファイル名を変える
  const file = `${key}-${Date.now().toString(36)}.${ext}`;
  await fs.writeFile(path.join(dir, file), buffer);
  return `/images/${projectId}/${file}`;
}
