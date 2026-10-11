"""Run the engine with ``uv run pixelnexus-engine`` or ``python -m pixelnexus_engine``."""

from __future__ import annotations

import uvicorn

from pixelnexus_engine.api import create_app
from pixelnexus_engine.config import Settings


def main() -> None:
    settings = Settings.from_env()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
