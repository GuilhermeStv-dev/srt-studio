"""Adapter de transcrição local baseado em faster-whisper."""

from .faster_whisper_adapter import (
    RuntimeSelection,
    TranscriptionError,
    TranscriptionResult,
    TranscriptionUnavailableError,
    collect_word_tokens,
    detect_runtime,
    find_missing_windows_cuda_libraries,
    select_runtime,
    transcribe_file,
)

__all__ = [
    "RuntimeSelection",
    "TranscriptionError",
    "TranscriptionResult",
    "TranscriptionUnavailableError",
    "collect_word_tokens",
    "detect_runtime",
    "find_missing_windows_cuda_libraries",
    "select_runtime",
    "transcribe_file",
]
