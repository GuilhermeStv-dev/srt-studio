from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True, slots=True)
class WordToken:
    text: str
    start: float
    end: float
    probability: float | None = None
    kind: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class CaptionCue:
    text: str
    start: float
    end: float

    def to_dict(self) -> dict:
        return asdict(self)
