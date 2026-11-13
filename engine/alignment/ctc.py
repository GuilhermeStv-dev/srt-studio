"""Alinhamento forçado CTC (Viterbi) em numpy puro.

Recebe log-probabilidades por frame de um modelo acústico CTC (wav2vec2) e o
texto já conhecido, e devolve em qual frame cada palavra começa e termina.
Não depende de torch: o modelo roda no onnxruntime (ver `onnx_aligner.py`).
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

WORD_DELIMITER = "|"


@dataclass(frozen=True, slots=True)
class WordSpan:
    """Intervalo de frames [start_frame, end_frame) de uma palavra alinhada."""

    word_index: int
    start_frame: int
    end_frame: int
    score: float


def _fold_char(char: str, vocab: Mapping[str, int]) -> str | None:
    if char in vocab:
        return char
    # Letras com diacrítico fora do vocabulário (ex.: "â", "ç") caem na letra base.
    base = unicodedata.normalize("NFD", char)[0]
    return base if base in vocab else None


def tokenize_words(words: Sequence[str], vocab: Mapping[str, int]) -> list[list[int]]:
    """Converte cada palavra nos ids de caractere do vocabulário do modelo.

    Pontuação, dígitos e símbolos sem som próprio no vocabulário são descartados;
    uma palavra pode ficar sem tokens (ex.: "50", "₲") e terá o tempo interpolado.
    """

    tokenized: list[list[int]] = []
    for word in words:
        ids: list[int] = []
        for char in word.lower():
            if char == WORD_DELIMITER or char.isspace():
                continue
            folded = _fold_char(char, vocab)
            if folded is not None:
                ids.append(vocab[folded])
        tokenized.append(ids)
    return tokenized


def _viterbi(log_probs: np.ndarray, targets: Sequence[int], blank: int) -> np.ndarray:
    """Devolve, para cada frame, o índice do estado na sequência estendida
    [blank, t0, blank, t1, ..., blank]."""

    num_frames = log_probs.shape[0]
    states = [blank]
    for token in targets:
        states.extend((token, blank))
    states_arr = np.asarray(states, dtype=np.int64)
    num_states = len(states)

    # Pular o blank (s-2 -> s) só é permitido entre tokens diferentes.
    can_skip = np.zeros(num_states, dtype=bool)
    for s in range(2, num_states):
        can_skip[s] = states[s] != blank and states[s] != states[s - 2]

    neg_inf = -np.inf
    score = np.full(num_states, neg_inf)
    score[0] = log_probs[0, blank]
    if num_states > 1:
        score[1] = log_probs[0, states[1]]
    backpointer = np.zeros((num_frames, num_states), dtype=np.int8)

    for t in range(1, num_frames):
        stay = score
        step = np.concatenate(([neg_inf], score[:-1]))
        skip = np.where(can_skip, np.concatenate(([neg_inf, neg_inf], score[:-2])), neg_inf)
        candidates = np.stack((stay, step, skip))
        choice = np.argmax(candidates, axis=0)
        score = candidates[choice, np.arange(num_states)] + log_probs[t, states_arr]
        backpointer[t] = choice

    # O caminho termina no último token ou no blank final.
    last = num_states - 1
    if num_states > 1 and score[num_states - 2] > score[last]:
        last = num_states - 2
    if not np.isfinite(score[last]):
        raise ValueError("Áudio curto demais para o texto informado")

    path = np.empty(num_frames, dtype=np.int64)
    state = last
    for t in range(num_frames - 1, -1, -1):
        path[t] = state
        state -= int(backpointer[t, state])
    return path


def align_words(
    log_probs: np.ndarray,
    tokenized_words: Sequence[Sequence[int]],
    *,
    blank: int,
    delimiter: int | None = None,
) -> list[WordSpan]:
    """Alinha as palavras tokenizadas às log-probabilidades (frames x vocab).

    Palavras sem tokens não aparecem no resultado; o chamador interpola o tempo.
    """

    targets: list[int] = []
    owners: list[int] = []
    for word_index, ids in enumerate(tokenized_words):
        if not ids:
            continue
        if targets and delimiter is not None:
            targets.append(delimiter)
            owners.append(-1)
        targets.extend(ids)
        owners.extend([word_index] * len(ids))

    if not targets:
        return []
    if log_probs.shape[0] < len(targets):
        raise ValueError("Áudio curto demais para o texto informado")

    path = _viterbi(log_probs, targets, blank)

    first: dict[int, int] = {}
    last: dict[int, int] = {}
    scores: dict[int, list[float]] = {}
    for t, state in enumerate(path):
        if state % 2 == 0:  # blank
            continue
        owner = owners[(state - 1) // 2]
        if owner < 0:
            continue
        first.setdefault(owner, t)
        last[owner] = t
        scores.setdefault(owner, []).append(float(np.exp(log_probs[t, targets[(state - 1) // 2]])))

    return [
        WordSpan(
            word_index=owner,
            start_frame=first[owner],
            end_frame=last[owner] + 1,
            score=float(np.mean(scores[owner])),
        )
        for owner in sorted(first)
    ]
