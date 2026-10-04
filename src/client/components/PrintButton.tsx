// 全ページを印刷用の領域に描き、画像の読み込みを待ってから印刷する
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Page } from "../../shared/types.ts";
import { MangaPage } from "./MangaPage.tsx";

export function PrintButton({ pages, disabled }: { pages: Page[]; disabled: boolean }) {
  const [printing, setPrinting] = useState(false);
  const area = document.getElementById("print-area")!;

  useEffect(() => {
    if (!printing) return;
    const images = [...area.querySelectorAll("img")];
    images.forEach((img) => { img.loading = "eager"; });
    Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))))
      .then(() => window.print())
      .finally(() => setPrinting(false));
  }, [printing, area]);

  return (
    <>
      <button className="btn ghost small" disabled={disabled} onClick={() => setPrinting(true)}>印刷・PDF保存</button>
      {printing && createPortal(pages.map((p) => <div key={p.number} className="print-page"><MangaPage page={p} /></div>), area)}
    </>
  );
}
