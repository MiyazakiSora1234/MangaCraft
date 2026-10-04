import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImagePrompt, contentOnly } from "../src/server/images/prompt.ts";
import { sdSize } from "../src/server/images/sizes.ts";

test("作画指示から画風の言葉を取り除く", () => {
  assert.equal(contentOnly("Wide shot, cinematic lighting, manga style, a girl runs, black and white"), "Wide shot, lighting, a girl runs");
});

test("プロンプトは絵柄 → 人物 → 場面の順で、ネガティブに絵柄の指定が入る", () => {
  const prompt = buildImagePrompt({
    panel: { imagePrompt: "a girl runs", characters: ["ルナ"] },
    style: { id: "s", label: "s", prompt: "monochrome", negative: "color", monochrome: true },
    characters: [{ name: "ルナ", role: "", age: 20, appearance: "1girl, brown hair" }, { name: "クロ", role: "", age: null, appearance: "black cat" }],
    rating: "general",
  });
  assert.equal(prompt.positive, "monochrome, masterpiece, best quality, 1girl, brown hair, a girl runs");
  assert.ok(prompt.negative.startsWith("color, "));
  assert.equal(prompt.monochrome, true);
});

test("コマの縦横比に近い生成サイズを選ぶ", () => {
  assert.deepEqual(sdSize(1), [1024, 1024]);
  assert.deepEqual(sdSize(3), [1536, 640]); // 横長のコマ
  assert.deepEqual(sdSize(0.6), [768, 1344]); // 縦長のコマ
});
