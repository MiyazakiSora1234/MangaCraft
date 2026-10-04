"""MangaCraft 用のローカル画像生成サーバ（Hugging Face Diffusers / SDXL）

  POST /generate  プロンプトから画像を1枚生成して PNG を返す（style_image を渡すと画風をそれに揃える）
  POST /unload    モデルを VRAM から降ろす（LLM に GPU を譲るため）

モデルは最初の生成リクエスト時に読み込む。生成は1件ずつ直列に処理する。
"""

import asyncio
import base64
import gc
import io
import logging
import os
import random
import sys
import time

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

MODEL = os.environ.get("DIFFUSERS_MODEL", "cagliostrolab/animagine-xl-4.0")  # Diffusers 形式の SDXL モデル
OFFLOAD = os.environ.get("DIFFUSERS_OFFLOAD", "none").lower()  # none / model（VRAM が足りない場合）
HOST = os.environ.get("IMAGE_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("IMAGE_SERVER_PORT", "7861"))

STEPS = 28
GUIDANCE = 5.0
STYLE_STRENGTH = 0.7  # 絵柄の見本の効き具合
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

# Windows でリダイレクトしたときもログを UTF-8 で出す
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8")

log = logging.getLogger("image-server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="MangaCraft image server")
lock = asyncio.Lock()
pipe = None


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = Field(1024, ge=256, le=2048)
    height: int = Field(1024, ge=256, le=2048)
    # 絵柄の見本（PNG の base64）。指定すると画風だけをこの画像に揃える
    style_image: str | None = None
    # 白黒の絵柄では生成後にグレースケールへ変換する（髪や目の色指定で色が混ざるのを防ぐ）
    monochrome: bool = False


def load_pipeline():
    from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionXLPipeline

    started = time.time()
    log.info("モデルを読み込みます: %s (%s)", MODEL, DEVICE)
    p = StableDiffusionXLPipeline.from_pretrained(MODEL, torch_dtype=DTYPE, use_safetensors=True)
    p.scheduler = EulerAncestralDiscreteScheduler.from_config(p.scheduler.config)

    # 絵柄の見本：IP-Adapter を InstantStyle 方式で使い、見本の「画風」だけを引き継ぐ
    # （構図や人物などの内容は写さず、線のタッチ・トーン・陰影だけが揃う）
    p.load_ip_adapter(
        "h94/IP-Adapter",
        subfolder="sdxl_models",
        weight_name="ip-adapter_sdxl.safetensors",
        image_encoder_folder="image_encoder",
        torch_dtype=DTYPE,
    )

    if OFFLOAD == "model" and DEVICE == "cuda":
        p.enable_model_cpu_offload()
    else:
        p.to(DEVICE)
    p.set_progress_bar_config(disable=True)
    log.info("読み込み完了 (%.1f 秒)", time.time() - started)
    return p


def style_kwargs(req: GenerateRequest):
    if req.style_image:
        image = Image.open(io.BytesIO(base64.b64decode(req.style_image))).convert("RGB")
        # up_blocks.0 の 2 番目のアテンション（画風を担う層）にだけ効かせる
        pipe.set_ip_adapter_scale({"up": {"block_0": [0.0, STYLE_STRENGTH, 0.0]}})
        return {"ip_adapter_image": image}
    # 見本がないときは効果ゼロにする（IP-Adapter を読み込んだパイプラインは画像入力が必須なので空画像を渡す）
    pipe.set_ip_adapter_scale(0.0)
    return {"ip_adapter_image": Image.new("RGB", (224, 224), "white")}


# ---------- 長いプロンプトの扱い ----------
# CLIP は 77 トークンまでしか読めないため、75 トークンずつに区切って個別にエンコードし、
# 結果を連結して UNet に渡す（AUTOMATIC1111 と同じ方式）。キャラの見た目指定が切り捨てられるのを防ぐ。

CHUNK = 75


def _chunk_ids(tokenizer, text: str, n_chunks: int):
    ids = tokenizer(text, truncation=False, add_special_tokens=False).input_ids
    chunks = [ids[i : i + CHUNK] for i in range(0, len(ids), CHUNK)] or [[]]
    chunks += [[] for _ in range(n_chunks - len(chunks))]
    pad = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id
    return [[tokenizer.bos_token_id] + c + [tokenizer.eos_token_id] + [pad] * (CHUNK - len(c)) for c in chunks]


def _count_chunks(text: str) -> int:
    n = len(pipe.tokenizer(text, truncation=False, add_special_tokens=False).input_ids)
    return max(1, -(-n // CHUNK))


def _encode(text: str, n_chunks: int):
    """SDXL の 2 つのテキストエンコーダで (hidden, pooled) を作る。"""
    per_encoder, pooled = [], None
    for idx, (tok, enc) in enumerate([(pipe.tokenizer, pipe.text_encoder), (pipe.tokenizer_2, pipe.text_encoder_2)]):
        hiddens = []
        for j, chunk in enumerate(_chunk_ids(tok, text, n_chunks)):
            out = enc(torch.tensor([chunk], device=enc.device), output_hidden_states=True)
            hiddens.append(out.hidden_states[-2])
            if idx == 1 and j == 0:
                pooled = out[0]  # CLIPTextModelWithProjection の text_embeds
        per_encoder.append(torch.cat(hiddens, dim=1))
    return torch.cat(per_encoder, dim=-1).to(DTYPE), pooled.to(DTYPE)


def prompt_kwargs(req: GenerateRequest):
    n = max(_count_chunks(req.prompt), _count_chunks(req.negative_prompt))
    cond, pooled = _encode(req.prompt, n)
    ncond, npooled = _encode(req.negative_prompt, n)
    return {
        "prompt_embeds": cond,
        "pooled_prompt_embeds": pooled,
        "negative_prompt_embeds": ncond,
        "negative_pooled_prompt_embeds": npooled,
    }


# ---------- 生成 ----------


def generate_sync(req: GenerateRequest) -> bytes:
    global pipe
    if pipe is None:
        pipe = load_pipeline()

    # SD の解像度は 8 の倍数である必要がある
    width, height = req.width // 8 * 8, req.height // 8 * 8
    seed = random.randrange(2**32)
    started = time.time()
    with torch.inference_mode():
        image = pipe(
            **prompt_kwargs(req),
            **style_kwargs(req),
            width=width,
            height=height,
            num_inference_steps=STEPS,
            guidance_scale=GUIDANCE,
            generator=torch.Generator(device="cpu").manual_seed(seed),
        ).images[0]
    log.info("生成完了 %dx%d seed=%d (%.1f 秒)", width, height, seed, time.time() - started)

    if req.monochrome:
        image = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=0.5)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def unload_sync():
    global pipe
    if pipe is None:
        return
    pipe = None
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
    log.info("モデルをアンロードしました")


@app.post("/generate")
async def generate(req: GenerateRequest):
    async with lock:
        try:
            png = await asyncio.to_thread(generate_sync, req)
        except torch.cuda.OutOfMemoryError as e:
            await asyncio.to_thread(unload_sync)
            raise HTTPException(507, "VRAM が不足しました。DIFFUSERS_OFFLOAD=model を試してください。") from e
        except Exception as e:  # noqa: BLE001
            log.exception("生成に失敗しました")
            raise HTTPException(500, f"生成に失敗しました: {e}") from e
    return Response(content=png, media_type="image/png")


@app.post("/unload")
async def unload():
    async with lock:
        await asyncio.to_thread(unload_sync)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    log.info("MangaCraft image server: http://%s:%d  (model=%s, device=%s)", HOST, PORT, MODEL, DEVICE)
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
