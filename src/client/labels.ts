// 画面に出す表示名
import type { BubblePosition, BubbleType, PageStatus, ProjectStatus } from "../shared/types.ts";

export const PAGE_STATUS_LABEL: Record<PageStatus, string> = {
  pending: "待機中",
  scripting: "ネーム作成中",
  drawing: "作画中",
  done: "完成",
  error: "エラー",
};

// 作品一覧のタグ（完成した作品には出さない）
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "構成中",
  ready: "",
  error: "エラー",
};

export const BUBBLE_TYPE_LABEL: Record<BubbleType, string> = {
  speech: "会話",
  thought: "心の声",
  shout: "叫び",
  narration: "ナレーション",
};

export const BUBBLE_POSITION_LABEL: Record<BubblePosition, string> = {
  "top-right": "右上",
  "top-left": "左上",
  "top-center": "上",
  "bottom-right": "右下",
  "bottom-left": "左下",
  "bottom-center": "下",
};
