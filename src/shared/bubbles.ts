// 吹き出しの整形（LLM の出力とセリフ編集の両方で使う）
import { BUBBLE_POSITIONS, BUBBLE_TYPES, type Bubble, type BubblePosition, type BubbleType } from "./types.ts";

export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));

export function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

interface BubbleLimits {
  max: number; // 1コマあたりの吹き出しの数
  textLength?: number;
  speakerLength?: number;
}

// 種類・位置を既定値で補い、空のセリフを取り除く
export function normalizeBubbles(input: unknown, { max, textLength, speakerLength }: BubbleLimits): Bubble[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((b) => ({
      speaker: str(b?.speaker).slice(0, speakerLength),
      text: str(b?.text).trim().slice(0, textLength),
      type: oneOf<BubbleType>(b?.type, BUBBLE_TYPES, "speech"),
      position: oneOf<BubblePosition>(b?.position, BUBBLE_POSITIONS, "top-right"),
    }))
    .filter((b) => b.text)
    .slice(0, max);
}
