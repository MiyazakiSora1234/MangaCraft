// 画像生成の共通インターフェース

export interface ImagePrompt {
  positive: string;
  negative: string;
  monochrome: boolean; // 白黒の絵柄（生成後にグレースケールへ変換する）
}

interface ImageRequest {
  prompt: ImagePrompt;
  aspect: number; // コマの縦横比（幅 / 高さ）
  label: string; // コマの内容（仮画像に表示する）
  styleImage: string | null; // 絵柄の見本（base64）
}

export interface ImageGenerator {
  generate(req: ImageRequest): Promise<{ buffer: Buffer; ext: string }>;
  // モデルを VRAM から降ろす（LLM に GPU を譲るため）
  release(): Promise<void>;
}
