// 作品の画面：構成中・構成失敗・ページの閲覧と作り直し
import { useEffect, useRef, useState } from "react";
import { isPageBusy, type Page, type Project } from "../../shared/types.ts";
import { api } from "../api.ts";
import { replacePageInUrl } from "../hooks/route.ts";
import { useAction, useToast } from "../hooks/toast.tsx";
import { useProject } from "../hooks/useProject.ts";
import { MangaPage } from "./MangaPage.tsx";
import { PageDialog } from "./PageDialog.tsx";
import { PanelDialog } from "./PanelDialog.tsx";
import { PrintButton } from "./PrintButton.tsx";
import { Sidebar } from "./Sidebar.tsx";

export function ProjectPage({ id, initialPage }: { id: string; initialPage: number }) {
  const { project, setProject, error, reload, busy } = useProject(id);
  const run = useAction();

  if (error) {
    return <div className="card center"><p>{error}</p><a className="btn" href="#/">戻る</a></div>;
  }
  if (!project) return null;

  if (project.status === "planning") {
    return (
      <div className="card center generating">
        <div className="spinner" />
        <h2>ストーリーを構成しています…</h2>
        <p className="muted">登場人物と{project.input.pageCount}ページ分の展開を考えています。1分ほどお待ちください。</p>
        <blockquote>{project.input.synopsis}</blockquote>
      </div>
    );
  }

  if (project.status === "error" && !project.pages.length) {
    return (
      <div className="card center">
        <h2>ストーリーの構成に失敗しました</h2>
        <p className="error-text">{project.error}</p>
        <div className="row-actions center">
          <a className="btn ghost" href="#/">戻る</a>
          <button className="btn primary" onClick={() => run(async () => { await api.retryPlan(id); await reload(); })}>もう一度試す</button>
        </div>
      </div>
    );
  }

  return <Viewer project={project} setProject={setProject} reload={reload} busy={busy} initialPage={initialPage} />;
}

interface ViewerProps {
  project: Project;
  setProject: (p: Project) => void;
  reload: () => Promise<void>;
  busy: boolean;
  initialPage: number;
}

function Viewer({ project, setProject, reload, busy, initialPage }: ViewerProps) {
  const toast = useToast();
  const total = project.pages.length;
  const clampPage = (n: number) => Math.min(Math.max(1, n), total);
  const [current, setCurrent] = useState(() => clampPage(initialPage));
  // URL のページ番号が外から変わったとき（直接入力・戻る / 進む）に追従する
  useEffect(() => {
    setCurrent(Math.min(Math.max(1, initialPage), total));
  }, [initialPage, total]);
  const [dialog, setDialog] = useState<{ type: "page" } | { type: "panel"; index: number } | null>(null);

  const page = project.pages[current - 1];
  const pageBusy = isPageBusy(page);
  const done = project.pages.filter((p) => p.status === "done").length;

  const goPage = (n: number) => {
    if (n < 1 || n > total) return;
    setCurrent(n);
    replacePageInUrl(project.id, n);
  };

  // ←→ キーでページ送り（入力中やダイアログ表示中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || (e.target instanceof Element && e.target.matches("input,textarea,select"))) return;
      if (e.key === "ArrowRight") goPage(current + 1);
      if (e.key === "ArrowLeft") goPage(current - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // 表示中のページのサムネイルが見えるよう、サムネイル列だけを横にスクロールする
  const thumbsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = thumbsRef.current;
    const active = strip?.querySelector<HTMLElement>(".thumb.active");
    if (!strip || !active) return;
    if (active.offsetLeft < strip.scrollLeft || active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
    }
  }, [current]);

  // ページ・コマの一部だけを書き換える
  const updatePage = (n: number, next: Page) => setProject({ ...project, pages: project.pages.map((p) => (p.number === n ? next : p)) });

  const onPanelClick = (index: number) => {
    if (pageBusy) toast("このページは生成中です");
    else setDialog({ type: "panel", index });
  };

  return (
    <>
      <div className="project-head">
        <div>
          <a href="#/" className="back">← 作品一覧</a>
          <h1>{project.title}</h1>
          <p className="muted">{project.logline}</p>
        </div>
        <div className="head-actions">
          <div className="progress" title={`${done}/${total}ページ完成`}>
            <div className="progress-bar" style={{ width: `${(done / total) * 100}%` }} />
            <span>{done} / {total} ページ完成</span>
          </div>
          <PrintButton pages={project.pages} disabled={busy} />
        </div>
      </div>

      <div className="viewer">
        <div className="stage">
          <button className="nav-btn" disabled={current <= 1} aria-label="前のページ" onClick={() => goPage(current - 1)}>‹</button>
          <div className="page-wrap"><MangaPage page={page} onPanelClick={onPanelClick} /></div>
          <button className="nav-btn" disabled={current >= total} aria-label="次のページ" onClick={() => goPage(current + 1)}>›</button>
        </div>
        <Sidebar
          project={project}
          page={page}
          onRegenerate={() => setDialog({ type: "page" })}
          onRelayout={(next) => updatePage(page.number, next)}
          onStyleRefChange={(styleRef) => setProject({ ...project, styleRef })}
        />
      </div>

      <nav className="thumbs" aria-label="ページ一覧" ref={thumbsRef}>
        {project.pages.map((pg) => (
          <button key={pg.number} className={`thumb ${pg.number === current ? "active" : ""}`} onClick={() => goPage(pg.number)}>
            <MangaPage page={pg} thumb />
            <span>{pg.number}{isPageBusy(pg) ? " ⋯" : pg.status === "error" ? " ⚠" : ""}</span>
          </button>
        ))}
      </nav>

      {dialog?.type === "page" && (
        <PageDialog
          project={project}
          pageNumber={current}
          summary={`${current}ページ目：${project.outline[current - 1]?.summary || ""}`}
          onClose={() => setDialog(null)}
          onStarted={reload}
        />
      )}
      {dialog?.type === "panel" && (
        <PanelDialog
          project={project}
          pageNumber={current}
          index={dialog.index}
          onClose={() => setDialog(null)}
          onPanelSaved={(panel) => updatePage(page.number, { ...page, panels: page.panels.map((p, i) => (i === dialog.index ? panel : p)) })}
          onStyleRefChange={(styleRef) => setProject({ ...project, styleRef })}
          onStarted={reload}
        />
      )}
    </>
  );
}

