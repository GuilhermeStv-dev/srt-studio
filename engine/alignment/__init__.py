"""Sincronização palavra-a-palavra por alinhamento forçado CTC (D-019)."""

from .aligner import (
    ALIGNMENT_MODELS,
    AlignmentError,
    TextSegment,
    align_segments,
    load_alignment_model,
    load_audio,
)
from .ctc import WordSpan, align_words, tokenize_words

__all__ = [
    "ALIGNMENT_MODELS",
    "AlignmentError",
    "TextSegment",
    "WordSpan",
    "align_segments",
    "align_words",
    "load_alignment_model",
    "load_audio",
    "tokenize_words",
]
