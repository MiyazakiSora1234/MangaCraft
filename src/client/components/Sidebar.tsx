// 作品画面の右側：ページの内容と操作、絵柄の見本、登場人物
import { isPageBusy, type Page, type Project, type StyleRef } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useAction } from "../hooks/toast.tsx";
import { PAGE_STATUS_LABEL } from "../labels.ts";

interface Props {
  project: Project;
  page: Page;
  onRegenerate: () => void;
  onRelayout: (page: Page) => void;
  onStyleRefChange: (styleRef: StyleRef | null) => void;
}

export function Sidebar({ project, page, onRegenerate, onRelayout, onStyleRefChange }: Props) {
  const run = useAction();
  const outline = project.outline[page.number - 1];
  const busy = isPageBusy(page);

  const relayout = () => run(async () => onRelayout(await api.relayoutPage(project.id, page.number)));
  const clearStyleRef = () => run(async () => {
    await api.clearStyleRef(project.id);
    onStyleRefChange(null);
  });

  return (
    <aside className="side card">
      <div className="side-head">
        <h2>{page.number}ページ目</h2>
        <span className={`tag ${page.status}`}>{PAGE_STATUS_LABEL[page.status]}</span>
      </div>
      <p>{outline?.summary}</p>
      {outline?.beats?.length ? <ol className="beats">{outline.beats.map((b, i) => <li key={i}>{b}</li>)}</ol> : null}
      {page.error && <p className="error-text">{page.error}</p>}

      <button className="btn primary block" disabled={busy} onClick={onRegenerate}>このページを作り直す</button>
      <button
        className="btn ghost block relayout" disabled={busy || !page.panels.length} onClick={relayout}
        title="絵とセリフはそのままで、コマの配置だけ組み直します"
      >
        コマ割りだけ変える
      </button>
      <p className="hint muted">コマをクリックすると、セリフの修正やそのコマだけの描き直しができます。</p>

      <div className="style-ref">
        <h3>絵柄の見本</h3>
        {project.styleRef ? (
          <div className="style-ref-body">
            <img src={project.styleRef.url} alt="絵柄の見本" />
            <div>
              <small className="muted">
                {project.styleRef.page}ページ目・コマ{project.styleRef.panel + 1}{project.styleRef.auto ? "（自動で選択）" : ""}
                <br />この絵の画風に揃えて描きます。
              </small>
              <button className="link-btn" onClick={clearStyleRef}>解除</button>
            </div>
          </div>
        ) : (
          <small className="muted">最初に描けたコマが自動で見本になります。コマをクリックして選ぶこともできます。</small>
        )}
      </div>

      <details className="cast">
        <summary>登場人物（{project.characters.length}）</summary>
        <ul>
          {project.characters.map((c) => <li key={c.name}><strong>{c.name}</strong> <small className="muted">{c.role}</small></li>)}
        </ul>
      </details>
    </aside>
  );
}
