// 画面下に短いメッセージを出す
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ShowToast = (message: string, isError?: boolean) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<ShowToast>((message, isError = false) => {
    setToast({ message, isError });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.isError ? "error" : ""}`} role="status">{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// 失敗したらエラーをトーストで出す非同期処理の実行
export function useAction() {
  const toast = useToast();
  return useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message, true);
    }
  }, [toast]);
}
