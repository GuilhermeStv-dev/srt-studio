from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from typing import Any

from engine.models import CaptionCue, WordToken
from engine.normalization import merge_fragmented_currency_numbers, normalize_monetary_tokens
from engine.segmentation import SegmentationConfig, segment_words


@dataclass(frozen=True, slots=True)
class SegmentationOptions:
    """Opções de captions compartilhadas por `transcribe` e `segment` (D-017)."""

    target_words: int = 2
    ignore_prepositions: bool = True
    preserve_commas_periods: bool = True
    monetary_thousands: bool = False

    @classmethod
    def from_dict(cls, raw: object) -> SegmentationOptions:
        if raw is None:
            return cls()
        if not isinstance(raw, Mapping):
            raise ValueError("segmentation precisa ser um objeto")

        known = {"target_words", "ignore_prepositions", "preserve_commas_periods", "monetary_thousands"}
        unknown = sorted(set(raw) - known)
        if unknown:
            raise ValueError(f"Opção de segmentação desconhecida: {', '.join(unknown)}")

        values: dict[str, Any] = {}
        target = raw.get("target_words", cls.target_words)
        if isinstance(target, bool) or not isinstance(target, int):
            raise ValueError("target_words deve ser 1, 2, 3 ou 4")
        values["target_words"] = target
        for name in known - {"target_words"}:
            if name in raw:
                if not isinstance(raw[name], bool):
                    raise ValueError(f"{name} deve ser booleano")
                values[name] = raw[name]

        options = cls(**values)
        options.segmentation_config().validate()
        return options

    def segmentation_config(self) -> SegmentationConfig:
        return SegmentationConfig(
            target_words=self.target_words,
            ignore_prepositions=self.ignore_prepositions,
            preserve_commas_periods=self.preserve_commas_periods,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_captions(words: Sequence[WordToken], options: SegmentationOptions) -> tuple[CaptionCue, ...]:
    """Cadeia única palavras → captions: reparo de números, moeda, segmentação."""
    repaired_words = merge_fragmented_currency_numbers(words)
    segmentation_words = normalize_monetary_tokens(
        repaired_words,
        format_thousands=options.monetary_thousands,
    )
    return tuple(segment_words(segmentation_words, options.segmentation_config()))


def parse_reviewed_words(items: object) -> tuple[WordToken, ...]:
    """Valida `WordToken[]` vindos da revisão; a UI só troca texto ou exclui palavras."""
    if not isinstance(items, list) or not items:
        raise ValueError("Payload precisa conter uma lista não vazia de words")

    words: list[WordToken] = []
    previous_start = -math.inf
    for index, item in enumerate(items, start=1):
        if not isinstance(item, Mapping):
            raise ValueError(f"Palavra {index} tem formato inválido")
        try:
            text = str(item["text"]).strip()
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Palavra {index} não possui text/start/end válidos") from exc

        if not text:
            raise ValueError(f"Palavra {index} está vazia; exclua a palavra em vez de apagar o texto")
        if any(char.isspace() for char in text):
            raise ValueError(f"Palavra {index} ('{text}') contém espaço; dividir palavras não é suportado")
        if not math.isfinite(start) or not math.isfinite(end):
            raise ValueError(f"Timestamp não finito em '{text}'")
        if start < 0:
            raise ValueError(f"Timestamp negativo em '{text}'")
        if end < start:
            raise ValueError(f"Duração inválida em '{text}': {start} -> {end}")
        if start < previous_start:
            raise ValueError(f"Timestamp regressivo em '{text}': {start} < {previous_start}")
        previous_start = start

        probability = item.get("probability")
        kind = item.get("kind")
        words.append(
            WordToken(
                text=text,
                start=start,
                end=end,
                probability=None if probability is None else float(probability),
                kind=None if kind is None else str(kind),
            )
        )

    return tuple(words)
