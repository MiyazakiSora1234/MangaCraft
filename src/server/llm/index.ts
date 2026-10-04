// 文章生成（構成・ネーム）。通常は Ollama、npm run mock のときはダミーを使う
import { config } from "../config.ts";
import { mockLlm } from "./mock.ts";
import { ollama } from "./ollama.ts";
import type { PageScript, Plan } from "./output.ts";
import type { PageInput, PlanInput } from "./prompts.ts";

export interface Llm {
  describe(): string;
  generatePlan(input: PlanInput): Promise<Plan>;
  generatePageScript(input: PageInput): Promise<PageScript>;
  // モデルを VRAM から降ろす（画像生成に GPU を譲るため）
  release(): Promise<void>;
}

export const llm: Llm = config.mock ? mockLlm : ollama;
