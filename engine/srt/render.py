from __future__ import annotations

from collections.abc import Sequence

from engine.models import CaptionCue
from engine.srt.validate import validate_cues


def format_timestamp(seconds: float) -> str:
    if seconds < 0:
        raise ValueError("Timestamp não pode ser negativo")

    total_ms = round(seconds * 1000)
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def render_srt(cues: Sequence[CaptionCue], newline: str = "\r\n") -> str:
    validate_cues(cues)
    blocks: list[str] = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            newline.join(
                [
                    str(index),
                    f"{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}",
                    cue.text.strip(),
                ]
            )
        )
    return (newline * 2).join(blocks) + newline
