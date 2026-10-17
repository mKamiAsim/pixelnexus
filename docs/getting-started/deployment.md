# Deployment

PixelNexus has two parts that deploy separately: the studio, a static web app, and the science engine, a Python server.

## The studio

`pnpm build` writes the studio to `web/dist`. It is static files, so any web server can host it, at the root or in a folder. Browser filters, on-device models and every panel work without a server of your own.

## GitHub Pages

The workflow `.github/workflows/pages.yml` builds the docs, puts the studio in `studio/` next to them, and publishes both. The docs are at the root of the site and the studio is at `/studio/`. The workflow runs only when you start it by hand, from the Actions tab.

Before the first run, open the repository settings, then Pages, and set the source to GitHub Actions.

## Offline use and installing

The studio has a web app manifest and a service worker, so you can install it from the browser menu. The first visit stores the studio, about 5 MB. After that it opens without a network connection, and every browser filter works. Large files, such as the 27 MB model runtime, are stored the first time you use them. On-device models are stored when you download them.

When a new version is published, the studio stores it in the background and tells you. It starts after you close every studio tab and open the studio again. Only production builds have a service worker, so `pnpm dev` never caches anything.

To remove the stored files, clear the site data for the studio in your browser settings.

## The engine on this computer

```bash
uv sync --extra cpu
uv run --extra cpu pixelnexus-engine
```

Use `--extra cuda` on a computer with an NVIDIA GPU. The engine listens on `127.0.0.1:8765` and accepts requests only from the studio addresses in `PIXELNEXUS_ALLOWED_ORIGINS`. See [Configuration](configuration.md).

To use your engine from the studio on GitHub Pages, add the site's address to the list. The list replaces the default one, so keep the local address too, for example `PIXELNEXUS_ALLOWED_ORIGINS=http://localhost:5173,https://mkamiasim.github.io`. Your browser may also ask whether the site may reach devices on your network. Allow it only for this site.

## Docker

`docker compose up --build` builds and starts both parts. The studio runs on <http://localhost:8080> and the engine on port 8765. Both are published on `127.0.0.1` only. The engine image (`docker/engine.Dockerfile`) includes the optional packages and the CPU runtime for models. The studio image is `docker/web.Dockerfile`. See [Installation](installation.md).

## The engine on another machine

To use a machine with a large GPU from another computer:

1. On that machine, set `PIXELNEXUS_ENGINE_HOST=0.0.0.0`.
2. Add the studio's address to `PIXELNEXUS_ALLOWED_ORIGINS`.
3. In the studio, add the engine as a remote engine in **Edit > AI providers**.

The engine has no login, so run it only on a network you trust.
