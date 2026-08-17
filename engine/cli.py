from __future__ import annotations

import argparse
import json
import sys

from engine import __version__
from engine.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    detect_runtime,
    transcribe_file,
)


def emit(payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def health() -> int:
    emit({"ok": True, "engine": "srt-studio", "version": __version__})
    return 0


def runtime(device: str) -> int:
    try:
        selected = detect_runtime(device)
    except TranscriptionUnavailableError as exc:
        emit({"ok": False, "available": False, "error": str(exc)})
        return 3

    emit({"ok": True, "available": True, **selected.to_dict()})
    return 0


def transcribe(args: argparse.Namespace) -> int:
    try:
        result = transcribe_file(
            args.input,
            model_name=args.model,
            language=args.language,
            requested_device=args.device,
            vad_filter=not args.no_vad,
        )
    except (FileNotFoundError, TranscriptionError, TranscriptionUnavailableError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 4

    emit({"ok": True, **result.to_dict()})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="srt-studio-engine")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Verifica se o engine Python está acessível")

    runtime_parser = sub.add_parser(
        "runtime", help="Mostra disponibilidade do faster-whisper e runtime selecionado"
    )
    runtime_parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")

    transcribe_parser = sub.add_parser(
        "transcribe", help="Transcreve um arquivo e devolve palavras com timestamps em JSON"
    )
    transcribe_parser.add_argument("input")
    transcribe_parser.add_argument("--model", default="large-v3")
    transcribe_parser.add_argument("--language", default=None)
    transcribe_parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    transcribe_parser.add_argument("--no-vad", action="store_true")

    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        return health()
    if args.command == "runtime":
        return runtime(args.device)
    if args.command == "transcribe":
        return transcribe(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
