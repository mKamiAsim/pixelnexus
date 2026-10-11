# Installation

This page shows how to get PixelNexus running on your own computer.

## What you need

| Tool | Version | Why |
|---|---|---|
| Git | any recent version | To get the source code. |
| Node.js | 22 or newer | Builds and runs the studio. The project is developed with Node.js 24. |
| pnpm | 12, through Corepack | Installs the studio packages. Corepack comes with Node.js. |
| uv | 0.12 or newer | Installs Python 3.12 and the Python packages for you. |
| Docker | optional | Runs the studio and the engine in containers. |

You do not need to install Python yourself. uv downloads the right version the first time you run it.

## Get the code

```bash
git clone https://github.com/mKamiAsim/pixelnexus.git
cd pixelnexus
```

## Install the packages

Turn on pnpm through Corepack. You only need to do this once per computer.

```bash
corepack enable pnpm
```

Install the studio packages:

```bash
pnpm install
```

Install Python and the engine packages:

```bash
uv sync
```

## Run the studio

```bash
pnpm dev
```

Open <http://localhost:5173> in your browser.

## Run the science engine

The science engine is optional. Advanced filters need it from Phase 6 on.

```bash
uv run pixelnexus-engine
```

Check that it works at <http://127.0.0.1:8765/api/v1/info>. The page lists the engine version, the library versions and the limits. The engine listens on `127.0.0.1` only, so other computers cannot reach it.

## Read the docs locally

```bash
uv run mkdocs serve
```

Open <http://127.0.0.1:8000>.

## Run everything with Docker

Docker builds the studio and the engine and starts both.

```bash
docker compose up --build
```

| Service | Address |
|---|---|
| Studio | <http://localhost:8080> |
| Science engine | <http://127.0.0.1:8765/api/v1/info> |

Both ports are published on `127.0.0.1` only. Stop the containers with `docker compose down`.
