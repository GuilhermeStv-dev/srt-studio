from __future__ import annotations

import ctypes
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from engine.models import WordToken


class TranscriptionError(RuntimeError):
    """Erro explícito da camada de transcrição."""


class TranscriptionUnavailableError(TranscriptionError):
    """Dependências opcionais de transcrição não estão disponíveis."""


ProgressCallback = Callable[[str, float | None], None]

_WINDOWS_CUDA_DLLS = ("cublas64_12.dll", "cudnn_ops64_9.dll")


@dataclass(frozen=True, slots=True)
class RuntimeSelection:
    device: str
    compute_type: str
    cuda_devices: int
    warning: str | None = None

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
    runtime_warning: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "language_probability": self.language_probability,
            "duration": self.duration,
            "model": self.model,
            "device": self.device,
            "compute_type": self.compute_type,
            "words": [word.to_dict() for word in self.words],
            "runtime_warning": self.runtime_warning,
        }


def _report_progress(
    callback: ProgressCallback | None,
    stage: str,
    progress: float | None = None,
) -> None:
    if callback is not None:
        callback(stage, progress)


def find_missing_windows_cuda_libraries(
    *,
    platform_name: str | None = None,
    loader: Callable[[str], Any] | None = None,
) -> tuple[str, ...]:
    """Retorna DLLs NVIDIA essenciais que o processo Windows não consegue carregar.

    A GPU pode estar visível ao driver mesmo quando o CUDA Toolkit/cuDNN não está
    instalado no PATH. Esse é o caso que causava um traceback somente ao iniciar
    a inferência (`cublas64_12.dll is not found`).
    """

    platform_value = platform_name or sys.platform
    if platform_value != "win32":
        return ()

    if loader is None:
        loader = getattr(ctypes, "WinDLL")

    missing: list[str] = []
    for library in _WINDOWS_CUDA_DLLS:
        try:
            loader(library)
        except OSError:
            missing.append(library)
    return tuple(missing)


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

    requested = requested_device.lower().strip()
    cuda_devices = int(ctranslate2.get_cuda_device_count())
    cpu_types = set(ctranslate2.get_supported_compute_types("cpu"))

    if cuda_devices > 0 and requested != "cpu":
        missing = find_missing_windows_cuda_libraries()
        if missing:
            missing_text = ", ".join(missing)
            message = (
                f"GPU NVIDIA detectada, mas faltam bibliotecas CUDA no PATH: {missing_text}. "
                "Instale CUDA Toolkit 12.x + cuDNN 9 para CUDA 12 e reabra o aplicativo."
            )
            if requested == "cuda":
                raise TranscriptionUnavailableError(message)

            cpu_runtime = select_runtime(
                cuda_devices=cuda_devices,
                cpu_compute_types=cpu_types,
                requested_device="cpu",
            )
            return RuntimeSelection(
                device=cpu_runtime.device,
                compute_type=cpu_runtime.compute_type,
                cuda_devices=cuda_devices,
                warning=message,
            )

    cuda_types: set[str] = set()
    if cuda_devices > 0:
        try:
            cuda_types = set(ctranslate2.get_supported_compute_types("cuda"))
        except RuntimeError as exc:
            if requested == "cuda":
                raise TranscriptionUnavailableError(
                    f"CUDA está visível, mas o runtime não pôde ser inicializado: {exc}"
                ) from exc
            cuda_types = set()

    return select_runtime(
        cuda_devices=cuda_devices,
        cuda_compute_types=cuda_types,
        cpu_compute_types=cpu_types,
        requested_device=requested_device,
    )


def collect_word_tokens(
    segments: Iterable[Any],
    *,
    duration: float | None = None,
    progress_callback: ProgressCallback | None = None,
) -> tuple[WordToken, ...]:
    words: list[WordToken] = []
    previous_start = -math.inf
    valid_duration = duration if duration is not None and math.isfinite(duration) and duration > 0 else None

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

        if progress_callback is not None:
            segment_end_value = getattr(segment, "end", None)
            if valid_duration is not None and segment_end_value is not None:
                try:
                    segment_end = float(segment_end_value)
                    progress = min(0.99, max(0.0, segment_end / valid_duration))
                except (TypeError, ValueError):
                    progress = None
                _report_progress(progress_callback, "transcribing", progress)
            else:
                _report_progress(progress_callback, "transcribing", None)

    return tuple(words)


def transcribe_file(
    input_path: str | Path,
    *,
    model_name: str = "large-v3",
    language: str | None = None,
    requested_device: str = "auto",
    vad_filter: bool = True,
    progress_callback: ProgressCallback | None = None,
) -> TranscriptionResult:
    path = Path(input_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")

    _report_progress(progress_callback, "preparing", None)
    runtime = detect_runtime(requested_device)

    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError as exc:
        raise TranscriptionUnavailableError(
            "faster-whisper não está instalado. Instale com: pip install -e .[transcription]"
        ) from exc

    try:
        _report_progress(progress_callback, "loading_model", None)
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
        duration_hint_value = getattr(info, "duration", None)
        try:
            duration_hint = None if duration_hint_value is None else float(duration_hint_value)
        except (TypeError, ValueError):
            duration_hint = None
        _report_progress(
            progress_callback,
            "transcribing",
            0.0 if duration_hint is not None and duration_hint > 0 else None,
        )
        words = collect_word_tokens(
            segments,
            duration=duration_hint,
            progress_callback=progress_callback,
        )
    except RuntimeError as exc:
        text = str(exc)
        if any(name.lower() in text.lower() for name in _WINDOWS_CUDA_DLLS):
            raise TranscriptionUnavailableError(
                "A inferência CUDA não pôde iniciar porque uma biblioteca NVIDIA está ausente. "
                f"Detalhe: {text}. Instale CUDA Toolkit 12.x + cuDNN 9 para CUDA 12, "
                "reabra o aplicativo e use 'Reverificar runtime'."
            ) from exc
        raise TranscriptionError(f"Falha no runtime de transcrição: {text}") from exc

    if not words:
        raise TranscriptionError("Nenhuma palavra com timestamp foi detectada")

    _report_progress(progress_callback, "finalizing", None)

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
        runtime_warning=runtime.warning,
    )