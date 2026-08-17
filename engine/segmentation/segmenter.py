from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Sequence

from engine.models import CaptionCue, WordToken
from engine.normalization import remove_final_period

# Palavras curtas que normalmente ficam semanticamente ligadas ao termo seguinte.
# A lista é intencionalmente conservadora: "que" e outros termos ambíguos não entram
# para evitar forçar junções artificiais.
_ORPHAN_PRONE = {
    "a",
    "al",
    "con",
    "de",
    "del",
    "el",
    "en",
    "la",
    "las",
    "lo",
    "los",
    "o",
    "para",
    "por",
    "sin",
    "un",
    "una",
    "unos",
    "unas",
    "y",
    "e",
}

_WORD_EDGE = re.compile(r"^[¿¡\"'“‘([{]*|[?!,;:\"'”’\])}]+$")


@dataclass(frozen=True, slots=True)
class SegmentationConfig:
    target_chars: int = 12
    hard_max_chars: int = 24
    preferred_max_duration: float = 2.2
    strong_pause: float = 0.60

    def validate(self) -> None:
        if self.target_chars <= 0:
            raise ValueError("target_chars deve ser maior que zero")
        if self.hard_max_chars < self.target_chars:
            raise ValueError("hard_max_chars não pode ser menor que target_chars")
        if self.preferred_max_duration <= 0:
            raise ValueError("preferred_max_duration deve ser maior que zero")
        if self.strong_pause < 0:
            raise ValueError("strong_pause não pode ser negativo")


def _lexical(text: str) -> str:
    value = text.strip().lower()
    previous = None
    while value != previous:
        previous = value
        value = _WORD_EDGE.sub("", value).strip()
    return value


def _is_orphan_prone(text: str) -> bool:
    return _lexical(text) in _ORPHAN_PRONE


def _join(words: Sequence[WordToken]) -> str:
    return remove_final_period(" ".join(word.text.strip() for word in words if word.text.strip()))


def _internal_pause_penalty(words: Sequence[WordToken], config: SegmentationConfig) -> float:
    penalty = 0.0
    for left, right in zip(words, words[1:]):
        pause = max(0.0, right.start - left.end)
        if pause >= config.strong_pause:
            # Cruzar uma pausa forte deve ser excepcional.
            penalty += 120.0 + pause * 25.0
        elif pause >= 0.35:
            penalty += pause * 12.0
    return penalty


def _candidate_cost(
    words: Sequence[WordToken],
    *,
    starts_at_zero: bool,
    ends_at_last: bool,
    next_pause: float,
    config: SegmentationConfig,
) -> float:
    text = _join(words)
    if not text:
        return math.inf

    char_count = len(text)
    duration = words[-1].end - words[0].start
    if duration <= 0:
        return math.inf

    # A meta de caracteres é uma preferência: palavras longas isoladas continuam válidas.
    if len(words) > 1 and char_count > config.hard_max_chars:
        return math.inf

    cost = float((char_count - config.target_chars) ** 2)

    # Evita legendas de uma única palavra quando há alternativas razoáveis.
    if len(words) == 1 and not (starts_at_zero and ends_at_last):
        cost += 18.0
        if char_count <= 4:
            cost += 15.0

    # Artigos/preposições podem iniciar um cue quando estão junto do complemento
    # (ex.: "los premios", "en NuevaBet"). O que evitamos é deixá-los sozinhos
    # ou pendurados no fim de um cue.
    if len(words) == 1 and _is_orphan_prone(words[0].text):
        cost += 90.0
    if not ends_at_last and _is_orphan_prone(words[-1].text):
        cost += 52.0

    # Punição suave para cues longos no tempo; não é um corte rígido.
    if duration > config.preferred_max_duration:
        cost += (duration - config.preferred_max_duration) * 14.0

    cost += _internal_pause_penalty(words, config)

    # Premia limites naturais de fala/pontuação.
    tail = words[-1].text.rstrip()
    if tail.endswith(("?", "!")):
        cost -= 12.0
    elif tail.endswith((",", ";", ":")):
        cost -= 4.0

    if next_pause >= config.strong_pause:
        cost -= min(18.0, 8.0 + next_pause * 8.0)
    elif next_pause >= 0.35:
        cost -= next_pause * 8.0

    # O último cue não deve ser artificialmente castigado só por ficar um pouco curto.
    if ends_at_last and char_count < config.target_chars:
        cost *= 0.82

    return max(cost, 0.0)


def segment_words(
    words: Sequence[WordToken],
    config: SegmentationConfig | None = None,
) -> tuple[CaptionCue, ...]:
    """Segmenta WordToken em cues usando otimização global de baixo custo.

    O algoritmo usa programação dinâmica para evitar decisões gulosas que deixam
    um último cue ruim. O alvo de caracteres é preferência; integridade temporal
    e não-overlap são restrições.
    """

    cfg = config or SegmentationConfig()
    cfg.validate()

    if not words:
        return ()

    previous_start = -math.inf
    previous_end = -math.inf
    for word in words:
        if not word.text.strip():
            raise ValueError("WordToken vazio não pode ser segmentado")
        if not math.isfinite(word.start) or not math.isfinite(word.end):
            raise ValueError("WordToken contém timestamp não finito")
        if word.start < 0 or word.end <= word.start:
            raise ValueError(f"WordToken inválido: {word.text}")
        if word.start < previous_start:
            raise ValueError("WordToken com timestamp regressivo")
        # Overlap real entre palavras é tolerado pelo ASR, mas nunca pode produzir cue regressivo.
        previous_start = word.start
        previous_end = max(previous_end, word.end)

    n = len(words)
    best = [math.inf] * (n + 1)
    previous_cut: list[int | None] = [None] * (n + 1)
    best[0] = 0.0

    for start in range(n):
        if not math.isfinite(best[start]):
            continue

        for end in range(start, n):
            group = words[start : end + 1]
            text = _join(group)
            if not text:
                continue
            if len(group) > 1 and len(text) > cfg.hard_max_chars:
                break

            next_pause = 0.0
            if end + 1 < n:
                next_pause = max(0.0, words[end + 1].start - words[end].end)

            candidate = best[start] + _candidate_cost(
                group,
                starts_at_zero=start == 0,
                ends_at_last=end == n - 1,
                next_pause=next_pause,
                config=cfg,
            )

            if candidate < best[end + 1]:
                best[end + 1] = candidate
                previous_cut[end + 1] = start

    if previous_cut[n] is None:
        raise ValueError("Não foi possível encontrar segmentação válida")

    ranges: list[tuple[int, int]] = []
    cursor = n
    while cursor > 0:
        start = previous_cut[cursor]
        if start is None:
            raise ValueError("Segmentação incompleta")
        ranges.append((start, cursor))
        cursor = start
    ranges.reverse()

    cues: list[CaptionCue] = []
    previous_cue_end = -math.inf
    for start, end_exclusive in ranges:
        group = words[start:end_exclusive]
        text = _join(group)
        start_time = group[0].start
        end_time = max(word.end for word in group)

        if start_time < previous_cue_end:
            # ASR pode devolver pequeno overlap entre palavras vizinhas. Ajustamos apenas
            # o início do cue derivado, nunca o timestamp original do WordToken.
            start_time = previous_cue_end
        if end_time <= start_time:
            raise ValueError(f"Cue sem duração positiva: {text}")

        cues.append(CaptionCue(text=text, start=round(start_time, 3), end=round(end_time, 3)))
        previous_cue_end = end_time

    return tuple(cues)
