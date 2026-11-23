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


def tokenize_spoken(spoken_words: Sequence[str], vocab: Mapping[str, int], delimiter: int | None) -> list[list[int]]:
    """Como `tokenize_words`, mas cada item pode ter várias palavras faladas
    ("doscientos mil"): elas viram uma sequência só, separadas pelo delimitador."""

    tokenized: list[list[int]] = []
    for spoken in spoken_words:
        ids: list[int] = []
        for part in spoken.split():
            part_ids = tokenize_words([part], vocab)[0]
            if not part_ids:
                continue
            if ids and delimiter is not None:
                ids.append(delimiter)
            ids.extend(part_ids)
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


@dataclass(frozen=True, slots=True)
class GlobalSpan:
    """Palavra alinhada no áudio inteiro: índice global da palavra e frames."""

    word_index: int
    start_frame: int
    end_frame: int
    score: float


def align_transcript(
    log_probs: np.ndarray,
    tokenized_words: Sequence[Sequence[int]],
    windows: Sequence[tuple[int, int]],
    *,
    blank: int,
    delimiter: int | None = None,
    garbage_penalty: float = 2.0,
) -> list[GlobalSpan]:
    """Alinhamento forçado do texto inteiro contra o áudio inteiro (D-023).

    Um único Viterbi percorre todas as palavras, então um trecho difícil não empurra
    os seguintes para frente (o problema do alinhamento parágrafo a parágrafo).
    `windows[i]` = (primeiro, último) frame onde a palavra i pode estar — vem dos
    parágrafos do Whisper com margem larga — e restringe a busca a uma faixa, o que
    mantém memória e tempo lineares na duração. Entre palavras existe um estado
    "lixo" opcional que absorve fala não transcrita (risos, "eh", outra pessoa).
    """

    num_frames = log_probs.shape[0]
    # Estados: [G, B, tok..., B, (delim, B,) ... G] — G = lixo opcional entre palavras.
    kinds: list[int] = []  # id do token, blank, ou _GARBAGE
    owners: list[int] = []  # palavra dona do estado (-1 = sem dono)
    lo: list[int] = []
    hi: list[int] = []
    forced_skip: list[bool] = []

    def push(kind: int, owner: int, window: tuple[int, int], skip: bool = False) -> None:
        kinds.append(kind)
        owners.append(owner)
        lo.append(window[0])
        hi.append(window[1])
        forced_skip.append(skip)

    word_ids = [index for index, ids in enumerate(tokenized_words) if ids]
    if not word_ids:
        return []
    everything = (0, num_frames - 1)
    push(_GARBAGE, -1, (0, windows[word_ids[0]][1]))
    push(blank, -1, everything)
    for position, word_index in enumerate(word_ids):
        window = windows[word_index]
        if position > 0:
            previous = windows[word_ids[position - 1]]
            between = (previous[0], window[1])
            push(_GARBAGE, -1, between)
            push(blank, -1, between, skip=True)  # pode pular o lixo (blank -> blank)
            if delimiter is not None:
                push(delimiter, -1, between)
                push(blank, -1, between)
        for token in tokenized_words[word_index]:
            push(token, word_index, window)
            push(blank, -1, window)
    push(_GARBAGE, -1, (windows[word_ids[-1]][0], num_frames - 1))

    num_states = len(kinds)
    kinds_array = np.array(kinds)
    # Faixa monotônica: o estado s só existe entre os frames lo[s]..hi[s].
    lo_array = np.maximum.accumulate(np.clip(np.array(lo), 0, num_frames - 1))
    hi_array = np.minimum.accumulate(np.clip(np.array(hi), 0, num_frames - 1)[::-1])[::-1]
    hi_array = np.maximum(hi_array, lo_array)

    can_skip = np.zeros(num_states, dtype=bool)
    for s in range(2, num_states):
        can_skip[s] = forced_skip[s] or (kinds[s] != blank and kinds[s] != kinds[s - 2])

    is_garbage = kinds_array == _GARBAGE
    token_columns = np.where(is_garbage, 0, kinds_array)
    garbage_emission = log_probs.max(axis=1) - float(garbage_penalty)

    # Para cada frame, estados permitidos [first_state[t], last_state[t]].
    first_state = np.searchsorted(hi_array, np.arange(num_frames), side="left")
    last_state = np.searchsorted(lo_array, np.arange(num_frames), side="right") - 1

    neg_inf = -np.inf
    score = np.full(num_states, neg_inf)
    start_states = [0, 1, 2]
    for s in start_states:
        if s < num_states and lo_array[s] == 0:
            score[s] = garbage_emission[0] if is_garbage[s] else log_probs[0, token_columns[s]]
    backpointers: list[tuple[int, np.ndarray]] = [(0, np.zeros(0, dtype=np.int8))]

    for t in range(1, num_frames):
        a = int(first_state[t])
        b = int(last_state[t])
        if b < a:
            raise ValueError("Faixa de alinhamento vazia")
        # ext[i] = score do estado a - 2 + i (fora do vetor = -inf).
        pad = max(0, 2 - a)
        ext = np.concatenate((np.full(pad, neg_inf), score[max(0, a - 2):b + 1]))
        stay = ext[2:]
        step = ext[1:-1]
        skip = np.where(can_skip[a:b + 1], ext[:-2], neg_inf)
        candidates = np.stack((stay, step, skip))
        choice = np.argmax(candidates, axis=0)
        # Lixo emite o melhor símbolo do frame menos a penalidade.
        emission = np.where(is_garbage[a:b + 1], garbage_emission[t], log_probs[t, token_columns[a:b + 1]])
        new_band = candidates[choice, np.arange(b - a + 1)] + emission
        score[:a] = neg_inf
        score[a:b + 1] = new_band
        score[b + 1:] = neg_inf
        backpointers.append((a, choice.astype(np.int8)))

    finals = [num_states - 1, num_states - 2, num_states - 3]
    last = max((s for s in finals if s >= 0), key=lambda s: score[s])
    if not np.isfinite(score[last]):
        raise ValueError("Não foi possível alinhar o texto ao áudio")

    path = np.empty(num_frames, dtype=np.int64)
    state = last
    for t in range(num_frames - 1, -1, -1):
        path[t] = state
        if t == 0:
            break
        a, choice = backpointers[t]
        state -= int(choice[state - a])

    first: dict[int, int] = {}
    final: dict[int, int] = {}
    scores: dict[int, list[float]] = {}
    for t, state in enumerate(path):
        owner = owners[state]
        if owner < 0:
            continue
        first.setdefault(owner, t)
        final[owner] = t
        scores.setdefault(owner, []).append(float(np.exp(log_probs[t, kinds[state]])))

    return [
        GlobalSpan(word_index=owner, start_frame=first[owner], end_frame=final[owner] + 1, score=float(np.mean(scores[owner])))
        for owner in sorted(first)
    ]


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
