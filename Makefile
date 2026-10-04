# MangaCraft のよく使うコマンド。`make` または `make help` で一覧を表示する。
# uv / ollama が PATH にない場合は、例のように場所を指定する： make setup UV=C:/path/to/uv.exe

# .env の OLLAMA_MODEL / OLLAMA_ADULT_MODEL を読み込む（なければ既定値）
-include .env
OLLAMA_MODEL ?= gemma3:12b
OLLAMA_ADULT_MODEL ?= dolphin-mistral

UV ?= uv
OLLAMA ?= ollama
COMPOSE_GPU = docker compose -f docker-compose.yml -f docker-compose.gpu.yml

.DEFAULT_GOAL := help
.PHONY: help setup install models local start dev mock image-server build typecheck test check clean docker-up docker-gpu-up docker-down

help: ## このコマンド一覧を表示する
	@node -e "for (const l of require('fs').readFileSync('Makefile','utf8').split(/\r?\n/)) { const m = l.match(/^([\w-]+):.*?## (.*)$$/); if (m) console.log('  make ' + m[1].padEnd(14) + m[2]); }"

# ---------- 準備 ----------

setup: install models ## 初回の準備（依存パッケージとモデルをすべて入れる）

install: ## Node と画像生成サーバ（Python）の依存パッケージを入れる
	npm install
	cd image-server && $(UV) sync

models: ## Ollama のモデルを入れる（全年齢用と成人向け用）
	$(OLLAMA) pull $(OLLAMA_MODEL)
	$(OLLAMA) pull $(OLLAMA_ADULT_MODEL)

# ---------- 起動 ----------

local: ## 画像生成サーバとアプリをまとめて起動する（http://localhost:3000）
	npm run local

start: ## アプリだけ起動する（画像生成サーバは別に起動しておく）
	npm start

image-server: ## 画像生成サーバだけ起動する
	npm run image-server

dev: ## 開発用に起動する（変更で自動再起動・画面は http://localhost:5173）
	npm run dev

mock: ## AI を使わずに画面だけ確認する（ダミーの台本と仮画像）
	npm run mock

# ---------- 確認 ----------

build: ## 画面をビルドする
	npm run build

typecheck: ## 型チェック
	npm run typecheck

test: ## テスト
	npm test

check: typecheck test build ## 型チェック・テスト・ビルドをまとめて行う

clean: ## ビルド結果（dist/）を消す
	node -e "require('fs').rmSync('dist', { recursive: true, force: true })"

# ---------- Docker ----------

docker-up: ## Docker で起動する（PC 上の Ollama・画像生成サーバにつなぐ）
	docker compose up -d --build

docker-gpu-up: ## Ollama と画像生成サーバもまとめて Docker で起動する（NVIDIA GPU が必要）
	$(COMPOSE_GPU) up -d --build
	$(COMPOSE_GPU) exec ollama ollama pull $(OLLAMA_MODEL)
	$(COMPOSE_GPU) exec ollama ollama pull $(OLLAMA_ADULT_MODEL)

docker-down: ## Docker で起動したものを止める
	docker compose -f docker-compose.yml -f docker-compose.gpu.yml down
