import type { PageScript, Plan } from "./llm/output.ts";

// 成人向け（R18）作品の安全策。登場人物はすべて成人とし、未成年を想起させる内容は作らない。
// 入力・LLM の出力・画像のプロンプトの各段階で確認する。

export const ADULT_MIN_AGE = 20;

// 未成年や学校を想起させる言葉（日本語・英語）。誤検出（大学生など）は安全側に倒して許容する
const MINOR_PATTERN = new RegExp(
  [
    "小学", "中学", "高校", "女子高", "男子高", "JK", "JC", "JS", "DK", "DC",
    "ロリ", "ショタ", "幼女", "幼児", "幼い", "幼少", "児童", "子供", "子ども", "こども", "少女", "少年",
    "未成年", "学生", "生徒", "制服", "ランドセル", "園児", "赤ちゃん", "娘さん",
    "(?<![0-9０-９])(?:[1-9]|1[0-9]|[１-９]|１[０-９])\\s*(?:歳|才)",
    "\\bloli", "\\bshota", "\\bchild", "\\bchildren", "\\bkids?\\b", "\\bteen", "\\bunderage", "\\bminor\\b",
    "\\bschool", "\\bstudent", "\\bjunior high", "\\bhigh school", "\\belementary", "\\btoddler", "\\binfant", "\\bbaby\\b",
    "\\blittle girl", "\\blittle boy", "\\byoung girl", "\\byoung boy",
  ].join("|"),
  "i",
);

// 未成年を想起させる言葉があれば、その言葉を返す
export function findMinorReference(...texts: string[]): string | null {
  for (const text of texts) {
    const m = text.match(MINOR_PATTERN);
    if (m) return m[0];
  }
  return null;
}

export class MinorReferenceError extends Error {
  constructor(where: string, word: string) {
    super(`${where}に未成年を想起させる言葉（「${word}」）が含まれるため、成人向けの作品では使えません。`);
  }
}

export function assertNoMinorReference(where: string, ...texts: string[]): void {
  const word = findMinorReference(...texts);
  if (word) throw new MinorReferenceError(where, word);
}

// 画像のプロンプトから幼さを示す言葉を取り除き、成人であることを明示する
const YOUTHFUL_WORDS = /\b(?:loli\w*|shota\w*|child\w*|kids?|teen\w*|underage|minor|petite|small breasts|flat chest|young|little|tiny|cute girl|schoolgirl|schoolboy|school uniform|randoseru|1girl|1boy|girl|boy)\b/gi;

export const ADULT_POSITIVE = "adult, mature, nsfw";
export const ADULT_NEGATIVE = "child, loli, shota, teen, underage, young, petite, flat chest, small body, childlike, school uniform, randoseru";

export function adultify(text: string): string {
  return text
    .replace(YOUTHFUL_WORDS, "")
    .split(",")
    .map((s) => s.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

// LLM が作った構成の確認：全員が成人で、未成年を想起させる内容がないこと
export function assertAdultPlan(plan: Plan): void {
  for (const c of plan.characters) {
    if (c.age === null || c.age < ADULT_MIN_AGE) {
      throw new Error(`登場人物「${c.name}」の年齢が${ADULT_MIN_AGE}歳未満（${c.age ?? "不明"}）のため、成人向けの作品にできません。`);
    }
  }
  assertNoMinorReference(
    "構成",
    plan.title, plan.logline, ...plan.facts,
    ...plan.characters.flatMap((c) => [c.name, c.role, c.appearance]),
    ...plan.pages.flatMap((p) => [p.summary, ...p.beats]),
  );
}

// LLM が作ったネームの確認
export function assertAdultScript(script: PageScript): void {
  assertNoMinorReference("ネーム", ...script.panels.flatMap((p) => [p.description, p.imagePrompt, ...p.bubbles.map((b) => b.text)]));
}
