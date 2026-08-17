from __future__ import annotations

from collections.abc import Sequence

from engine.models import CaptionCue


class InvalidCueError(ValueError):
    pass


def validate_cues(cues: Sequence[CaptionCue]) -> None:
    previous_end = 0.0
    for index, cue in enumerate(cues, start=1):
        if not cue.text.strip():
            raise InvalidCueError(f"Cue {index}: texto vazio")
        if cue.start < 0 or cue.end < 0:
            raise InvalidCueError(f"Cue {index}: timestamp negativo")
        if cue.end <= cue.start:
            raise InvalidCueError(f"Cue {index}: duração deve ser maior que zero")
        if index > 1 and cue.start < previous_end:
            raise InvalidCueError(f"Cue {index}: overlap ou regressão temporal")
        previous_end = cue.end
