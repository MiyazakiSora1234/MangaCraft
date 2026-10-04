import type { Style } from "../shared/types.ts";

// 絵柄プリセット。
//  prompt   : 画像生成モデルに渡す英語のスタイル指定（全コマ共通で先頭に置く）
//  negative : その絵柄から外れないためのネガティブ指定（白黒の絵柄にカラーが混ざらない、など）
//  monochrome: 白黒の絵柄。生成後にグレースケールへ変換して、髪や目の色指定で色が混ざるのを防ぐ
const MONO_NEGATIVE = "color, colorful, multicolored, colored skin, colored hair, painting, 3d, photorealistic";
const COLOR_NEGATIVE = "monochrome, greyscale, sketch, lineart only, 3d, photorealistic";


export const STYLES: Style[] = [
  {
    id: "shonen",
    label: "少年漫画",
    description: "力強い線とダイナミックな構図",
    prompt: "monochrome, greyscale, manga, shonen manga style, bold ink lineart, screentone shading, speed lines, high contrast",
    negative: MONO_NEGATIVE,
    monochrome: true,
  },
  {
    id: "shojo",
    label: "少女漫画",
    description: "繊細な線と大きな瞳、花やきらめき",
    prompt: "monochrome, greyscale, manga, shoujo manga style, delicate thin lineart, large sparkling eyes, soft screentone, flowers and sparkles",
    negative: MONO_NEGATIVE,
    monochrome: true,
  },
  {
    id: "gekiga",
    label: "劇画",
    description: "リアルで重厚な描き込み",
    prompt: "monochrome, greyscale, manga, gekiga style, realistic proportions, heavy cross-hatching, dramatic shadows, detailed ink",
    negative: MONO_NEGATIVE,
    monochrome: true,
  },
  {
    id: "gag",
    label: "ゆるギャグ",
    description: "シンプルでデフォルメの効いた絵",
    prompt: "monochrome, greyscale, manga, chibi, gag manga style, simple clean lineart, exaggerated comedic expressions",
    negative: MONO_NEGATIVE,
    monochrome: true,
  },
  {
    id: "color",
    label: "フルカラーWebtoon",
    description: "明るいデジタル彩色",
    prompt: "full color, webtoon style, clean digital lineart, vibrant cel shading, soft gradients",
    negative: COLOR_NEGATIVE,
  },
  {
    id: "picturebook",
    label: "水彩絵本",
    description: "やわらかい水彩タッチ",
    prompt: "watercolor, picture book illustration, soft pastel colors, hand-drawn pencil lines, warm and cozy",
    negative: COLOR_NEGATIVE,
  },
];

export function resolveStyle(styleId: string, customStyle: string): Style {
  const custom = (customStyle || "").trim();
  if (styleId === "custom" && custom) {
    return { id: "custom", label: custom.slice(0, 40), prompt: custom, negative: "" };
  }
  const preset = STYLES.find((s) => s.id === styleId) || STYLES[0];
  // プリセットに補足指定がある場合は連結する
  return custom ? { ...preset, prompt: `${preset.prompt}, ${custom}` } : { ...preset };
}
