// <dialog> をモーダルとして開くラッパー。背景のクリックか閉じるボタンで閉じる
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}

export function Dialog({ onClose, wide = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // 閉じるときは呼び出し側がこのコンポーネントを外す（DOM から外れたダイアログは自動で閉じる）
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {children}
    </dialog>
  );
}
