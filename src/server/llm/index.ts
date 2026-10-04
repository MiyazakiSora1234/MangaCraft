// 文章生成（構成・ネーム）。通常は Ollama、npm run mock のときはダミーを使う
import { config } from "../config.ts";
import { mockLlm } from "./mock.ts";
import { ollama } from "./ollama.ts";
import type { PageScript, Plan } from "./output.ts";
import type { PageInput, PlanInput } from "./prompts.ts";

export interface Llm {
  describe(): string;
  // signal で中断すると、生成途中でも打ち切る
  generatePlan(input: PlanInput, signal?: AbortSignal): Promise<Plan>;
  generatePageScript(input: PageInput, signal?: AbortSignal): Promise<PageScript>;
  // モデルを VRAM から降ろす（画像生成に GPU を譲るため）
  release(): Promise<void>;
}

export const llm: Llm = config.mock ? mockLlm : ollama;
