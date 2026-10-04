// ハッシュによる画面の切り替え（#/ = ホーム、#/p/<作品ID>/<ページ> = 作品）
import { useEffect, useState } from "react";

type Route = { name: "home" } | { name: "project"; id: string; page: number };

function parse(hash: string): Route {
  const m = hash.match(/^#\/p\/([\w-]+)(?:\/(\d+))?/);
  return m ? { name: "project", id: m[1], page: Number(m[2] || 1) } : { name: "home" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const projectHash = (id: string, page?: number) => `#/p/${id}${page ? `/${page}` : ""}`;

// ページ送りでは履歴を増やさない（hashchange も起きないので、表示中のページは呼び出し側で持つ）
export const replacePageInUrl = (id: string, page: number) => history.replaceState(null, "", projectHash(id, page));
