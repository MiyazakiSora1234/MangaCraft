# MangaCraft

ストーリーの概要・ページ数・絵柄を入力すると、AI がページ構成 → コマ割り → セリフ → 作画まで行い、漫画を生成する Web アプリです。
生成後はページをめくって確認でき、気に入らないページやコマだけを作り直せます。

**ローカルLLM（Ollama）＋同梱の画像生成サーバ（Hugging Face Diffusers）で、すべて PC 上で動きます。**

## 生成の流れ

1. **構成**：LLM が概要からタイトル・登場人物（見た目の設定付き）・ページごとの場面を作る
2. **ネーム**：ページごとに LLM が各コマの内容・大きさ・セリフ・作画指示を作る（前後のページとつながるよう 1 ページずつ順番に）
3. **作画**：画像生成モデルがコマごとに絵を描く
4. **仕上げ**：セリフは画像に焼き込まず、縦書きの吹き出しとして重ねて表示（後から編集可能）

LLM と画像生成は同じ GPU を使うため、「全ページのネーム → LLM を VRAM から解放 → まとめて作画」の順に処理します。
VRAM 16GB 程度の GPU 1 枚で動きます。

### コマ割りと絵柄

- **コマ割り**：LLM が各コマの大きさ（決めゴマ〜小ゴマ）・カメラの距離・緊張感を決め、プログラムがそれに合わせて配置を組みます。山場は大ゴマ、会話は小ゴマ、緊迫した場面では枠が斜めになります
- **絵柄の統一**：最初に描けた人物のコマを「絵柄の見本」にして、以降のコマの画風（線のタッチ・トーン）を揃えます（IP-Adapter / InstantStyle）。見本はコマをクリックして選び直せます
- 白黒の絵柄では生成後にグレースケールへ変換し、色が混ざらないようにしています

### 作り直し

- **ページ単位**：「ネームから作り直す」か「絵だけ描き直す」を選び、要望（例：もっと迫力ある構図に）を添えられます
- **コマ割りだけ変える**：絵とセリフはそのままで、配置だけを一瞬で組み直します
- **コマ単位**：コマをクリックして、そのコマだけ描き直し／セリフの修正／絵柄の見本に設定
- **印刷・PDF保存**：全ページを B5 で印刷（ブラウザの「PDF に保存」で PDF 化）

### 成人向け（R18）

作成時に年齢区分で「成人向け」を選ぶと、性的な描写を含む作品を作れます。文章は `OLLAMA_ADULT_MODEL` のモデル（既定は dolphin-mistral。`ollama pull` で別途取得）で作り、全年齢の作品とは分けています。

登場人物はすべて 20 歳以上の成人として扱い、未成年を想起させる内容は作りません。

- 概要・タイトル・絵柄・要望・セリフに未成年や学校を想起させる言葉（高校生・少女・制服など）があれば受け付けない
- LLM が出した登場人物に 20 歳未満がいる、または構成・ネームに未成年を想起させる内容があれば作り直し、直らなければ止める
- 作画の指示から幼さを示す語を取り除き、成人であることを明示する（ネガティブプロンプトにも追加）
- 作品一覧では成人向けの表紙をぼかして表示する

## 準備

### 1. Ollama

[Ollama](https://ollama.com/) をインストールして、日本語が得意なモデルを取得します。

```bash
ollama pull gemma3:12b
```

VRAM 16GB なら `gemma3:12b` や `qwen3:14b` が目安です。使うモデルは `.env` の `OLLAMA_MODEL` で変えられます。

### 2. 画像生成サーバ（image-server/）

Hugging Face Diffusers を使った画像生成サーバです。Python の環境は [uv](https://docs.astral.sh/uv/) が用意します（NVIDIA GPU 推奨。RTX 50 シリーズ対応の CUDA 12.8 版 PyTorch を使います）。

```bash
cd image-server
uv sync
```

モデルは漫画・アニメ向けの SDXL モデル [Animagine XL 4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0)（約 7GB）と、絵柄の統一に使う [IP-Adapter](https://huggingface.co/h94/IP-Adapter)（約 4GB）で、初回の生成時に自動でダウンロードします。

## 起動方法

Node.js 24 以上が必要です。

`make` が使える環境なら、よく使う操作は Makefile にまとめてあります（`make` で一覧を表示）。

```bash
make setup   # 初回の準備（依存パッケージと Ollama のモデルをすべて入れる）
make local   # 画像生成サーバとアプリをまとめて起動
make check   # 型チェック・テスト・ビルド
```

`uv` や `ollama` が PATH にない場合は `make setup UV=<uv の場所>` のように指定できます。

make を使わない場合：

```bash
cp .env.example .env   # 必要ならモデルなどを変更
npm install
npm run local          # 画像生成サーバとアプリをまとめて起動
```

http://localhost:3000 を開きます（Ollama は別途起動しておきます。Windows ではインストール後に常駐します）。

- アプリだけ起動: `npm start` ／ 画像生成サーバだけ起動: `npm run image-server`
- AI を使わずに画面だけ確認（ダミーの台本と仮画像）: `npm run mock`

### 開発

```bash
npm run dev         # サーバ（変更で自動再起動）＋ 画面の開発サーバ http://localhost:5173
npm run typecheck   # 型チェック
npm test            # テスト
```

`npm run dev -- --mock` で、AI を使わずに開発できます。

### Docker

PC 上の Ollama / 画像生成サーバにつなぐ場合（`.env` の `localhost` はコンテナ内で自動的に PC 側へ読み替えます）：

```bash
docker compose up -d --build
```

Ollama と画像生成サーバもすべてコンテナで動かす場合（NVIDIA GPU と Docker の GPU サポートが必要）：

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml exec ollama ollama pull gemma3:12b
```

作品と画像は `mangacraft-data`、モデルは `ollama-models` / `hf-models` ボリュームに保存されます。

## 設定（.env）

| 変数 | 説明 |
|---|---|
| `OLLAMA_URL` / `OLLAMA_MODEL` / `OLLAMA_NUM_CTX` | Ollama の接続先・モデル・コンテキスト長 |
| `OLLAMA_ADULT_MODEL` | 成人向け（R18）の作品で使うモデル |
| `DIFFUSERS_URL` | 画像生成サーバの接続先 |
| `DIFFUSERS_MODEL` / `DIFFUSERS_OFFLOAD` | 画像生成サーバのモデル・VRAM 節約モード（画像生成サーバ側の設定） |
| `PORT` / `MAX_PAGES` | アプリのポート・最大ページ数 |

## 構成

TypeScript で書かれています。画面は React（Vite でビルド）、サーバは Express です。

```
src/shared/          サーバと画面で共有するもの
  types.ts           作品・ページ・コマなどのデータの型
  layout.ts          内容に応じたコマ割り
  bubbles.ts         吹き出しの整形
src/server/
  adult.ts           成人向け（R18）作品の安全策（未成年の排除）
  index.ts           HTTP サーバ（API・画面とコマ画像の配信）
  config.ts          設定（環境変数）の読み込み
  generator.ts       生成パイプライン（構成 → ネーム → 作画）と作り直し
  store.ts           data/ 以下への保存
  styles.ts          絵柄プリセット
  llm/               文章生成（プロンプト・出力形式・出力の補正、Ollama / モック）
  images/            画像生成（プロンプト・サイズ、Diffusers / 仮画像）
src/client/          画面（React）
  components/        ホーム・作品画面・ページ描画・ダイアログ
  hooks/             ルーティング・作品の読み込み・トースト
test/                テスト（node:test）
image-server/        画像生成サーバ（Python / FastAPI / Diffusers）
scripts/run.mjs      複数プロセスの同時起動（npm run local / dev）
```

## 注意

- ローカルLLMは出力が崩れることがあります。JSON として読めない・コマが空などの場合は自動で最大 3 回まで作り直し、欠けた項目は補正します。
- 画像生成 AI は毎回絵が変わるため、キャラクターの見た目は完全には一致しません。気になるコマは個別に描き直してください。
- 生成時間は GPU 性能次第です。RTX 5060 Ti（16GB）で 4 ページ約 7 分（1 コマ約 12 秒）。
