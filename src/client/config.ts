// サーバの設定（絵柄の一覧など）。起動時に一度だけ読み込み、どの画面からも参照できるようにする
import { createContext, useContext } from "react";
import type { AppConfig } from "../shared/types.ts";

export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error("ConfigContext の外で useConfig が使われました");
  return config;
}
