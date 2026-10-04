// npm run mock（--mock）で使うダミーのストーリー生成（LLM なしで画面を確認する用）
import { BUBBLE_POSITIONS, PANEL_INTENSITIES, PANEL_SHOTS, PANEL_SIZES } from "../../shared/types.ts";
import type { Llm } from "./index.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockLlm: Llm = {
  describe: () => "モック",
  release: async () => {},

  async generatePlan({ synopsis, pageCount, title }) {
    await wait(800);
    return {
      facts: [],
      title: title || "（モック）" + synopsis.slice(0, 12),
      logline: synopsis.slice(0, 60),
      characters: [
        { name: "ハル", role: "主人公", appearance: "teenage boy, messy black hair, school uniform" },
        { name: "ミオ", role: "相棒", appearance: "teenage girl, long silver hair, red scarf" },
      ],
      pages: Array.from({ length: pageCount }, (_, i) => ({
        page: i + 1,
        summary: `${i + 1}ページ目の展開（モック）`,
        beats: [`${i + 1}ページの場面A`, `${i + 1}ページの場面B`, `${i + 1}ページの場面C`],
      })),
    };
  },

  async generatePageScript({ pageNumber, instruction }) {
    await wait(600);
    const count = 3 + ((pageNumber + (instruction ? 2 : 0)) % 4);
    const panels = Array.from({ length: count }, (_, i) => ({
      description: `${pageNumber}ページ・コマ${i + 1}${instruction ? "（修正版）" : ""}`,
      size: PANEL_SIZES[(i * 3 + pageNumber) % PANEL_SIZES.length],
      shot: PANEL_SHOTS[(i + pageNumber) % PANEL_SHOTS.length],
      intensity: PANEL_INTENSITIES[(pageNumber + i) % PANEL_INTENSITIES.length],
      characters: i % 2 ? ["ミオ"] : ["ハル"],
      imagePrompt: "mock scene",
      bubbles: i % 3 === 2 ? [] : [
        { speaker: i % 2 ? "ミオ" : "ハル", text: i % 2 ? "それって本当なの？" : "行くぞ、ここからが本番だ！", type: i === 0 ? "shout" as const : "speech" as const, position: BUBBLE_POSITIONS[i % BUBBLE_POSITIONS.length] },
        ...(i === 0 ? [{ speaker: "", text: "その日、すべてが始まった。", type: "narration" as const, position: "top-left" as const }] : []),
      ],
    }));
    return { panels };
  },
};
