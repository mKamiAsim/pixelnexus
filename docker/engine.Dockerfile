# PixelNexus science engine.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.1 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# OpenCV (headless) needs GLib at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first, so code changes do not reinstall them.
COPY pyproject.toml uv.lock .python-version ./
COPY engine/pyproject.toml engine/pyproject.toml
RUN uv sync --frozen --no-default-groups --package pixelnexus-engine --extra optional \
    --no-install-workspace

COPY engine engine
RUN uv sync --frozen --no-default-groups --package pixelnexus-engine --extra optional

# The engine checks every job against the catalog, the single source of truth for filters.
COPY catalog catalog

# Inside the container the engine listens on all interfaces.
# compose.yaml publishes the port on 127.0.0.1 only.
ENV PATH="/app/.venv/bin:${PATH}" \
    PIXELNEXUS_ENGINE_HOST=0.0.0.0 \
    PIXELNEXUS_ENGINE_PORT=8765 \
    PIXELNEXUS_CATALOG_DIR=/app/catalog/filters

RUN useradd --create-home --uid 10001 pixelnexus
USER pixelnexus
EXPOSE 8765
CMD ["pixelnexus-engine"]
