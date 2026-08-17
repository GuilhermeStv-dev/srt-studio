from __future__ import annotations

import argparse
import json

from engine import __version__


def health() -> int:
    print(json.dumps({"ok": True, "engine": "srt-studio", "version": __version__}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="srt-studio-engine")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health", help="Verifica se o engine Python está acessível")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        return health()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
