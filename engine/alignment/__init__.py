"""Sincronização palavra-a-palavra por alinhamento forçado CTC (D-019)."""

from .aligner import (
    ALIGNMENT_MODELS,
    AlignmentError,
    TextSegment,
    align_segments,
    align_transcript_audio,
    load_alignment_model,
    load_audio,
)
from .ctc import WordSpan, align_words, tokenize_words
from .speech import Silence, find_silences, snap_words_to_speech

__all__ = [
    "ALIGNMENT_MODELS",
    "AlignmentError",
    "Silence",
    "TextSegment",
    "WordSpan",
    "align_segments",
    "align_transcript_audio",
    "align_words",
    "find_silences",
    "snap_words_to_speech",
    "load_alignment_model",
    "load_audio",
    "tokenize_words",
]
