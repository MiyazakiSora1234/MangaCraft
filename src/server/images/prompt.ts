// 画像生成モデル（SDXL）に渡すプロンプトを作る
import type { Character, ContentRating, PanelScript, Style } from "../../shared/types.ts";
import { ADULT_NEGATIVE, ADULT_POSITIVE, adultify } from "../adult.ts";
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
  rating: ContentRating;
  extra?: string; // 描き直し時の要望
}

// 絵柄 → 人物 → 場面の順に並べ、絵柄が全コマで揃うようにする。
// 成人向けでは、人物・場面・要望から幼さを示す言葉を取り除き、成人であることを明示する
export function buildImagePrompt({ panel, style, characters, rating, extra = "" }: PromptInput): ImagePrompt {
  const adult = rating === "adult";
  const clean = (text: string) => (adult ? adultify(contentOnly(text)) : contentOnly(text));
  const cast = characters.filter((c) => panel.characters.includes(c.name));
  const positive = [
    style.prompt,
    "masterpiece, best quality",
    adult ? ADULT_POSITIVE : "",
    ...cast.map((c) => clean(c.appearance)),
    clean(panel.imagePrompt),
    adult ? adultify(extra) : extra,
  ].filter(Boolean).join(", ");
  const negative = [adult ? ADULT_NEGATIVE : "", style.negative, NEGATIVE_PROMPT].filter(Boolean).join(", ");
  return { positive, negative, monochrome: Boolean(style.monochrome) };
}
