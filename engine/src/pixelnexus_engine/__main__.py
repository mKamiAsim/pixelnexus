"""Run the engine with ``uv run pixelnexus-engine`` or ``python -m pixelnexus_engine``.

``pixelnexus-engine models`` lists the optional models, and ``models download <id>`` and
``models delete <id>`` fetch or remove one. ``pixelnexus-engine device`` shows where models run.
"""

from __future__ import annotations

import argparse
import sys

import uvicorn

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings
from pixelnexus_engine.inference import describe
from pixelnexus_engine.models import delete, download, model_entries, model_view, total_mb


def models_command(args: argparse.Namespace, settings: Settings) -> int:
    entries = {m["id"]: m for m in model_entries(settings.catalog_dir)}
    if args.action == "list":
        for entry in entries.values():
            view = model_view(entry, settings.models_dir)
            mark = "downloaded" if view["downloaded"] else "not downloaded"
            note = ", non-commercial" if entry.get("nonCommercial") else ""
            print(f"{entry['id']:28} {total_mb(entry):>8.2f} MB  {mark}{note}")
        return 0
    found = entries.get(args.id or "")
    if found is None:
        print(f"There is no model '{args.id}'. Run `pixelnexus-engine models` for the list.")
        return 1
    entry = found
    if args.action == "delete":
        delete(entry, settings.models_dir)
        print(f"Deleted {entry['name']}.")
        return 0
    print(f"{entry['name']}, {total_mb(entry):g} MB. License: {entry['license']}")

    def progress(done: int, total: int) -> None:
        share = done / total if total else 1.0
        print(f"\r{share:6.1%}", end="", flush=True)

    try:
        download(entry, settings.models_dir, progress)
    except (ValueError, OSError) as error:
        print(f"\n{error}")
        return 1
    print(f"\nDownloaded and checked {entry['name']}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pixelnexus-engine", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command")
    models = commands.add_parser("models", help="list, download or delete optional models")
    models.add_argument("action", nargs="?", default="list", choices=["list", "download", "delete"])
    models.add_argument("id", nargs="?")
    commands.add_parser("device", help="show the model runtime and the device it uses")
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    if args.command == "models":
        return models_command(args, settings)
    if args.command == "device":
        for key, value in describe().items():
            print(f"{key}: {value}")
        return 0
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
