from __future__ import annotations

import math
import re
import statistics
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

# Classes curtas usadas somente para pontuar coesão entre duas palavras.
# Elas não são uma análise gramatical completa e não alteram o texto reconhecido.
_ARTICLES = {"el", "la", "los", "las", "un", "una", "unos", "unas"}
_CLITICS = {"me", "te", "se", "nos", "lo", "la", "los", "las", "le", "les"}
_PARTICLES = {"ya", "no", "sí", "si", "más", "mas", "muy", "también", "tambien"}
_QUESTION_WORDS = {
    "qué",
    "que",
    "quién",
    "quien",
    "cómo",
    "como",
    "cuál",
    "cual",
    "cuáles",
    "cuales",
    "dónde",
    "donde",
    "cuándo",
    "cuando",
}
_COHESIVE_PAIRS = {
    ("qué", "tal"),
    ("que", "tal"),
    ("por", "qué"),
    ("por", "que"),
}

# Limpeza ampla usada APENAS para comparação lexical interna, por exemplo para
# reconhecer "para," como preposição. Não define o texto final da caption.
_LEXICAL_EDGE_PUNCTUATION = re.compile(r"^[¿¡\"'“”‘’([{]+|[?!,.;:…\"'“”‘’)\]}]+$")

# A opção exposta ao usuário controla somente vírgulas e pontos nas bordas.
# ¿ ? ¡ ! (e demais sinais) são sempre preservados no texto final.
_OPTIONAL_EDGE_PUNCTUATION = re.compile(r"^[,.]+|[,.]+$")
_TERMINAL_PUNCTUATION = re.compile(r"[?!]$")
_SOFT_PUNCTUATION = re.compile(r"[,.]$")
_MIN_SAFE_DURATION = 0.05


@dataclass(frozen=True, slots=True)
class SegmentationConfig:
    target_words: int = 2
    ignore_prepositions: bool = True
    preserve_commas_periods: bool = True

    def validate(self) -> None:
        if self.target_words not in {1, 2, 3, 4}:
            raise ValueError("target_words deve ser 1, 2, 3 ou 4")


def _strip_lexical_edge_punctuation(text: str) -> str:
    value = text.strip()
    previous = None
    while value != previous:
        previous = value
        value = _LEXICAL_EDGE_PUNCTUATION.sub("", value).strip()
    return value


def _strip_optional_commas_periods(text: str) -> str:
    value = text.strip()
    previous = None
    while value != previous:
        previous = value
        value = _OPTIONAL_EDGE_PUNCTUATION.sub("", value).strip()
    return value


def _lexical(text: str) -> str:
    return _strip_lexical_edge_punctuation(text).lower()


def _counts_toward_target(text: str, config: SegmentationConfig) -> bool:
    lexical = _lexical(text)
    if not lexical:
        return False
    return not (config.ignore_prepositions and lexical in _PREPOSITIONS)


def _render_token(text: str, preserve_commas_periods: bool) -> str:
    normalized = normalize_whitespace(text)
    if preserve_commas_periods:
        return normalized
    return _strip_optional_commas_periods(normalized)


def _join(words: Sequence[WordToken], config: SegmentationConfig) -> str:
    rendered = (
        _render_token(word.text, config.preserve_commas_periods)
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


def _gap(left: WordToken, right: WordToken) -> float:
    return max(0.0, right.start - left.end)


def _pair_cohesion(
    left: WordToken,
    right: WordToken,
    config: SegmentationConfig,
) -> float:
    """Retorna um score curto de coesão lexical entre palavras adjacentes.

    O score serve apenas para evitar cortes evidentemente ruins, como `qué` / `tal`,
    e para permitir pares curtos no modo de 1 palavra. Uma pausa forte sempre vence.
    Coesão baseada em preposição só é aplicada quando o usuário escolheu ignorar
    preposições na contagem; desligar a opção volta a tratá-las como palavras normais.
    """

    left_text = _lexical(left.text)
    right_text = _lexical(right.text)
    score = 0.0

    if (left_text, right_text) in _COHESIVE_PAIRS:
        score += 5.0
    if left_text in _ARTICLES:
        score += 3.0
    if config.ignore_prepositions and right_text in _PREPOSITIONS:
        # Ex.: `participar en`.
        score += 2.8
    if config.ignore_prepositions and left_text in _PREPOSITIONS:
        # Ex.: `para vos`.
        score += 2.5
    if right_text in _CLITICS:
        # Ex.: `quién se`.
        score += 2.6
    if right_text in _PARTICLES:
        # Ex.: `acá ya`.
        score += 2.0
    if left_text in _QUESTION_WORDS and right_text in (_CLITICS | _ARTICLES):
        score += 1.5

    return score


def _count_target_words(words: Sequence[WordToken], config: SegmentationConfig) -> int:
    return sum(1 for word in words if _counts_toward_target(word.text, config))


def _pause_thresholds(words: Sequence[WordToken]) -> tuple[float, float]:
    """Calcula limiares adaptativos sem deixar pausas longas contaminarem a base."""

    if len(words) < 2:
        return 0.32, 0.16

    gaps = [_gap(left, right) for left, right in zip(words, words[1:])]
    # Pausas já claramente longas não devem elevar o próprio limiar que deveria
    # detectá-las. A base rítmica usa somente gaps curtos/usuais do trecho.
    cadence_gaps = [gap for gap in gaps if gap <= 0.25]
    median_gap = statistics.median(cadence_gaps) if cadence_gaps else 0.08
    hard_pause = max(0.32, median_gap * 3.0)
    soft_pause = max(0.16, median_gap * 1.8)
    return hard_pause, soft_pause


def _candidate_cost(
    words: Sequence[WordToken],
    start: int,
    end: int,
    config: SegmentationConfig,
    *,
    hard_pause: float,
    soft_pause: float,
) -> float:
    """Custo de transformar words[start:end] em uma caption.

    Menor é melhor. O alvo de palavras é uma preferência forte, enquanto pausas,
    pontuação e coesão de pares podem mover a quebra em uma palavra para evitar
    segmentações artificiais.
    """

    group = words[start:end]
    total_tokens = len(group)

    # Moeda é uma regra estrutural superior a qualquer heurística.
    if any(word.kind == "monetary" for word in group):
        if total_tokens != 1 or group[0].kind != "monetary":
            return math.inf

    # A inteligência pode expandir no máximo uma palavra física além do alvo.
    # Isso permite `qué tal` no alvo 1 sem transformar uma frase inteira em caption.
    if total_tokens > config.target_words + 1:
        return math.inf

    counted_words = _count_target_words(group, config)
    cost = 0.0

    if counted_words == 0:
        cost += 1.0
    elif counted_words < config.target_words:
        missing = config.target_words - counted_words
        cost += missing * 0.8
        # Captions curtas no meio da fala são menos desejáveis; no final são naturais.
        if end < len(words):
            cost += missing * 1.4
    elif counted_words > config.target_words:
        # Exceder o alvo só vale quando coesão/cadência compensarem claramente.
        cost += (counted_words - config.target_words) * 4.0

    # Coesão e cadência dentro da caption.
    for index in range(start, end - 1):
        left = words[index]
        right = words[index + 1]
        gap = _gap(left, right)

        # Pausa forte é uma fronteira obrigatória, mesmo em expressão coesa.
        if gap >= hard_pause:
            return math.inf

        cost -= _pair_cohesion(left, right, config)
        if gap <= 0.06:
            cost -= 0.7
        elif gap <= soft_pause:
            cost -= 0.2
        else:
            cost += 1.0

    # Qualidade da fronteira depois da caption.
    if end < len(words):
        left = words[end - 1]
        right = words[end]
        gap = _gap(left, right)
        cohesion = _pair_cohesion(left, right, config)

        if gap >= hard_pause:
            cost -= 5.0
        elif gap >= soft_pause:
            cost -= 1.2
        else:
            # Cortar duas palavras fortemente ligadas é caro quando foram faladas coladas.
            cost += cohesion * 1.35
            if gap <= 0.04:
                cost += 0.4

        if _TERMINAL_PUNCTUATION.search(left.text.strip()):
            cost -= 4.0
        elif _SOFT_PUNCTUATION.search(left.text.strip()):
            cost -= 0.8

    # Terminar em preposição é levemente desencorajado somente quando preposições
    # participam do modo inteligente. Com a opção desligada, elas são palavras comuns.
    if (
        config.ignore_prepositions
        and end < len(words)
        and _lexical(group[-1].text) in _PREPOSITIONS
    ):
        cost += 0.2

    return cost


def _build_groups(
    words: Sequence[WordToken],
    config: SegmentationConfig,
) -> list[list[WordToken]]:
    """Escolhe globalmente as melhores fronteiras por programação dinâmica."""

    if not words:
        return []

    hard_pause, soft_pause = _pause_thresholds(words)
    count = len(words)
    best_cost = [math.inf] * (count + 1)
    next_boundary: list[int | None] = [None] * (count + 1)
    best_cost[count] = 0.0

    for start in range(count - 1, -1, -1):
        max_end = min(count, start + config.target_words + 1)
        for end in range(start + 1, max_end + 1):
            candidate = _candidate_cost(
                words,
                start,
                end,
                config,
                hard_pause=hard_pause,
                soft_pause=soft_pause,
            )
            if not math.isfinite(candidate) or not math.isfinite(best_cost[end]):
                continue

            total = candidate + best_cost[end]
            if total < best_cost[start]:
                best_cost[start] = total
                next_boundary[start] = end

    groups: list[list[WordToken]] = []
    index = 0
    while index < count:
        boundary = next_boundary[index]
        if boundary is None:
            raise ValueError("Não foi possível encontrar uma segmentação válida")
        groups.append(list(words[index:boundary]))
        index = boundary

    return groups


def segment_words(
    words: Sequence[WordToken],
    config: SegmentationConfig | None = None,
) -> tuple[CaptionCue, ...]:
    """Segmenta WordToken usando alvo de palavras + cadência + coesão curta.

    `target_words` aceita 1–4 e funciona como preferência forte, não como corte
    mecânico. Pausas reais entre timestamps, pontuação e coesão de pares podem
    mover a fronteira em uma palavra. A expansão é curta: no alvo 1, por exemplo,
    `qué tal` pode ficar junto, mas uma frase de três palavras não é preservada só
    por fazer sentido semanticamente. Pausas fortes sempre vencem a coesão.

    Com `ignore_prepositions=True`, preposições não consomem uma vaga e entram no
    score de coesão. Com a opção desligada, voltam a ser palavras normais. Tokens
    `kind="monetary"` continuam sempre isolados. `preserve_commas_periods`
    controla apenas vírgulas/pontos; ¿ ? ¡ ! são sempre preservados.
    """

    cfg = config or SegmentationConfig()
    cfg.validate()

    if not words:
        return ()

    _validate_words(words)
    groups = _build_groups(words, cfg)

    cues: list[CaptionCue] = []
    previous_cue_end = -math.inf

    for index, group in enumerate(groups):
        text = _join(group, cfg)
        if not text:
            continue

        start_time = group[0].start
        end_time = max(word.end for word in group)

        if start_time < previous_cue_end:
            # Pequenos overlaps podem vir do ASR. Ajustamos somente o cue derivado.
            start_time = previous_cue_end
        if end_time <= start_time:
            next_group_start = groups[index + 1][0].start if index + 1 < len(groups) else None
            if next_group_start is not None and next_group_start > start_time:
                end_time = max(next_group_start, start_time + _MIN_SAFE_DURATION)
            else:
                end_time = start_time + _MIN_SAFE_DURATION

        cues.append(
            CaptionCue(
                text=text,
                start=round(start_time, 3),
                end=round(end_time, 3),
            )
        )
        previous_cue_end = end_time

    return tuple(cues)
