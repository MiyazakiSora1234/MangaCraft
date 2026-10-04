// 設定（環境変数と起動オプション）をここに集約する。ほかのモジュールは process.env を直接読まない。
// 項目の説明は .env.example を参照。
const env = process.env;

const str = (name: string, fallback: string) => env[name] || fallback;

// Docker コンテナ内から PC 上の Ollama / 画像生成サーバに届くよう、localhost を host.docker.internal に読み替え、
// 末尾のスラッシュを取り除く
function serviceUrl(name: string, fallback: string): string {
  const url = str(name, fallback).replace(/\/$/, "");
  return env.IN_DOCKER === "1" ? url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, "$1host.docker.internal") : url;
}

export const config = {
  port: Number(str("PORT", "3000")),
  maxPages: Number(str("MAX_PAGES", "20")),
  dataDir: str("DATA_DIR", "data"),
  // npm run mock（--mock）は LLM も画像生成も使わず、ダミーの台本と仮画像で動く
  mock: process.argv.includes("--mock"),
  ollama: {
    url: serviceUrl("OLLAMA_URL", "http://localhost:11434"),
    model: str("OLLAMA_MODEL", "gemma3:12b"),
    // 成人向け（R18）の作品だけで使うモデル
    adultModel: str("OLLAMA_ADULT_MODEL", "dolphin-mistral"),
    numCtx: Number(str("OLLAMA_NUM_CTX", "16384")),
  },
  diffusersUrl: serviceUrl("DIFFUSERS_URL", "http://localhost:7861"),
};
