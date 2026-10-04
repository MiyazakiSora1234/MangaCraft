// コマのダイアログ：セリフの編集・このコマだけ描き直し・絵柄の見本に設定
import { useState } from "react";
import { BUBBLE_POSITIONS, BUBBLE_TYPES, type Bubble, type Panel, type Project, type StyleRef } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useAction, useToast } from "../hooks/toast.tsx";
import { BUBBLE_POSITION_LABEL, BUBBLE_TYPE_LABEL } from "../labels.ts";
import { Dialog } from "./Dialog.tsx";

interface Props {
  project: Project;
  pageNumber: number;
  index: number;
  onClose: () => void;
  onPanelSaved: (panel: Panel) => void;
  onStyleRefChange: (styleRef: StyleRef | null) => void;
  onStarted: () => Promise<void>; // 描き直しを始めたら作品を読み直す
}

const emptyBubble = (): Bubble => ({ speaker: "", text: "", type: "speech", position: "top-right" });

export function PanelDialog({ project, pageNumber, index, onClose, onPanelSaved, onStyleRefChange, onStarted }: Props) {
  const toast = useToast();
  const run = useAction();
  const panel = project.pages[pageNumber - 1].panels[index];
  const [bubbles, setBubbles] = useState<Bubble[]>(panel.bubbles);
  const [instruction, setInstruction] = useState("");

  const editBubble = (i: number, patch: Partial<Bubble>) => setBubbles((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const saveBubbles = () => run(async () => {
    onPanelSaved(await api.saveBubbles(project.id, pageNumber, index, bubbles));
    onClose();
    toast("セリフを保存しました");
  });

  const redraw = () => run(async () => {
    await api.regeneratePanel(project.id, pageNumber, index, instruction);
    onClose();
    toast(`コマ${index + 1}を描き直しています`);
    await onStarted();
  });

  const useAsStyleRef = () => run(async () => {
    const { styleRef } = await api.setStyleRef(project.id, pageNumber, index);
    onStyleRefChange(styleRef);
    onClose();
    toast("この絵を見本にしました。これから描くコマはこの画風に揃います");
  });

  return (
    <Dialog onClose={onClose} wide>
      <form onSubmit={(e) => e.preventDefault()}>
        <h2>{pageNumber}ページ目・コマ{index + 1}</h2>
        <p className="muted">{panel.description}</p>

        <section className="panel-section">
          <h3>セリフ</h3>
          <div className="bubble-list">
            {bubbles.map((b, i) => (
              <div key={i} className="bubble-row">
                <input value={b.speaker} placeholder="話者" list="speaker-list" onChange={(e) => editBubble(i, { speaker: e.target.value })} />
                <input value={b.text} placeholder="セリフ" maxLength={80} onChange={(e) => editBubble(i, { text: e.target.value })} />
                <select value={b.type} onChange={(e) => editBubble(i, { type: e.target.value as Bubble["type"] })}>
                  {BUBBLE_TYPES.map((t) => <option key={t} value={t}>{BUBBLE_TYPE_LABEL[t]}</option>)}
                </select>
                <select value={b.position} onChange={(e) => editBubble(i, { position: e.target.value as Bubble["position"] })}>
                  {BUBBLE_POSITIONS.map((p) => <option key={p} value={p}>{BUBBLE_POSITION_LABEL[p]}</option>)}
                </select>
                <button type="button" className="icon-btn" aria-label="削除" onClick={() => setBubbles((bs) => bs.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <datalist id="speaker-list">
            {project.characters.map((c) => <option key={c.name} value={c.name} />)}
          </datalist>
          <div className="row-actions">
            <button type="button" className="btn ghost small" onClick={() => setBubbles((bs) => [...bs, emptyBubble()])}>＋ 吹き出しを追加</button>
            <button type="button" className="btn small" onClick={saveBubbles}>セリフを保存</button>
          </div>
        </section>

        <section className="panel-section">
          <h3>絵を描き直す</h3>
          <label className="field">
            <textarea
              rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)}
              placeholder="要望（任意）例：もっと引きの構図で / 夕焼けの背景に"
            />
          </label>
          <div className="row-actions">
            <button type="button" className="btn primary small" onClick={redraw}>このコマを描き直す</button>
            {panel.image.url && (
              <button type="button" className="btn small" onClick={useAsStyleRef}>この絵を絵柄の見本にする</button>
            )}
          </div>
        </section>

        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>閉じる</button>
        </div>
      </form>
    </Dialog>
  );
}
