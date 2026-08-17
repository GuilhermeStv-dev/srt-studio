from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Sequence

from engine.models import CaptionCue, WordToken
from engine.normalization import normalize_whitespace

# Preposições práticas para ES/ES-PY. Quando a opção está ativa, elas permanecem
# na caption, mas não consomem uma vaga da contagem de palavras principais.
_PREPOSITIONS = {
    "a",
    "al",
    "ante",
    "bajo",
    "con",
    "contra",
    "de",
    "del",
    "desde",
    "durante",
    "en",
    "entre",
    "hacia",
    "hasta",
    "mediante",
    "para",
    "por",
    "según",
    "sin",
    "sobre",
    "tras",
}

# Remove somente pontuação nas bordas. Pontuação interna fica intacta para não
# alterar números como 50.000, 1,5 ou outros tokens válidos.
_EDGE_PUNCTUATION = re.compile(r"^[¿¡\"'“”‘’([{]+|[?!,.;:…\"'“”‘’)\]}]+$")


@dataclass(frozen=True, slots=True)
class SegmentationConfig:
    target_words: int = 2
    ignore_prepositions: bool = True
    preserve_punctuation: bool = True

    def validate(self) -> None:
        if self.target_words not in {1, 2, 3, 4}:
            raise ValueError("target_words deve ser 1, 2, 3 ou 4")


def _strip_edge_punctuation(text: str) -> str:
    value = text.strip()
    previous = None
    while value != previous:
        previous = value
        value = _EDGE_PUNCTUATION.sub("", value).strip()
    return value


def _lexical(text: str) -> str:
    return _strip_edge_punctuation(text).lower()


def _counts_toward_target(text: str, config: SegmentationConfig) -> bool:
    lexical = _lexical(text)
    if not lexical:
        return False
    return not (config.ignore_prepositions and lexical in _PREPOSITIONS)


def _render_token(text: str, preserve_punctuation: bool) -> str:
    normalized = normalize_whitespace(text)
    if preserve_punctuation:
        return normalized
    return _strip_edge_punctuation(normalized)


def _join(words: Sequence[WordToken], config: SegmentationConfig) -> str:
    rendered = (
        _render_token(word.text, config.preserve_punctuation)
        for word in words
        if word.text.strip()
    )
    return normalize_whitespace(" ".join(part for part in rendered if part))


def _validate_words(words: Sequence[WordToken]) -> None:
    previous_start = -math.inf
    for word in words:
        if not word.text.strip():
            raise ValueError("WordToken vazio não pode ser segmentado")
        if not math.isfinite(word.start) or not math.isfinite(word.end):
            raise ValueError("WordToken contém timestamp não finito")
        if word.start < 0 or word.end <= word.start:
            raise ValueError(f"WordToken inválido: {word.text}")
        if word.start < previous_start:
            raise ValueError("WordToken com timestamp regressivo")
        previous_start = word.start


def _build_groups(
    words: Sequence[WordToken],
    config: SegmentationConfig,
) -> list[list[WordToken]]:
    groups: list[list[WordToken]] = []
    current: list[WordToken] = []
    counted_words = 0

    for word in words:
        current.append(word)
        if _counts_toward_target(word.text, config):
            counted_words += 1

        if counted_words >= config.target_words:
            groups.append(current)
            current = []
            counted_words = 0

    if current:
        # Se o áudio terminar apenas com uma preposição ignorada na contagem,
        # evita uma caption órfã e anexa o restante à caption anterior.
        if counted_words == 0 and groups:
            groups[-1].extend(current)
        else:
            groups.append(current)

    return groups


def segment_words(
    words: Sequence[WordToken],
    config: SegmentationConfig | None = None,
) -> tuple[CaptionCue, ...]:
    """Segmenta WordToken por quantidade previsível de palavras principais.

    `target_words` aceita 1–4. Com `ignore_prepositions=True`, preposições
    permanecem no texto e acompanham a palavra seguinte sem consumir uma vaga.
    A pontuação pode ser preservada ou removida somente nas bordas dos tokens.
    """

    cfg = config or SegmentationConfig()
    cfg.validate()

    if not words:
        return ()

    _validate_words(words)
    groups = _build_groups(words, cfg)

    cues: list[CaptionCue] = []
    previous_cue_end = -math.inf

    for group in groups:
        text = _join(group, cfg)
        if not text:
            continue

        start_time = group[0].start
        end_time = max(word.end for word in group)

        if start_time < previous_cue_end:
            # Pequenos overlaps podem vir do ASR. Ajustamos somente o cue derivado.
            start_time = previous_cue_end
        if end_time <= start_time:
            raise ValueError(f"Cue sem duração positiva: {text}")

        cues.append(
            CaptionCue(
                text=text,
                start=round(start_time, 3),
                end=round(end_time, 3),
            )
        )
        previous_cue_end = end_time

    return tuple(cues)
