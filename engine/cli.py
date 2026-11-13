from __future__ import annotations

import argparse
import json
import sys

from engine import __version__
from engine.models import CaptionCue
from engine.pipeline import SegmentationOptions, build_captions, parse_reviewed_words
from engine.srt import export_srt
from engine.srt.validate import InvalidCueError
from engine.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    detect_runtime,
    transcribe_file,
    transcribe_text_file,
)

_PROGRESS_PREFIX = "SRT_PROGRESS "


def configure_utf8_stdio() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def emit(payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def emit_progress(stage: str, progress: float | None) -> None:
    payload: dict[str, object] = {"stage": stage, "progress": progress}
    print(
        f"{_PROGRESS_PREFIX}{json.dumps(payload, ensure_ascii=False)}",
        file=sys.stderr,
        flush=True,
    )


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
    progress_callback = emit_progress if args.progress_events else None
    options = SegmentationOptions(
        target_words=args.target_words,
        ignore_prepositions=not args.count_prepositions,
        preserve_commas_periods=not args.remove_commas_periods,
        monetary_thousands=args.monetary_thousands,
    )
    try:
        result = transcribe_file(
            args.input,
            model_name=args.model,
            language=args.language,
            requested_device=args.device,
            vad_filter=not args.no_vad,
            progress_callback=progress_callback,
        )
        cues = build_captions(result.words, options)
    except (
        FileNotFoundError,
        TranscriptionError,
        TranscriptionUnavailableError,
        ValueError,
    ) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 4
    if args.progress_events:
        emit_progress("completed", 1.0)
    emit(
        {
            "ok": True,
            **result.to_dict(),
            "captions": [cue.to_dict() for cue in cues],
            "segmentation": options.to_dict(),
        }
    )
    return 0


def transcribe_text_command(args: argparse.Namespace) -> int:
    """Etapa 1 de D-019: só o texto, sem tempos por palavra nem legendas."""
    progress_callback = emit_progress if args.progress_events else None
    try:
        result = transcribe_text_file(
            args.input,
            model_name=args.model,
            language=args.language,
            requested_device=args.device,
            vad_filter=not args.no_vad,
            progress_callback=progress_callback,
        )
    except (FileNotFoundError, TranscriptionError, TranscriptionUnavailableError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 4
    if args.progress_events:
        emit_progress("completed", 1.0)
    emit({"ok": True, **result.to_dict()})
    return 0


def _parse_text_segments(items: object) -> list:
    from engine.alignment import TextSegment

    if not isinstance(items, list) or not items:
        raise ValueError("Payload precisa conter uma lista não vazia de segments")
    segments = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Parágrafo {index} tem formato inválido")
        try:
            text = str(item["text"])
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Parágrafo {index} não possui text/start/end válidos") from exc
        if start < 0 or end < start:
            raise ValueError(f"Parágrafo {index} tem janela de tempo inválida")
        segments.append(TextSegment(text=text, start=start, end=end))
    if not any(segment.text.split() for segment in segments):
        raise ValueError("O texto está vazio; não há o que legendar")
    return segments


def caption_command(args: argparse.Namespace) -> int:
    """Etapa 2 de D-019: alinha o texto revisado ao áudio e gera as legendas."""
    progress_callback = emit_progress if args.progress_events else None
    try:
        from engine.alignment import AlignmentError, align_segments, load_alignment_model, load_audio
    except ImportError as exc:
        print(json.dumps({"ok": False, "error": f"Sincronização indisponível: {exc}"}, ensure_ascii=False), file=sys.stderr)
        return 7

    try:
        raw = sys.stdin.read()
        try:
            payload = json.loads(raw) if raw.strip() else None
        except json.JSONDecodeError as exc:
            raise ValueError("Payload de texto não é JSON válido") from exc
        if not isinstance(payload, dict):
            raise ValueError("Payload precisa ser um objeto com segments e segmentation")
        segments = _parse_text_segments(payload.get("segments"))
        options = SegmentationOptions.from_dict(payload.get("segmentation"))

        model = load_alignment_model(args.language, progress_callback)
        if progress_callback is not None:
            progress_callback("aligning", 0.0)
        audio = load_audio(args.input)
        words = align_segments(audio, segments, model, progress_callback)
        if not words:
            raise ValueError("Nenhuma palavra pôde ser sincronizada")
        cues = build_captions(words, options)
    except (FileNotFoundError, AlignmentError, ValueError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 7

    if args.progress_events:
        emit_progress("completed", 1.0)
    emit(
        {
            "ok": True,
            "words": [word.to_dict() for word in words],
            "captions": [cue.to_dict() for cue in cues],
            "segmentation": options.to_dict(),
        }
    )
    return 0


def segment_command(args: argparse.Namespace) -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise ValueError("Nenhuma palavra foi enviada para segmentação")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("Payload de palavras não é JSON válido") from exc
        if not isinstance(payload, dict):
            raise ValueError("Payload precisa ser um objeto com words e segmentation")

        words = parse_reviewed_words(payload.get("words"))
        options = SegmentationOptions.from_dict(payload.get("segmentation"))
        cues = build_captions(words, options)
    except ValueError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 6

    emit(
        {
            "ok": True,
            "captions": [cue.to_dict() for cue in cues],
            "segmentation": options.to_dict(),
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
        "--progress-events",
        action="store_true",
        help="Emite eventos de progresso estruturados em stderr para o desktop",
    )
    transcribe_parser.add_argument(
        "--target-words",
        type=int,
        choices=[1, 2, 3, 4],
        default=2,
        help="Densidade preferida de palavras por caption",
    )
    transcribe_parser.add_argument(
        "--count-prepositions",
        action="store_true",
        help="Faz preposições consumirem vaga na contagem de palavras",
    )
    transcribe_parser.add_argument(
        "--remove-commas-periods",
        action="store_true",
        help="Remove somente vírgulas e pontos nas bordas; ¿ ? ¡ ! são sempre preservados",
    )
    transcribe_parser.add_argument(
        "--monetary-thousands",
        action="store_true",
        help="Exibe valores monetários redondos no formato N mil",
    )

    text_parser = sub.add_parser(
        "transcribe-text",
        help="Transcreve um arquivo e devolve só o texto em parágrafos (sem tempos por palavra)",
    )
    text_parser.add_argument("input")
    text_parser.add_argument("--model", default="large-v3")
    text_parser.add_argument("--language", default=None)
    text_parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    text_parser.add_argument("--no-vad", action="store_true")
    text_parser.add_argument("--progress-events", action="store_true")

    caption_parser = sub.add_parser(
        "caption",
        help="Sincroniza o texto revisado (stdin) com o áudio por alinhamento forçado e gera captions",
    )
    caption_parser.add_argument("input")
    caption_parser.add_argument("--language", required=True)
    caption_parser.add_argument("--progress-events", action="store_true")

    sub.add_parser(
        "segment",
        help="Gera captions a partir de palavras revisadas recebidas via stdin (sem retranscrever)",
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
    configure_utf8_stdio()
    args = build_parser().parse_args()
    if args.command == "health":
        return health()
    if args.command == "runtime":
        return runtime(args.device)
    if args.command == "transcribe":
        return transcribe(args)
    if args.command == "transcribe-text":
        return transcribe_text_command(args)
    if args.command == "caption":
        return caption_command(args)
    if args.command == "segment":
        return segment_command(args)
    if args.command == "export-srt":
        return export_srt_command(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
