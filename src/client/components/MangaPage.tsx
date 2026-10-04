// 漫画の1ページを描く（表示・サムネイル・印刷で共通）
import type { CSSProperties } from "react";
import type { Bubble, DynamicLayout, Page, Panel, PanelGeometry } from "../../shared/types.ts";
import { PAGE_STATUS_LABEL } from "../labels.ts";

interface Props {
  page: Page;
  thumb?: boolean; // サムネイル（吹き出しや文字を出さない）
  onPanelClick?: (index: number) => void; // 指定するとコマをクリックできる
}

export function MangaPage({ page, thumb = false, onPanelClick }: Props) {
  if (!page.layout || !page.panels.length) return <EmptyPage page={page} thumb={thumb} />;
  return <LaidOutPage page={page} layout={page.layout} thumb={thumb} onPanelClick={onPanelClick} />;
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const box = (g: PanelGeometry): CSSProperties => ({ left: pct(g.x), top: pct(g.y), width: pct(g.w), height: pct(g.h) });

// コマは多角形で切り抜き、枠線は SVG で描く。
// 吹き出しは切り抜かない別レイヤーに置くので、漫画のように枠からはみ出せる
function LaidOutPage({ page, layout, thumb, onPanelClick }: Props & { layout: DynamicLayout }) {
  const geo = layout.panels;
  return (
    <div className={`page ${thumb ? "thumb-page" : ""}`}>
      {page.panels.map((panel, i) => geo[i] && (
        <div
          key={i}
          className={`panel ${onPanelClick ? "clickable" : ""}`}
          style={{ ...box(geo[i]), clipPath: `polygon(${geo[i].poly.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})` }}
          title={onPanelClick ? panel.description : undefined}
          onClick={onPanelClick && (() => onPanelClick(i))}
        >
          <PanelImage panel={panel} thumb={thumb} />
        </div>
      ))}
      <svg className="frames" viewBox="0 0 1000 1414" preserveAspectRatio="none" aria-hidden="true">
        {geo.map((g, i) => (
          <polygon key={i} points={g.corners.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1414).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      {!thumb && page.panels.map((panel, i) => geo[i] && panel.bubbles.length > 0 && (
        <div key={i} className="bubble-layer" style={box(geo[i])}>
          <Bubbles bubbles={panel.bubbles} />
        </div>
      ))}
    </div>
  );
}

function EmptyPage({ page, thumb }: Props) {
  return (
    <div className={`page empty-page ${thumb ? "thumb-page" : ""}`}>
      {!thumb && (
        <div className="page-status">
          {page.status === "error" ? "⚠ 生成に失敗しました" : <><div className="spinner" />{PAGE_STATUS_LABEL[page.status]}…</>}
        </div>
      )}
    </div>
  );
}

function Bubbles({ bubbles }: { bubbles: Bubble[] }) {
  return bubbles.map((b, i) => <div key={i} className={`bubble ${b.type} ${b.position}`}>{b.text}</div>);
}

function PanelImage({ panel, thumb }: { panel: Panel; thumb?: boolean }) {
  const img = panel.image;
  if (img?.url && img.status !== "drawing") return <img src={img.url} alt={panel.description} loading="lazy" />;
  if (img?.status === "error") {
    return <div className="panel-status error">{thumb ? "⚠" : <>⚠ 描画失敗<br /><small>クリックで描き直し</small></>}</div>;
  }
  return (
    <div className="panel-status">
      {!thumb && <><div className="spinner small" /><small>{img?.status === "drawing" ? "作画中" : "待機中"}</small></>}
    </div>
  );
}
