import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBubbles } from "../src/shared/bubbles.ts";
import type { Project } from "../src/shared/types.ts";
import { finalizePlan, normalizeScript, withCoverage } from "../src/server/llm/output.ts";
import { minPanelsFor, pagePrompt } from "../src/server/llm/prompts.ts";

test("finalizePlan はページ数をそろえ、欠けた項目を補う", () => {
  const plan = finalizePlan({ title: " 題 ", characters: [{ name: "A" }, { name: "" }], pages: [{ summary: "s1", beats: ["b1", ""] }] }, { pageCount: 3, title: "" });
  assert.equal(plan.title, "題");
  assert.deepEqual(plan.characters, [{ name: "A", role: "", appearance: "" }]);
  assert.equal(plan.pages.length, 3);
  assert.deepEqual(plan.pages[0], { page: 1, summary: "s1", beats: ["b1"] });
  assert.deepEqual(plan.pages[2], { page: 3, summary: "（物語の続き）", beats: ["（物語の続き）"] });
});

test("normalizeScript は不正な値を既定値に直す", () => {
  const { panels } = normalizeScript({ panels: [{ description: "d", size: "huge", bubbles: [{ text: " やあ ", type: "?", position: "?" }, { text: "" }] }] });
  assert.equal(panels[0].size, "medium");
  assert.equal(panels[0].imagePrompt, "d");
  assert.deepEqual(panels[0].bubbles, [{ speaker: "", text: "やあ", type: "speech", position: "top-right" }]);
  assert.throws(() => normalizeScript({ panels: [] }));
});

test("normalizeBubbles は上限と文字数を守る", () => {
  const bubbles = normalizeBubbles([{ text: "1" }, { text: "" }, { text: "2" }, { text: "3" }, { text: "x".repeat(100), speaker: "y".repeat(40) }], { max: 4, textLength: 80, speakerLength: 30 });
  assert.equal(bubbles.length, 4);
  assert.equal(bubbles[3].text.length, 80);
  assert.equal(bubbles[3].speaker.length, 30);
});

test("withCoverage はコマが足りなければ作り直し、最もコマの多い結果を使う", async () => {
  const results = [1, 3, 2].map((n) => ({ panels: Array.from({ length: n }, () => ({}) as never) }));
  let calls = 0;
  const script = await withCoverage(async () => results[calls++], 5, 3);
  assert.equal(calls, 3);
  assert.equal(script.panels.length, 3);
});

test("ページのプロンプトに総ページ数と前後のつながりが入る", () => {
  const project = {
    title: "灯火", logline: "", input: { synopsis: "あらすじ", pageCount: 2, title: "" }, facts: [],
    characters: [], outline: [{ page: 1, summary: "s1", beats: ["a", "b"] }, { page: 2, summary: "s2", beats: ["c"] }],
    pages: [{ number: 1, panels: [] }, { number: 2, panels: [] }],
  } as unknown as Project;
  const prompt = pagePrompt({ project, pageNumber: 1, instruction: "" });
  assert.match(prompt, /（全2ページ）/);
  assert.match(prompt, /次のページ（2ページ目）の最初の場面\n {2}- c/);
  assert.equal(minPanelsFor(project.outline[0]), 2);
});
