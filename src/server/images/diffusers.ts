// 同梱の画像生成サーバ（image-server/、Hugging Face Diffusers）
import { Agent, fetch } from "undici";
import { config } from "../config.ts";
import { sdSize } from "./sizes.ts";
import type { ImageGenerator } from "./types.ts";

const url = config.diffusersUrl;

// 初回はモデルの読み込み（とダウンロード）で数分かかるため、fetch 既定の 5 分で切らない
const TIMEOUT_MS = 30 * 60 * 1000;
const agent = new Agent({ headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS });

export const diffusers: ImageGenerator = {
  async generate({ prompt, aspect, styleImage }) {
    const [width, height] = sdSize(aspect);
    let res;
    try {
      res = await fetch(`${url}/generate`, {
        dispatcher: agent,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.positive,
          negative_prompt: prompt.negative,
          width,
          height,
          monochrome: prompt.monochrome,
          style_image: styleImage,
        }),
      });
    } catch {
      throw new Error(`画像生成サーバ（${url}）に接続できません。起動しているか確認してください。`);
    }
    if (!res.ok) throw new Error(`画像生成サーバ エラー (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), ext: "png" };
  },

  // 失敗しても処理は続ける
  async release() {
    await fetch(`${url}/unload`, { method: "POST" }).catch(() => {});
  },
};
