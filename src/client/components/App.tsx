// 画面全体：ヘッダーとルーティング
import { useEffect, useState } from "react";
import type { AppConfig } from "../../shared/types.ts";
import { api } from "../api.ts";
import { ConfigContext } from "../config.ts";
import { useRoute } from "../hooks/route.ts";
import { HomePage } from "./HomePage.tsx";
import { ProjectPage } from "./ProjectPage.tsx";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    api.config().then(setConfig, (err: Error) => setError(err.message));
  }, []);

  // ページを切り替えたら先頭から表示する
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, route.name === "project" ? route.id : null]);

  return (
    <ConfigContext.Provider value={config}>
      <header className="topbar">
        <a href="#/" className="brand"><span className="brand-mark">漫</span>MangaCraft</a>
        {config && <EnvBadge config={config} />}
      </header>
      <main>
        {error && <div className="card center"><p className="error-text">{error}</p></div>}
        {config && (route.name === "project"
          ? <ProjectPage key={route.id} id={route.id} initialPage={route.page} />
          : <HomePage />)}
      </main>
    </ConfigContext.Provider>
  );
}

// モックで動いているときの目印
function EnvBadge({ config }: { config: AppConfig }) {
  if (!config.mock) return null;
  return <span className="env-badge" title="npm run mock で起動しています。AI での生成は行いません">モック</span>;
}
