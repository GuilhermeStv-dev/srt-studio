from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

from engine.models import WordToken


class TranscriptionError(RuntimeError):
    """Erro explícito da camada de transcrição."""


class TranscriptionUnavailableError(TranscriptionError):
    """Dependências opcionais de transcrição não estão disponíveis."""


@dataclass(frozen=True, slots=True)
class RuntimeSelection:
    device: str
    compute_type: str
    cuda_devices: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    language: str
    language_probability: float | None
    duration: float
    model: str
    device: str
    compute_type: str
    words: tuple[WordToken, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "language_probability": self.language_probability,
            "duration": self.duration,
            "model": self.model,
            "device": self.device,
            "compute_type": self.compute_type,
            "words": [word.to_dict() for word in self.words],
        }


def select_runtime(
    *,
    cuda_devices: int,
    cuda_compute_types: set[str] | None = None,
    cpu_compute_types: set[str] | None = None,
    requested_device: str = "auto",
) -> RuntimeSelection:
    requested = requested_device.lower().strip()
    if requested not in {"auto", "cuda", "cpu"}:
        raise ValueError("device deve ser auto, cuda ou cpu")

    cuda_types = cuda_compute_types or set()
    cpu_types = cpu_compute_types or set()

    use_cuda = requested == "cuda" or (requested == "auto" and cuda_devices > 0)
    if use_cuda and cuda_devices <= 0:
        raise TranscriptionUnavailableError("CUDA foi solicitado, mas nenhuma GPU CUDA está visível")

    if use_cuda:
        if "int8_float16" in cuda_types:
            compute_type = "int8_float16"
        elif "float16" in cuda_types:
            compute_type = "float16"
        elif "int8" in cuda_types:
            compute_type = "int8"
        else:
            compute_type = "default"
        return RuntimeSelection("cuda", compute_type, cuda_devices)

    if "int8" in cpu_types:
        compute_type = "int8"
    elif "int8_float32" in cpu_types:
        compute_type = "int8_float32"
    else:
        compute_type = "default"
    return RuntimeSelection("cpu", compute_type, cuda_devices)


def detect_runtime(requested_device: str = "auto") -> RuntimeSelection:
    try:
        import ctranslate2  # type: ignore[import-not-found]
    except ImportError as exc:
        raise TranscriptionUnavailableError(
            "faster-whisper/CTranslate2 não está instalado. "
            "Instale com: pip install -e .[transcription]"
        ) from exc

    cuda_devices = int(ctranslate2.get_cuda_device_count())
    cuda_types: set[str] = set()
    cpu_types = set(ctranslate2.get_supported_compute_types("cpu"))

    if cuda_devices > 0:
        try:
            cuda_types = set(ctranslate2.get_supported_compute_types("cuda"))
        except RuntimeError:
            cuda_types = set()

    return select_runtime(
        cuda_devices=cuda_devices,
        cuda_compute_types=cuda_types,
        cpu_compute_types=cpu_types,
        requested_device=requested_device,
    )


def collect_word_tokens(segments: Iterable[Any]) -> tuple[WordToken, ...]:
    words: list[WordToken] = []
    previous_start = -math.inf

    for segment in segments:
        for word in getattr(segment, "words", None) or []:
            text = str(getattr(word, "word", "")).strip()
            if not text:
                continue

            start = float(getattr(word, "start"))
            end = float(getattr(word, "end"))
            probability_value = getattr(word, "probability", None)
            probability = None if probability_value is None else float(probability_value)

            if not math.isfinite(start) or not math.isfinite(end):
                raise TranscriptionError(f"Timestamp não finito em '{text}'")
            if start < 0:
                raise TranscriptionError(f"Timestamp negativo em '{text}'")
            if end <= start:
                raise TranscriptionError(f"Duração inválida em '{text}': {start} → {end}")
            if start < previous_start:
                raise TranscriptionError(
                    f"Timestamp regressivo em '{text}': {start} < {previous_start}"
                )

            words.append(
                WordToken(
                    text=text,
                    start=round(start, 3),
                    end=round(end, 3),
                    probability=probability,
                )
            )
            previous_start = start

    return tuple(words)


def transcribe_file(
    input_path: str | Path,
    *,
    model_name: str = "large-v3",
    language: str | None = None,
    requested_device: str = "auto",
    vad_filter: bool = True,
) -> TranscriptionResult:
    path = Path(input_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")

    runtime = detect_runtime(requested_device)

    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError as exc:
        raise TranscriptionUnavailableError(
            "faster-whisper não está instalado. Instale com: pip install -e .[transcription]"
        ) from exc

    model = WhisperModel(
        model_name,
        device=runtime.device,
        compute_type=runtime.compute_type,
    )
    segments, info = model.transcribe(
        str(path),
        language=language,
        word_timestamps=True,
        vad_filter=vad_filter,
    )

    segment_list = list(segments)
    words = collect_word_tokens(segment_list)

    if not words:
        raise TranscriptionError("Nenhuma palavra com timestamp foi detectada")

    duration = float(getattr(info, "duration", words[-1].end))
    detected_language = str(getattr(info, "language", language or "unknown"))
    language_probability_value = getattr(info, "language_probability", None)
    language_probability = (
        None if language_probability_value is None else float(language_probability_value)
    )

    return TranscriptionResult(
        language=detected_language,
        language_probability=language_probability,
        duration=round(duration, 3),
        model=model_name,
        device=runtime.device,
        compute_type=runtime.compute_type,
        words=words,
    )
