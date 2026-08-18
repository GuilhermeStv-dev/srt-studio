from __future__ import annotations

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
    raise SystemExit(main())
