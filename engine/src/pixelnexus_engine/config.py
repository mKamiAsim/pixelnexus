"""Engine settings read from environment variables.

Every variable is listed in ``.env.example`` at the repository root.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

_DEFAULT_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
)


def _split_origins(raw: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in raw.split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    """Runtime settings for the engine."""

    host: str = "127.0.0.1"
    port: int = 8765
    allowed_origins: tuple[str, ...] = _DEFAULT_ORIGINS
    max_upload_mb: int = 256
    max_pixels: int = 50_000_000
    models_dir: Path = field(default_factory=lambda: Path("models"))
    max_workers: int = field(default_factory=lambda: max(1, (os.cpu_count() or 2) // 2))
    cache_mb: int = 1024
    embeddings_mb: int = 512
    catalog_dir: Path | None = None

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        """Build settings from environment variables, falling back to defaults."""
        source = os.environ if env is None else env
        defaults = cls()
        origins = source.get("PIXELNEXUS_ALLOWED_ORIGINS")
        return cls(
            host=source.get("PIXELNEXUS_ENGINE_HOST", defaults.host),
            port=int(source.get("PIXELNEXUS_ENGINE_PORT", defaults.port)),
            allowed_origins=_split_origins(origins) if origins else defaults.allowed_origins,
            max_upload_mb=int(source.get("PIXELNEXUS_MAX_UPLOAD_MB", defaults.max_upload_mb)),
            max_pixels=int(source.get("PIXELNEXUS_MAX_PIXELS", defaults.max_pixels)),
            models_dir=Path(source.get("PIXELNEXUS_MODELS_DIR", str(defaults.models_dir))),
            max_workers=int(source.get("PIXELNEXUS_MAX_WORKERS", defaults.max_workers)),
            cache_mb=int(source.get("PIXELNEXUS_CACHE_MB", defaults.cache_mb)),
            embeddings_mb=int(source.get("PIXELNEXUS_EMBEDDINGS_MB", defaults.embeddings_mb)),
            catalog_dir=Path(catalog)
            if (catalog := source.get("PIXELNEXUS_CATALOG_DIR"))
            else None,
        )
