import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAdultPlan, assertAdultScript, findMinorReference } from "../src/server/adult.ts";
import { buildImagePrompt } from "../src/server/images/prompt.ts";
import type { Plan } from "../src/server/llm/output.ts";

test("未成年や学校を想起させる言葉を見つける", () => {
  for (const text of ["女子高生の二人が", "少女と出会う", "17歳の主人公", "１７歳", "制服姿で", "a schoolgirl walks", "loli", "young girl", "teenage boy", "中学の同級生"]) {
    assert.ok(findMinorReference(text), `見逃し: ${text}`);
  }
});

test("成人の設定はそのまま通す", () => {
  for (const text of ["25歳の会社員の女性", "27歳", "120歳の魔女", "adult woman, long hair", "大人の二人が夜の街で出会う"]) {
    assert.equal(findMinorReference(text), null, `誤検出: ${text}`);
  }
});

const plan = (age: number | null, appearance = "adult woman, long hair"): Plan => ({
  facts: [], title: "題", logline: "紹介",
  characters: [{ name: "A", role: "主人公", age, appearance }],
  pages: [{ page: 1, summary: "s", beats: ["b"] }],
});

test("構成は全員が 20 歳以上でなければ通さない", () => {
  assert.doesNotThrow(() => assertAdultPlan(plan(20)));
  assert.throws(() => assertAdultPlan(plan(19)), /20歳未満/);
  assert.throws(() => assertAdultPlan(plan(null)), /20歳未満/);
  assert.throws(() => assertAdultPlan(plan(25, "petite schoolgirl")), /未成年/);
});

test("ネームに未成年を想起させる内容があれば通さない", () => {
  const script = (text: string) => ({ panels: [{ description: text, size: "medium", shot: "medium", intensity: "calm", characters: [], imagePrompt: "", bubbles: [] }] }) as never;
  assert.doesNotThrow(() => assertAdultScript(script("二人が夜の部屋で見つめ合う")));
  assert.throws(() => assertAdultScript(script("放課後の教室で、生徒が")));
});

test("成人向けの画像プロンプトは幼さを示す語を除き、成人を明示する", () => {
  const prompt = buildImagePrompt({
    panel: { imagePrompt: "a young girl, petite, smiling", characters: ["A"] },
    style: { id: "s", label: "s", prompt: "monochrome" },
    characters: [{ name: "A", role: "", age: 25, appearance: "1girl, long black hair" }],
    rating: "adult",
  });
  assert.doesNotMatch(prompt.positive, /\b(?:girl|young|petite|1girl)\b/i);
  assert.match(prompt.positive, /\badult\b/);
  assert.match(prompt.negative, /\bchild\b.*\bloli\b/);
});

test("人数付き・複数形の girl / boy タグも取り除く", () => {
  const prompt = buildImagePrompt({
    panel: { imagePrompt: "2girls, 1boy, schoolgirls, young women", characters: [] },
    style: { id: "s", label: "s", prompt: "monochrome" },
    characters: [],
    rating: "adult",
  });
  assert.doesNotMatch(prompt.positive, /girls?|boys?|young/i);
  assert.match(prompt.positive, /\bwomen\b/);
});

test("全年齢の画像プロンプトには成人向けの指定を入れない", () => {
  const prompt = buildImagePrompt({
    panel: { imagePrompt: "a girl smiling", characters: [] },
    style: { id: "s", label: "s", prompt: "monochrome" },
    characters: [],
    rating: "general",
  });
  assert.doesNotMatch(prompt.positive, /nsfw/);
  assert.match(prompt.positive, /girl/);
});
