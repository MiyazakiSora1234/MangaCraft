// サーバと画面で共有するデータの型

export const BUBBLE_TYPES = ["speech", "thought", "shout", "narration"] as const;
export const BUBBLE_POSITIONS = ["top-right", "top-left", "top-center", "bottom-right", "bottom-left", "bottom-center"] as const;
export const PANEL_SIZES = ["small", "medium", "large", "splash"] as const;
export const PANEL_SHOTS = ["wide", "medium", "closeup"] as const;
export const PANEL_INTENSITIES = ["calm", "tense", "action"] as const;

export type BubbleType = (typeof BUBBLE_TYPES)[number];
export type BubblePosition = (typeof BUBBLE_POSITIONS)[number];
export type PanelSize = (typeof PANEL_SIZES)[number];
export type PanelShot = (typeof PANEL_SHOTS)[number];
export type PanelIntensity = (typeof PANEL_INTENSITIES)[number];

export interface Bubble {
  speaker: string;
  text: string;
  type: BubbleType;
  position: BubblePosition;
}

// LLM が作るコマの台本（ネーム）
export interface PanelScript {
  description: string;
  size: PanelSize;
  shot: PanelShot;
  intensity: PanelIntensity;
  characters: string[];
  imagePrompt: string;
  bubbles: Bubble[];
}

type ImageStatus = "pending" | "drawing" | "done" | "error";

export interface PanelImage {
  url: string | null;
  status: ImageStatus;
  error: string | null;
}

export interface Panel extends PanelScript {
  image: PanelImage;
}

// 内容に応じたコマ割り（src/shared/layout.ts）。座標はページ幅・高さに対する割合
export interface PanelGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: number; // 実際の縦横比（幅 / 高さ）
  corners: [number, number][]; // 四隅（ページに対する割合）
  poly: [number, number][]; // 四隅（外接矩形に対する %。clip-path 用）
}

export interface DynamicLayout {
  type: "dynamic";
  seed: string;
  panels: PanelGeometry[];
}


export type PageStatus = "pending" | "scripting" | "drawing" | "done" | "error";

// 生成処理の途中にあるページの状態
const BUSY_PAGE_STATUSES: readonly PageStatus[] = ["pending", "scripting", "drawing"];
export const isPageBusy = (page: Pick<Page, "status">) => BUSY_PAGE_STATUSES.includes(page.status);

export interface Page {
  number: number;
  status: PageStatus;
  error: string | null;
  layout: DynamicLayout | null; // ネームができるまでは null
  panels: Panel[];
}

export interface Character {
  name: string;
  role: string;
  appearance: string;
}

export interface OutlinePage {
  page: number;
  summary: string;
  beats: string[]; // そのページで描く場面
}

export interface Style {
  id: string;
  label: string;
  description?: string;
  prompt: string; // 画像生成モデルに渡すスタイル指定
  negative?: string; // その絵柄から外れないためのネガティブ指定
  monochrome?: boolean; // 白黒の絵柄（生成後にグレースケールへ変換する）
}

export interface StyleRef {
  url: string;
  page: number;
  panel: number;
  auto: boolean; // 自動で選ばれた見本か
}

export type ProjectStatus = "planning" | "ready" | "error";

export interface Project {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: ProjectStatus;
  error: string | null;
  input: { synopsis: string; pageCount: number; title: string };
  style: Style;
  title: string;
  logline: string;
  facts: string[];
  characters: Character[];
  outline: OutlinePage[];
  pages: Page[];
  styleRef?: StyleRef | null;
}

// ---------- API ----------

export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  pageCount: number;
  style: string;
  cover: string | null;
}

export interface AppConfig {
  styles: Style[];
  maxPages: number;
  mock: boolean; // LLM・画像生成を使わないモックで動いているか
}

export interface CreateProjectRequest {
  synopsis: string;
  title?: string;
  pageCount: number;
  styleId: string;
  customStyle?: string;
}

export type RegenerateMode = "all" | "images";
