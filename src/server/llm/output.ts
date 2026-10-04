// LLM の出力の整形。ローカルLLMはスキーマを守りきれないことがあるため、欠けた項目を補い型を揃える
import { normalizeBubbles, oneOf, str } from "../../shared/bubbles.ts";
import { MAX_PANELS } from "../../shared/layout.ts";
import { PANEL_INTENSITIES, PANEL_SHOTS, PANEL_SIZES, type Character, type OutlinePage, type PanelScript } from "../../shared/types.ts";

export interface Plan {
  facts: string[];
  title: string;
  logline: string;
  characters: Character[];
  pages: OutlinePage[];
}

export interface PageScript {
  panels: PanelScript[];
}

// LLM の出力は形が保証されないので、any として受けて中身を確かめながら取り出す
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const MAX_CHARACTERS = 6;
const MAX_FACTS = 12;
const MAX_BUBBLES_PER_PANEL = 3;

export function finalizePlan(plan: any, { pageCount, title }: { pageCount: number; title: string }): Plan {
  const characters = arr(plan?.characters)
    .map((c) => ({ name: str(c?.name).trim(), role: str(c?.role), appearance: str(c?.appearance) }))
    .filter((c) => c.name)
    .slice(0, MAX_CHARACTERS);
  const pages = Array.from({ length: pageCount }, (_, i) => {
    const page = arr(plan?.pages)[i];
    const summary = str(page?.summary).trim() || "（物語の続き）";
    const beats = arr(page?.beats).map((b) => str(b).trim()).filter(Boolean).slice(0, MAX_PANELS);
    return { page: i + 1, summary, beats: beats.length ? beats : [summary] };
  });
  return {
    facts: arr(plan?.facts).map((f) => str(f).trim()).filter(Boolean).slice(0, MAX_FACTS),
    title: str(plan?.title).trim() || title || "無題の漫画",
    logline: str(plan?.logline).trim(),
    characters,
    pages,
  };
}

export function normalizeScript(script: any): PageScript {
  const panels: PanelScript[] = arr(script?.panels).map((p) => ({
    description: str(p?.description),
    size: oneOf(p?.size, PANEL_SIZES, "medium"),
    shot: oneOf(p?.shot, PANEL_SHOTS, "medium"),
    intensity: oneOf(p?.intensity, PANEL_INTENSITIES, "calm"),
    characters: arr(p?.characters).map((c) => str(c)),
    imagePrompt: str(p?.imagePrompt) || str(p?.description),
    bubbles: normalizeBubbles(p?.bubbles, { max: MAX_BUBBLES_PER_PANEL }),
  }));
  if (!panels.length) throw new Error("コマが生成されませんでした");
  return { panels: panels.slice(0, MAX_PANELS) };
}

// 場面の数だけコマが描かれているか確認し、足りなければ数回まで作り直す（最もコマ数の多い結果を使う）
export async function withCoverage(generate: () => Promise<PageScript>, minPanels: number, attempts = 3): Promise<PageScript> {
  let best: PageScript | null = null;
  for (let i = 1; i <= attempts; i++) {
    const script = await generate();
    if (!best || script.panels.length > best.panels.length) best = script;
    if (script.panels.length >= minPanels) return script;
    console.warn(`[script] コマ数が足りないため再生成します（${script.panels.length}/${minPanels}、${i}/${attempts}）`);
  }
  return best!;
}
