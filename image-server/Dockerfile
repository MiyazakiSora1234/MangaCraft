FROM python:3.12-slim
# CUDA ランタイムは PyTorch の wheel に同梱されるので、ホストに NVIDIA ドライバと Container Toolkit があれば動く
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 HF_HOME=/models IMAGE_SERVER_HOST=0.0.0.0 IMAGE_SERVER_PORT=7861
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev && rm -rf /root/.cache/uv
COPY server.py ./
VOLUME ["/models"]
EXPOSE 7861
CMD ["uv", "run", "--no-sync", "server.py"]
