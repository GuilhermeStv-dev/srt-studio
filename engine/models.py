from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True, slots=True)
class WordToken:
    text: str
    start: float
    end: float
    probability: float | None = None
    kind: str | None = None
    # Fronteira obrigatória de legenda depois desta palavra: fim de parágrafo /
    # troca de fala marcada na etapa Texto (D-020).
    break_after: bool = False
    # Silêncio real medido no áudio logo depois desta palavra, em segundos (D-022).
    # 0.0 = fala contínua até a próxima palavra; None = não medido (sem áudio).
    pause_after: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class CaptionCue:
    text: str
    start: float
    end: float

    def to_dict(self) -> dict:
        return asdict(self)
