// サーバ API の呼び出し
import type {
  AppConfig, Bubble, CreateProjectRequest, Page, Panel, Project, ProjectSummary, RegenerateMode, StyleRef,
} from "../shared/types.ts";

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `エラー (${res.status})`);
  return json as T;
}

const projectPath = (id: string) => `/api/projects/${id}`;
const pagePath = (id: string, n: number) => `${projectPath(id)}/pages/${n}`;
const panelPath = (id: string, n: number, i: number) => `${pagePath(id, n)}/panels/${i}`;

export const api = {
  config: () => request<AppConfig>("/api/config"),

  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  createProject: (body: CreateProjectRequest) => request<{ id: string }>("/api/projects", { method: "POST", body }),
  getProject: (id: string) => request<Project>(projectPath(id)),
  deleteProject: (id: string) => request<void>(projectPath(id), { method: "DELETE" }),
  retryPlan: (id: string) => request<void>(`${projectPath(id)}/retry`, { method: "POST" }),
  cancel: (id: string) => request<Project>(`${projectPath(id)}/cancel`, { method: "POST" }),

  setStyleRef: (id: string, page: number, panel: number) =>
    request<{ styleRef: StyleRef | null }>(`${projectPath(id)}/style-ref`, { method: "POST", body: { page, panel } }),
  clearStyleRef: (id: string) => request<{ styleRef: null }>(`${projectPath(id)}/style-ref`, { method: "POST", body: { clear: true } }),

  regeneratePage: (id: string, n: number, mode: RegenerateMode, instruction: string) =>
    request<void>(`${pagePath(id, n)}/regenerate`, { method: "POST", body: { mode, instruction } }),
  relayoutPage: (id: string, n: number) => request<Page>(`${pagePath(id, n)}/relayout`, { method: "POST" }),

  regeneratePanel: (id: string, n: number, i: number, instruction: string) =>
    request<void>(`${panelPath(id, n, i)}/regenerate`, { method: "POST", body: { instruction } }),
  saveBubbles: (id: string, n: number, i: number, bubbles: Bubble[]) =>
    request<Panel>(`${panelPath(id, n, i)}/bubbles`, { method: "PATCH", body: { bubbles } }),
};
