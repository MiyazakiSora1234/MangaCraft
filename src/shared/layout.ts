// 内容に応じたコマ割り（サーバ・画面共通）
// 各コマの size（大きさ）・shot（カメラの距離）・intensity（緊張感）から、
// 段の分け方・コマの幅と高さ・斜めの枠線を組み立てる。
// 座標はページ幅 = 1、ページ高さ = 1 に正規化して保存する。
import type { DynamicLayout, PanelIntensity, PanelScript, PanelShot, PanelSize } from "./types.ts";

export const MAX_PANELS = 7;
const PAGE_ASPECT = 1.414; // ページの高さ / 幅（B判に近い比率）

const SIZE_WEIGHT: Record<PanelSize, number> = { small: 1, medium: 1.5, large: 2.4, splash: 3.6 };
const SHOT_WIDTH: Record<PanelShot, number> = { wide: 1.3, medium: 1, closeup: 0.85 };
const INTENSITY: Record<PanelIntensity, number> = { calm: 0, tense: 1, action: 2 };

// 余白と枠の間隔（ページ幅を 1 とした値）
const MARGIN = 0.06;
const GUTTER_X = 0.014; // 同じ段のコマの間
const GUTTER_Y = 0.024; // 段と段の間（漫画らしく横の間隔より広め）

type PanelInfo = Pick<PanelScript, "size" | "shot" | "intensity">;

// 段 = セルの配列、セル = コマ番号の配列（2 つ以上なら縦に積む）
type Cell = number[];
type Tier = Cell[];
type Point = [number, number];
interface HLine { a: number; b: number } // y = a + b*x（横方向の線）
interface VLine { c: number; d: number } // x = c + d*y（縦方向の線）

function makeRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isBig = (p?: PanelInfo) => p !== undefined && (p.size === "large" || p.size === "splash");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// コマを段に分ける
function groupTiers(info: PanelInfo[], rand: () => number): Tier[] {
  const n = info.length;
  const tiers: Tier[] = [];
  let i = 0;
  while (i < n) {
    const rest = n - i;
    const p = info[i];
    if (p.size === "splash" || (p.size === "large" && rest === 1)) {
      tiers.push([[i]]);
      i += 1;
      continue;
    }
    if (p.size === "large") {
      const a = info[i + 1], b = info[i + 2];
      if (rest >= 3 && !isBig(a) && !isBig(b) && rand() < 0.6) {
        tiers.push([[i], [i + 1, i + 2]]); // 大ゴマ＋小ゴマ2つを縦積み
        i += 3;
      } else if (rest >= 2 && !isBig(a) && rand() < 0.5) {
        tiers.push([[i], [i + 1]]);
        i += 2;
      } else {
        tiers.push([[i]]);
        i += 1;
      }
      continue;
    }
    if (p.shot === "wide" && rest > 1 && rand() < 0.4) {
      tiers.push([[i]]); // 状況説明の引きの絵は横長 1 段
      i += 1;
      continue;
    }
    const want = rest >= 3 && rand() < 0.4 ? 3 : Math.min(2, rest);
    const row: Tier = [[i]];
    for (let j = 1; j < want; j++) {
      if (isBig(info[i + j])) break;
      row.push([i + j]);
    }
    // 3 コマの段は、ときどき後ろ 2 つを縦に積む
    if (row.length === 3 && rand() < 0.35) row.splice(1, 2, [row[1][0], row[2][0]]);
    tiers.push(row);
    i += sum(row.map((c) => c.length));
  }

  // 段が多すぎると窮屈なので、隣り合う段をまとめて 4 段以内にする
  const count = (t: Tier) => sum(t.map((c) => c.length));
  while (tiers.length > 4) {
    let best = -1;
    for (let k = 0; k < tiers.length - 1; k++) {
      const merged = [...tiers[k], ...tiers[k + 1]];
      if (merged.length > 3 || merged.some((c) => c.some((idx) => info[idx].size === "splash"))) continue;
      if (best < 0 || count(merged) < count([...tiers[best], ...tiers[best + 1]])) best = k;
    }
    if (best < 0) break;
    tiers.splice(best, 2, [...tiers[best], ...tiers[best + 1]]);
  }
  return tiers;
}

function intersect(h: HLine, v: VLine): Point {
  const x = (v.c + v.d * h.a) / (1 - v.d * h.b);
  return [x, h.a + h.b * x];
}

export function buildLayout(info: PanelInfo[], seed = ""): DynamicLayout {
  const rand = makeRandom(String(seed));
  const tiers = groupTiers(info, rand);
  const H = PAGE_ASPECT;
  const left = MARGIN, right = 1 - MARGIN, top = MARGIN, bottom = H - MARGIN;

  const weight = (idx: number) => SIZE_WEIGHT[info[idx].size];
  const tierWeight = (tier: Tier) => Math.max(1, ...tier.map((cell) =>
    cell.length === 1 ? weight(cell[0]) : sum(cell.map(weight)) * 0.65));
  const tierIntensity = (tier: Tier) => Math.max(...tier.flat().map((idx) => INTENSITY[info[idx].intensity]));
  const slantChance = (level: number) => (level >= 2 ? 0.75 : level === 1 ? 0.3 : 0);
  const sign = () => (rand() < 0.5 ? -1 : 1);

  // 段の高さ
  const tw = tiers.map(tierWeight);
  const availH = bottom - top - GUTTER_Y * (tiers.length - 1);
  const heights = tw.map((w) => (w / sum(tw)) * availH);

  // 段の境界線（緊迫した段の前後は斜めにする）
  const hLines: HLine[] = [{ a: top, b: 0 }];
  let y = top;
  for (let k = 0; k < tiers.length - 1; k++) {
    y += heights[k];
    const base = y + GUTTER_Y / 2;
    const level = Math.max(tierIntensity(tiers[k]), tierIntensity(tiers[k + 1]));
    const s = rand() < slantChance(level) ? (0.02 + rand() * 0.02) * sign() : 0;
    const b = (2 * s) / (right - left);
    hLines.push({ a: base - s - b * left, b });
    y += GUTTER_Y;
  }
  hLines.push({ a: bottom, b: 0 });
  const shift = (line: HLine, dy: number): HLine => ({ a: line.a + dy, b: line.b });

  const out: Point[][] = [];
  let tierTop = top;
  tiers.forEach((tier, k) => {
    const topLine = k === 0 ? hLines[0] : shift(hLines[k], GUTTER_Y / 2);
    const bottomLine = k === tiers.length - 1 ? hLines[k + 1] : shift(hLines[k + 1], -GUTTER_Y / 2);
    const yMid = tierTop + heights[k] / 2;

    // セルの幅（右から読む順に並べる）
    const cw = tier.map((cell) => (cell.length === 1
      ? weight(cell[0]) * SHOT_WIDTH[info[cell[0]].shot]
      : Math.max(...cell.map(weight)) * 1.1));
    const availW = right - left - GUTTER_X * (tier.length - 1);
    const widths = cw.map((w) => (w / sum(cw)) * availW);

    // 縦の境界線（右から順に）。アクションの段では斜めにする
    const vLines: VLine[] = [{ c: right, d: 0 }];
    let x = right;
    const level = tierIntensity(tier);
    for (let j = 0; j < tier.length - 1; j++) {
      x -= widths[j];
      const xc = x - GUTTER_X / 2;
      const dx = rand() < slantChance(level) ? (0.03 + rand() * 0.03) * sign() : 0;
      const d = dx / heights[k];
      vLines.push({ c: xc - d * yMid, d });
      x -= GUTTER_X;
    }
    vLines.push({ c: left, d: 0 });

    tier.forEach((cell, j) => {
      const rightLine = j === 0 ? vLines[0] : { c: vLines[j].c - GUTTER_X / 2, d: vLines[j].d };
      const leftLine = j === tier.length - 1 ? vLines[j + 1] : { c: vLines[j + 1].c + GUTTER_X / 2, d: vLines[j + 1].d };
      const quad = (t: HLine, b: HLine) => [intersect(t, leftLine), intersect(t, rightLine), intersect(b, rightLine), intersect(b, leftLine)];
      if (cell.length === 1) {
        out[cell[0]] = quad(topLine, bottomLine);
        return;
      }
      // 縦に積むセル：セル中央での上下端の位置から、重みに応じて水平に区切る
      const mid = { a: yMid, b: 0 };
      const cx = (intersect(mid, leftLine)[0] + intersect(mid, rightLine)[0]) / 2;
      const yTop = topLine.a + topLine.b * cx;
      const yBottom = bottomLine.a + bottomLine.b * cx;
      const ws = cell.map(weight);
      const avail = yBottom - yTop - GUTTER_X * (cell.length - 1);
      let cy = yTop;
      cell.forEach((idx, m) => {
        const t = m === 0 ? topLine : { a: cy, b: 0 };
        cy += (ws[m] / sum(ws)) * avail;
        const b = m === cell.length - 1 ? bottomLine : { a: cy, b: 0 };
        out[idx] = quad(t, b);
        cy += GUTTER_X;
      });
    });
    tierTop += heights[k] + GUTTER_Y;
  });

  const r = (v: number) => Math.round(v * 10000) / 10000;
  return {
    type: "dynamic",
    seed: String(seed),
    panels: out.map((corners) => {
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return {
        x: r(x0), y: r(y0 / H), w: r(x1 - x0), h: r((y1 - y0) / H),
        aspect: r((x1 - x0) / (y1 - y0)),
        corners: corners.map(([px, py]): Point => [r(px), r(py / H)]),
        poly: corners.map(([px, py]): Point => [r(((px - x0) / (x1 - x0)) * 100), r(((py - y0) / (y1 - y0)) * 100)]),
      };
    }),
  };
}
