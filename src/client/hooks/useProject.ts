// 作品を読み込み、生成中は 2 秒ごとに読み直す
import { useCallback, useEffect, useState } from "react";
import { isPageBusy, type Project } from "../../shared/types.ts";
import { api } from "../api.ts";

const POLL_MS = 2000;

function isProjectBusy(project: Project): boolean {
  return project.status === "planning" ||
    project.pages.some((p) => isPageBusy(p) || p.panels.some((x) => x.image?.status === "drawing"));
}

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProject(await api.getProject(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setProject(null);
    setError(null);
    reload();
  }, [reload]);

  const busy = project !== null && isProjectBusy(project);
  useEffect(() => {
    if (!busy) return;
    // 一時的な失敗は次回に再試行する
    const timer = setTimeout(() => api.getProject(id).then(setProject, () => {}), POLL_MS);
    return () => clearTimeout(timer);
  }, [busy, project, id]);

  return { project, setProject, error, reload, busy };
}
