// Ollama でストーリー構成とネームを作る。出力は JSON Schema（format）で形を指定する
import { assertAdultPlan, assertAdultScript } from "../adult.ts";
import { config } from "../config.ts";
import type { Llm } from "./index.ts";
import { finalizePlan, normalizeScript, withCoverage } from "./output.ts";
import { minPanelsFor, pagePrompt, planPrompt, SYSTEM } from "./prompts.ts";
import { pageSchema, planSchema } from "./schema.ts";

const { url, numCtx } = config.ollama;
const MAX_ATTEMPTS = 3;


// 応答はストリーミングで受け取る（生成に数分かかってもタイムアウトしないように）
async function chat(model: string, prompt: string, schema: object, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      signal,
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
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(`Ollama（${url}）に接続できません。起動しているか確認してください。`);
  }
  if (res.status === 404) throw new Error(`Ollama にモデル ${model} がありません。ターミナルで「ollama pull ${model}」を実行してください。`);
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
async function generate<T>(model: string, prompt: string, schema: object, transform: (json: unknown) => T, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await chat(model, prompt, schema, signal);
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
  describe: () => `Ollama (${url})`,

  async listModels() {
    let res: Response;
    try {
      res = await fetch(`${url}/api/tags`);
    } catch {
      throw new Error(`Ollama（${url}）に接続できません。起動しているか確認してください。`);
    }
    const json = (await res.json()) as { models?: { name: string; details?: { parameter_size?: string } }[] };
    return (json.models ?? [])
      .map((m) => ({ name: m.name, parameterSize: m.details?.parameter_size ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // 成人向けの作品では、出力に未成年が含まれていないかを確認し、含まれていれば作り直す
  generatePlan: (input, signal) => generate(input.model, planPrompt(input), planSchema, (json) => {
    const plan = finalizePlan(json, input);
    if (input.rating === "adult") assertAdultPlan(plan);
    return plan;
  }, signal),

  generatePageScript(input, signal) {
    const { rating, model } = input.project;
    const prompt = pagePrompt(input);
    const minPanels = minPanelsFor(input.project.outline[input.pageNumber - 1]);
    return withCoverage(() => generate(model, prompt, pageSchema, (json) => {
      const script = normalizeScript(json);
      if (rating === "adult") assertAdultScript(script);
      return script;
    }, signal), minPanels);
  },

  // モデルをメモリから降ろす（作画前に VRAM を空けるため）。失敗しても処理は続ける
  // 読み込まれているモデルをすべてメモリから降ろす
  async release() {
    const loaded = await fetch(`${url}/api/ps`).then((r) => r.json() as Promise<{ models?: { name: string }[] }>, () => ({ models: [] }));
    for (const { name } of loaded.models ?? []) {
      await fetch(`${url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, keep_alive: 0 }),
      }).catch(() => {});
    }
  },
};
