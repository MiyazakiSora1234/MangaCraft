// コマ画像の生成。通常は同梱の Diffusers サーバ、npm run mock のときは仮画像を使う
import fs from "node:fs/promises";
import { config } from "../config.ts";
import { imagePath, saveImage } from "../store.ts";
import { diffusers } from "./diffusers.ts";
import { placeholder } from "./placeholder.ts";
import type { ImagePrompt } from "./types.ts";

export { buildImagePrompt } from "./prompt.ts";

const generator = config.mock ? placeholder : diffusers;

// 保存済みのコマ画像を base64 で読む。見つからなければ見本なしで続ける
async function readImageBase64(url: string | undefined): Promise<string | null> {
  const file = url ? imagePath(url) : null;
  return file ? fs.readFile(file).then((b) => b.toString("base64"), () => null) : null;
}

interface PanelImageRequest {
  projectId: string;
  key: string; // 保存するファイル名の先頭（p<ページ>-<コマ>）
  prompt: ImagePrompt;
  aspect: number;
  label: string;
  styleRef?: string; // 絵柄の見本にする画像の URL（/images/...）
}

// 画像を生成して保存し、ブラウザから参照する URL を返す
export async function generatePanelImage({ projectId, key, prompt, aspect, label, styleRef }: PanelImageRequest): Promise<string> {
  const { buffer, ext } = await generator.generate({ prompt, aspect, label, styleImage: await readImageBase64(styleRef) });
  return saveImage(projectId, key, buffer, ext);
}

// 画像モデルを VRAM から降ろす
export const releaseImageModel = () => generator.release();
