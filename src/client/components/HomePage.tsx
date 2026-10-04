// ホーム：作成フォームと作品一覧
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { normalizeModelName, type ContentRating, type ModelInfo, type ProjectSummary } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useConfig } from "../config.ts";
import { projectHash } from "../hooks/route.ts";
import { useAction, useToast } from "../hooks/toast.tsx";
import { PROJECT_STATUS_LABEL } from "../labels.ts";

export function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>あらすじから、漫画をつくる。</h1>
        <p className="muted">ストーリーの概要・ページ数・絵柄を決めるだけ。AIがページ構成、コマ割り、セリフ、作画まで仕上げます。</p>
      </section>
      <CreateForm />
      <section>
        <h2 className="section-title">作品一覧</h2>
        <ProjectList />
      </section>
    </>
  );
}

function CreateForm() {
  const { styles, maxPages, defaultModels, mock } = useConfig();
  const toast = useToast();
  const [synopsis, setSynopsis] = useState("");
  const [title, setTitle] = useState("");
  const [pageCount, setPageCount] = useState(4);
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "custom");
  const [customStyle, setCustomStyle] = useState("");
  const [rating, setRating] = useState<ContentRating>("general");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Ollama に入っているモデルを読み込む
  useEffect(() => {
    api.listModels().then(setModels, (err: Error) => setModelError(err.message));
  }, []);

  // 年齢区分を変えたら、その区分の既定のモデルを選び直す（入っていなければ一覧の先頭）
  useEffect(() => {
    if (!models?.length) return;
    const preferred = normalizeModelName(defaultModels[rating]);
    setModel(models.some((m) => m.name === preferred) ? preferred : models[0].name);
  }, [models, rating, defaultModels]);

  const clampPages = (n: number) => Math.min(maxPages, Math.max(1, n || 1));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (styleId === "custom" && !customStyle.trim()) {
      toast("「自由に指定」の場合は絵柄を入力してください", true);
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await api.createProject({ synopsis, title, pageCount, styleId, customStyle, rating, adultConfirmed, model: model || undefined });
      location.hash = projectHash(id);
    } catch (err) {
      toast((err as Error).message, true);
      setSubmitting(false);
    }
  }

  const styleOptions = [...styles, { id: "custom", label: "自由に指定", description: "下の欄に絵柄を書く" }];

  return (
    <form className="card create-form" onSubmit={submit}>
      <label className="field">
        <span>ストーリーの概要 <em>必須</em></span>
        <textarea
          rows={6} required minLength={10} maxLength={4000} value={synopsis} onChange={(e) => setSynopsis(e.target.value)}
          placeholder="例：落ちこぼれの見習い魔法使いの少女が、森で拾った喋る黒猫と一緒に、消えてしまった村の灯りを取り戻す旅に出る。最後は自分だけの小さな魔法で村を救う。"
        />
      </label>
      <div className="form-row">
        <label className="field">
          <span>タイトル <small className="muted">（空欄ならAIが命名）</small></span>
          <input maxLength={60} placeholder="例：灯りの魔女" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field narrow">
          <span>ページ数</span>
          <div className="stepper">
            <button type="button" aria-label="減らす" onClick={() => setPageCount((n) => clampPages(n - 1))}>−</button>
            <input type="number" min={1} max={maxPages} required value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} />
            <button type="button" aria-label="増やす" onClick={() => setPageCount((n) => clampPages(n + 1))}>＋</button>
          </div>
        </label>
      </div>
      <div className="field">
        <span>絵柄</span>
        <div className="style-grid">
          {styleOptions.map((s) => (
            <label key={s.id} className="style-chip">
              <input type="radio" name="styleId" value={s.id} checked={styleId === s.id} onChange={() => setStyleId(s.id)} />
              <span><strong>{s.label}</strong><small>{s.description}</small></span>
            </label>
          ))}
        </div>
        <input
          maxLength={300} value={customStyle} onChange={(e) => setCustomStyle(e.target.value)}
          placeholder="絵柄の補足（任意）例：90年代アニメ風、ジブリ風の背景、レトロなスクリーントーン"
        />
      </div>
      <div className="field">
        <span>年齢区分</span>
        <div className="style-grid">
          <label className="style-chip">
            <input type="radio" name="rating" checked={rating === "general"} onChange={() => setRating("general")} />
            <span><strong>全年齢</strong><small>性的な描写なし</small></span>
          </label>
          <label className="style-chip">
            <input type="radio" name="rating" checked={rating === "adult"} onChange={() => setRating("adult")} />
            <span><strong>成人向け（R18）</strong><small>性的な描写を含む</small></span>
          </label>
        </div>
        {rating === "adult" && (
          <div className="adult-note">
            <p className="muted">
              登場人物はすべて20歳以上の成人として描かれます。未成年や学校を想起させる言葉（高校生・少女・制服など）を含む概要は使えません。
            </p>
            <label className="check">
              <input type="checkbox" required checked={adultConfirmed} onChange={(e) => setAdultConfirmed(e.target.checked)} />
              私は18歳以上です
            </label>
          </div>
        )}
      </div>
      {!mock && (
        <label className="field">
          <span>ストーリーを作るモデル <small className="muted">（Ollama に入っているもの）</small></span>
          {modelError ? (
            <p className="error-text">{modelError}</p>
          ) : (
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!models}>
              {!models && <option>読み込み中…</option>}
              {models?.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.parameterSize ? `（${m.parameterSize}）` : ""}{m.name === normalizeModelName(defaultModels[rating]) ? " ・おすすめ" : ""}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      <div className="form-actions">
        <button className="btn primary large" type="submit" disabled={submitting}>漫画を生成する</button>
      </div>
    </form>
  );
}

function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const run = useAction();
  const load = useCallback(() => run(async () => setProjects(await api.listProjects())), [run]);
  useEffect(() => { load(); }, [load]);

  const remove = (id: string) => run(async () => {
    if (!confirm("この作品を削除しますか？（元に戻せません）")) return;
    await api.deleteProject(id);
    await load();
  });

  if (!projects) return <div className="project-list"><p className="muted">読み込み中…</p></div>;
  return (
    <div className="project-list">
      {projects.length === 0 && <p className="muted empty">まだ作品はありません。上のフォームから最初の漫画を作りましょう。</p>}
      {projects.map((p) => (
        <article key={p.id} className="project-card">
          <a href={projectHash(p.id)} className={`cover ${p.rating === "adult" ? "adult" : ""}`}>
            {p.cover ? <img src={p.cover} alt="" /> : <span className="cover-empty">漫</span>}
          </a>
          <div className="project-meta">
            <a href={projectHash(p.id)} className="project-title">{p.title}</a>
            <small className="muted">{p.pageCount}ページ・{p.style}・{new Date(p.createdAt).toLocaleDateString("ja-JP")}</small>
            <div className="tags">
              {p.rating === "adult" && <span className="tag r18">R18</span>}
              {PROJECT_STATUS_LABEL[p.status] && <span className={`tag ${p.status}`}>{PROJECT_STATUS_LABEL[p.status]}</span>}
            </div>
          </div>
          <button className="icon-btn" title="削除" aria-label="削除" onClick={() => remove(p.id)}>✕</button>
        </article>
      ))}
    </div>
  );
}
