// 画像生成モデル（SDXL）に渡すプロンプトを作る
import type { Character, PanelScript, Style } from "../../shared/types.ts";
import type { ImagePrompt } from "./types.ts";

const NEGATIVE_PROMPT =
  "text, letters, words, japanese text, speech bubble, caption, sound effect, watermark, signature, logo, panel border, frame, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed face";

// LLM の作画指示に紛れ込んだ画風の言葉を取り除く（絵柄は style で全コマ共通に指定するため）
const STYLE_WORDS = /\b(?:(?:japanese |shonen |shojo )?manga|anime|comic|webtoon|cartoon|watercolou?r|oil painting|cinematic|photo-?realistic|realistic|illustration|line ?art|sketch|black and white|monochrome|greyscale|grayscale|full colou?r|colou?rful|vibrant colou?rs?|pastel colou?rs?|sepia|cel shading|screentones?)(?: style)?\b/gi;

export const contentOnly = (text: string) => text
  .replace(STYLE_WORDS, "")
  .split(",")
  .map((s) => s.replace(/\s{2,}/g, " ").replace(/^[\s.]+|[\s.]+$/g, ""))
  .filter(Boolean)
  .join(", ");

interface PromptInput {
  panel: Pick<PanelScript, "characters" | "imagePrompt">;
  style: Style;
  characters: Character[];
  extra?: string; // 描き直し時の要望
}

// 絵柄 → 人物 → 場面の順に並べ、絵柄が全コマで揃うようにする
export function buildImagePrompt({ panel, style, characters, extra = "" }: PromptInput): ImagePrompt {
  const cast = characters.filter((c) => panel.characters.includes(c.name));
  const positive = [
    style.prompt,
    "masterpiece, best quality",
    ...cast.map((c) => contentOnly(c.appearance)),
    contentOnly(panel.imagePrompt),
    extra,
  ].filter(Boolean).join(", ");
  const negative = [style.negative, NEGATIVE_PROMPT].filter(Boolean).join(", ");
  return { positive, negative, monochrome: Boolean(style.monochrome) };
}
