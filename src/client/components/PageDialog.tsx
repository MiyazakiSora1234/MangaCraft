// ページを作り直すダイアログ（ネームから / 絵だけ）
import { useState, type FormEvent } from "react";
import type { Project, RegenerateMode } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useAction, useToast } from "../hooks/toast.tsx";
import { Dialog } from "./Dialog.tsx";

interface Props {
  project: Project;
  pageNumber: number;
  summary: string;
  onClose: () => void;
  onStarted: () => Promise<void>; // 作り直しを始めたら作品を読み直す
}

export function PageDialog({ project, pageNumber, summary, onClose, onStarted }: Props) {
  const [mode, setMode] = useState<RegenerateMode>("all");
  const [instruction, setInstruction] = useState("");
  const toast = useToast();
  const run = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose();
    run(async () => {
      await api.regeneratePage(project.id, pageNumber, mode, instruction);
      toast(`${pageNumber}ページ目を作り直しています`);
      await onStarted();
    });
  };

  return (
    <Dialog onClose={onClose}>
      <form onSubmit={submit}>
        <h2>ページを作り直す</h2>
        <p className="muted">{summary}</p>
        <fieldset className="mode-select">
          <ModeOption value="all" current={mode} onChange={setMode} title="ネームから作り直す" note="コマ割り・セリフ・絵をすべて新しくします" />
          <ModeOption value="images" current={mode} onChange={setMode} title="絵だけ描き直す" note="コマ割りとセリフはそのままです" />
        </fieldset>
        <label className="field">
          <span>要望（任意）</span>
          <textarea
            rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="例：もっと緊迫感のある構図に / 主人公の表情を笑顔に / セリフを少なめに"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>キャンセル</button>
          <button type="submit" className="btn primary">作り直す</button>
        </div>
      </form>
    </Dialog>
  );
}

function ModeOption({ value, current, onChange, title, note }: {
  value: RegenerateMode; current: RegenerateMode; onChange: (m: RegenerateMode) => void; title: string; note: string;
}) {
  return (
    <label className="radio-card">
      <input type="radio" name="mode" value={value} checked={current === value} onChange={() => onChange(value)} />
      <span><strong>{title}</strong><small>{note}</small></span>
    </label>
  );
}
