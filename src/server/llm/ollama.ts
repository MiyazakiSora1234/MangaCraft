// Ollama でストーリー構成とネームを作る。出力は JSON Schema（format）で形を指定する
import { config } from "../config.ts";
import type { Llm } from "./index.ts";
import { finalizePlan, normalizeScript, withCoverage } from "./output.ts";
import { minPanelsFor, pagePrompt, planPrompt, SYSTEM } from "./prompts.ts";
import { pageSchema, planSchema } from "./schema.ts";

const { url, model, numCtx } = config.ollama;
const MAX_ATTEMPTS = 3;

// 応答はストリーミングで受け取る（生成に数分かかってもタイムアウトしないように）
async function chat(prompt: string, schema: object): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        format: schema,
        options: { num_ctx: numCtx, temperature: 0.7 },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      }),
    });
  } catch {
    throw new Error(`Ollama（${url}）に接続できません。起動しているか確認してください。`);
  }
  if (!res.ok) throw new Error(`Ollama エラー (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);

  // 1 行に 1 つの JSON が流れてくる
  let text = "";
  let buf = "";
  const decoder = new TextDecoder();
  const read = (line: string) => {
    if (!line.trim()) return;
    const json = JSON.parse(line);
    if (json.error) throw new Error(`Ollama エラー: ${json.error}`);
    text += json.message?.content ?? "";
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    lines.forEach(read);
  }
  read(buf);
  return text;
}

// 出力が壊れていた場合（JSON として読めない・コマが空など）だけ数回やり直す
async function generate<T>(prompt: string, schema: object, transform: (json: unknown) => T): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await chat(prompt, schema);
    try {
      return transform(JSON.parse(text));
    } catch (err) {
      lastError = err;
      console.warn(`[ollama] 出力が不正なため再生成します（${attempt}/${MAX_ATTEMPTS}）: ${(err as Error).message}`);
    }
  }
  throw lastError;
}

export const ollama: Llm = {
  describe: () => `Ollama ${model} (${url})`,

  generatePlan: (input) => generate(planPrompt(input), planSchema, (json) => finalizePlan(json, input)),

  generatePageScript(input) {
    const prompt = pagePrompt(input);
    return withCoverage(() => generate(prompt, pageSchema, normalizeScript), minPanelsFor(input.project.outline[input.pageNumber - 1]));
  },

  // モデルをメモリから降ろす（作画前に VRAM を空けるため）。失敗しても処理は続ける
  async release() {
    await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    }).catch(() => {});
  },
};
