// LLM の出力形式（JSON Schema）。Claude の structured outputs と Ollama の format 指定にそのまま渡す
import { BUBBLE_POSITIONS, BUBBLE_TYPES, PANEL_INTENSITIES, PANEL_SHOTS, PANEL_SIZES } from "../../shared/types.ts";

export const planSchema = {
  type: "object",
  additionalProperties: false,
  // facts を最初に書かせ、概要の設定を確認してから構成を考えさせる
  required: ["facts", "title", "logline", "characters", "pages"],
  properties: {
    facts: { type: "array", items: { type: "string" } },
    title: { type: "string" },
    logline: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "appearance"],
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          appearance: { type: "string" },
        },
      },
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "summary", "beats"],
        properties: {
          page: { type: "integer" },
          summary: { type: "string" },
          beats: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

// コマ割りはプログラムが組むので、LLM には各コマの大きさ・カメラの距離・緊張感だけを決めさせる
export const pageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["panels"],
  properties: {
    panels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "size", "shot", "intensity", "characters", "imagePrompt", "bubbles"],
        properties: {
          description: { type: "string" },
          size: { type: "string", enum: PANEL_SIZES },
          shot: { type: "string", enum: PANEL_SHOTS },
          intensity: { type: "string", enum: PANEL_INTENSITIES },
          characters: { type: "array", items: { type: "string" } },
          imagePrompt: { type: "string" },
          bubbles: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "text", "type", "position"],
              properties: {
                speaker: { type: "string" },
                text: { type: "string" },
                type: { type: "string", enum: BUBBLE_TYPES },
                position: { type: "string", enum: BUBBLE_POSITIONS },
              },
            },
          },
        },
      },
    },
  },
};
