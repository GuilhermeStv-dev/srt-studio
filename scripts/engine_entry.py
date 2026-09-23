from __future__ import annotations

import multiprocessing
import sys


def _force_utf8_stdio() -> None:
    for stream_name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="strict")


_force_utf8_stdio()

from engine.cli import main  # noqa: E402


if __name__ == "__main__":
    # No executável congelado, o multiprocessing (resource_tracker usado pelo
    # faster-whisper no macOS) relança este binário com argumentos próprios.
    multiprocessing.freeze_support()
    raise SystemExit(main())
