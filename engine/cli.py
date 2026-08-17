from __future__ import annotations

import argparse
import json
import sys

from engine import __version__
from engine.models import CaptionCue
from engine.normalization import normalize_monetary_tokens
from engine.segmentation import SegmentationConfig, segment_words
from engine.srt import export_srt
from engine.srt.validate import InvalidCueError
from engine.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    detect_runtime,
    transcribe_file,
)


def emit(payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def health() -> int:
    emit(
        {
            "ok": True,
            "engine": "srt-studio",
            "version": __version__,
            "python_version": ".".join(map(str, sys.version_info[:3])),
            "python_executable": sys.executable,
        }
    )
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

    segmentation_words = normalize_monetary_tokens(
        result.words,
        format_thousands=args.monetary_thousands,
    )
    cues = segment_words(
        segmentation_words,
        SegmentationConfig(
            target_words=args.target_words,
            ignore_prepositions=not args.count_prepositions,
            preserve_punctuation=not args.no_punctuation,
        ),
    )
    emit(
        {
            "ok": True,
            **result.to_dict(),
            "captions": [cue.to_dict() for cue in cues],
            "segmentation": {
                "target_words": args.target_words,
                "ignore_prepositions": not args.count_prepositions,
                "preserve_punctuation": not args.no_punctuation,
                "monetary_thousands": args.monetary_thousands,
            },
        }
    )
    return 0


def _read_captions_from_stdin() -> tuple[CaptionCue, ...]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Nenhuma caption foi enviada para exportação")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Payload de captions não é JSON válido") from exc

    items = payload.get("captions") if isinstance(payload, dict) else payload
    if not isinstance(items, list) or not items:
        raise ValueError("Payload precisa conter uma lista não vazia de captions")

    cues: list[CaptionCue] = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Caption {index} tem formato inválido")
        try:
            text = str(item["text"])
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Caption {index} não possui text/start/end válidos") from exc
        cues.append(CaptionCue(text=text, start=start, end=end))

    return tuple(cues)


def export_srt_command(args: argparse.Namespace) -> int:
    try:
        cues = _read_captions_from_stdin()
        result = export_srt(cues, args.output, overwrite=args.overwrite)
    except (ValueError, InvalidCueError, FileNotFoundError, FileExistsError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 5

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
    transcribe_parser.add_argument(
        "--target-words",
        type=int,
        choices=[1, 2, 3, 4],
        default=2,
        help="Quantidade de palavras principais por caption",
    )
    transcribe_parser.add_argument(
        "--count-prepositions",
        action="store_true",
        help="Faz preposições consumirem vaga na contagem de palavras",
    )
    transcribe_parser.add_argument(
        "--no-punctuation",
        action="store_true",
        help="Remove pontuação nas bordas das palavras das captions",
    )
    transcribe_parser.add_argument(
        "--monetary-thousands",
        action="store_true",
        help="Exibe valores monetários redondos no formato N mil",
    )

    export_parser = sub.add_parser(
        "export-srt", help="Valida captions recebidas via stdin e grava um arquivo SRT UTF-8"
    )
    export_parser.add_argument("--output", required=True)
    export_parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Permite sobrescrever um arquivo existente após confirmação externa explícita",
    )

    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        return health()
    if args.command == "runtime":
        return runtime(args.device)
    if args.command == "transcribe":
        return transcribe(args)
    if args.command == "export-srt":
        return export_srt_command(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
