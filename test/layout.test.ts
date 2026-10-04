import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLayout, MAX_PANELS } from "../src/shared/layout.ts";
import { PANEL_INTENSITIES, PANEL_SHOTS, PANEL_SIZES } from "../src/shared/types.ts";

const P = (size: string, shot: string, intensity: string) => ({ size, shot, intensity }) as never;

test("同じシードなら同じコマ割りになる", () => {
  const panels = [P("medium", "wide", "calm"), P("small", "closeup", "tense"), P("large", "medium", "action")];
  assert.deepEqual(buildLayout(panels, "s"), buildLayout(panels, "s"));
});

test("どの組み合わせでもコマはページ内に収まり、コマ数どおりに作られる", () => {
  for (let t = 0; t < 500; t++) {
    const n = 1 + (t % MAX_PANELS);
    const panels = Array.from({ length: n }, (_, i) => P(
      PANEL_SIZES[(t + i) % PANEL_SIZES.length],
      PANEL_SHOTS[(t * 3 + i) % PANEL_SHOTS.length],
      PANEL_INTENSITIES[(t + i * 2) % PANEL_INTENSITIES.length],
    ));
    const layout = buildLayout(panels, `seed-${t}`);
    assert.equal(layout.panels.length, n);
    for (const g of layout.panels) {
      assert.ok(g.w > 0.05 && g.h > 0.03, `小さすぎるコマ: ${JSON.stringify(g)}`);
      assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= 1.0001 && g.y + g.h <= 1.0001, `はみ出したコマ: ${JSON.stringify(g)}`);
      assert.equal(g.corners.length, 4);
    }
  }
});

test("決めゴマ（splash）は1段を占める", () => {
  const layout = buildLayout([P("small", "closeup", "calm"), P("splash", "wide", "action"), P("small", "closeup", "calm")], "x");
  const splash = layout.panels[1];
  assert.ok(splash.w > 0.85, "横幅いっぱいになる");
  assert.ok(splash.h > layout.panels[0].h, "ほかのコマより高い");
});

test("読む順は右から左", () => {
  const layout = buildLayout([P("medium", "medium", "calm"), P("medium", "medium", "calm")], "rtl");
  const [first, second] = layout.panels;
  if (Math.abs(first.y - second.y) < 0.01) assert.ok(first.x > second.x);
});
