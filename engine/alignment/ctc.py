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


_GARBAGE = -1


def _viterbi(
    log_probs: np.ndarray,
    targets: Sequence[int],
    blank: int,
    garbage_penalty: float | None = None,
) -> tuple[np.ndarray, int]:
    """Devolve, para cada frame, o índice do estado na sequência estendida
    [G?, blank, t0, blank, t1, ..., blank, G?] e o deslocamento do primeiro blank.

    Com `garbage_penalty`, estados "lixo" nas pontas absorvem fala que não
    pertence ao texto (o outro falante antes/depois da janela). Eles emitem com a
    probabilidade do símbolo mais provável menos a penalidade, então nunca vencem
    os caracteres do texto onde o texto realmente foi falado (D-020).
    """

    num_frames = log_probs.shape[0]
    core = [blank]
    for token in targets:
        core.extend((token, blank))
    use_garbage = garbage_penalty is not None
    states = ([_GARBAGE] if use_garbage else []) + core + ([_GARBAGE] if use_garbage else [])
    offset = 1 if use_garbage else 0
    num_states = len(states)

    emissions = np.empty((num_frames, num_states))
    token_states = [index for index, state in enumerate(states) if state != _GARBAGE]
    emissions[:, token_states] = log_probs[:, [states[index] for index in token_states]]
    if use_garbage:
        garbage = log_probs.max(axis=1) - float(garbage_penalty)
        emissions[:, 0] = garbage
        emissions[:, -1] = garbage

    # Pular o blank (s-2 -> s) só é permitido entre tokens diferentes; o lixo pode
    # pular direto para o primeiro token e ser alcançado a partir do último.
    can_skip = np.zeros(num_states, dtype=bool)
    for s in range(2, num_states):
        can_skip[s] = states[s] != blank and states[s] != states[s - 2]

    neg_inf = -np.inf
    score = np.full(num_states, neg_inf)
    score[offset] = emissions[0, offset]
    if offset + 1 < num_states:
        score[offset + 1] = emissions[0, offset + 1]
    if use_garbage:
        score[0] = emissions[0, 0]
    backpointer = np.zeros((num_frames, num_states), dtype=np.int8)
    columns = np.arange(num_states)

    for t in range(1, num_frames):
        stay = score
        step = np.concatenate(([neg_inf], score[:-1]))
        skip = np.where(can_skip, np.concatenate(([neg_inf, neg_inf], score[:-2])), neg_inf)
        candidates = np.stack((stay, step, skip))
        choice = np.argmax(candidates, axis=0)
        score = candidates[choice, columns] + emissions[t]
        backpointer[t] = choice

    # O caminho termina no último token, no blank final ou no lixo final.
    finals = [offset + len(core) - 1]
    if len(core) > 1:
        finals.append(offset + len(core) - 2)
    if use_garbage:
        finals.append(num_states - 1)
    last = max(finals, key=lambda index: score[index])
    if not np.isfinite(score[last]):
        raise ValueError("Áudio curto demais para o texto informado")

    path = np.empty(num_frames, dtype=np.int64)
    state = last
    for t in range(num_frames - 1, -1, -1):
        path[t] = state
        state -= int(backpointer[t, state])
    return path - offset, len(core)


def align_words(
    log_probs: np.ndarray,
    tokenized_words: Sequence[Sequence[int]],
    *,
    blank: int,
    delimiter: int | None = None,
    garbage_penalty: float | None = None,
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

    path, core_length = _viterbi(log_probs, targets, blank, garbage_penalty)

    first: dict[int, int] = {}
    last: dict[int, int] = {}
    scores: dict[int, list[float]] = {}
    for t, state in enumerate(path):
        if state < 0 or state >= core_length or state % 2 == 0:  # lixo ou blank
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
