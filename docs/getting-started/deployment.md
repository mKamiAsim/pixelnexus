# Deployment

PixelNexus has two parts that deploy separately: the studio, a static web app, and the science engine, a Python server.

## The studio

`pnpm build` writes the studio to `web/dist`. It is static files, so any web server can host it. Browser filters, on-device models and every panel work without a server of your own.

The public site will publish the docs at the root of GitHub Pages and the studio at `/studio/`. The owner enables Pages and approves the first deploy.

## The engine on this computer

```bash
uv sync --extra cpu
uv run --extra cpu pixelnexus-engine
```

Use `--extra cuda` on a computer with an NVIDIA GPU. The engine listens on `127.0.0.1:8765` and accepts requests only from the studio addresses in `PIXELNEXUS_ALLOWED_ORIGINS`. See [Configuration](configuration.md).

## Docker

`docker compose up --build` builds and starts both parts. The studio runs on <http://localhost:8080> and the engine on port 8765. Both are published on `127.0.0.1` only. The engine image (`docker/engine.Dockerfile`) includes the optional packages and the CPU runtime for models. The studio image is `docker/web.Dockerfile`. See [Installation](installation.md).

## The engine on another machine

To use a machine with a large GPU from another computer:

1. On that machine, set `PIXELNEXUS_ENGINE_HOST=0.0.0.0`.
2. Add the studio's address to `PIXELNEXUS_ALLOWED_ORIGINS`.
3. In the studio, add the engine as a remote engine in **Edit > AI providers**.

The engine has no login, so run it only on a network you trust.
