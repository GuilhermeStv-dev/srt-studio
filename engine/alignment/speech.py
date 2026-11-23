"""Mapa de fala do áudio e encaixe das palavras nele (D-022).

O alinhamento CTC acerta a ordem e a posição aproximada das palavras, mas as
bordas (onde a voz começa e termina) saem com erro de ~50–150 ms, e o intervalo
entre duas palavras não diz se houve respiro de verdade. O editor resolve isso
olhando a forma de onda; aqui o engine faz o mesmo:

1. mede a energia do áudio em quadros de 10 ms e encontra os silêncios reais;
2. encosta o fim/início das palavras vizinhas nas bordas de cada silêncio;
3. grava em `WordToken.pause_after` quanto silêncio real existe depois de cada
   palavra (0.0 = fala contínua), para a segmentação cortar pelo ritmo da fala.

Se o áudio não tiver contraste suficiente entre fala e fundo (música alta, ruído),
nenhum silêncio é detectado e as palavras ficam como o alinhamento devolveu.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Sequence

import numpy as np

from engine.models import WordToken

FRAME_SECONDS = 0.01
# Silêncio mais curto que isso pode ser oclusiva dentro da palavra ("p", "t").
MIN_SILENCE = 0.06
# Distância máxima entre a fronteira do alinhamento e o silêncio real.
MAX_SNAP_DISTANCE = 0.25
# Contraste mínimo entre fala e fundo para confiar no mapa.
MIN_DYNAMIC_RANGE_DB = 15.0
_MIN_WORD = 0.04
_UNMEASURED_GAP = 0.35
INNER_SILENCE = 0.2


@dataclass(frozen=True, slots=True)
class Silence:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def frame_levels_db(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    hop = max(1, int(round(sample_rate * FRAME_SECONDS)))
    count = len(audio) // hop
    if count == 0:
        return np.zeros(0, dtype=np.float32)
    frames = np.asarray(audio[: count * hop], dtype=np.float32).reshape(count, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    return 20.0 * np.log10(rms + 1e-9)


def find_silences(audio: np.ndarray, sample_rate: int, min_silence: float = MIN_SILENCE) -> list[Silence]:
    """Trechos sem voz com pelo menos `min_silence` segundos."""

    levels = frame_levels_db(audio, sample_rate)
    if levels.size == 0:
        return []
    speech_level = float(np.percentile(levels, 95))
    floor = float(np.percentile(levels, 5))
    if speech_level - floor < MIN_DYNAMIC_RANGE_DB:
        return []
    # Limiar entre o fundo e a fala: perto do fundo, mas nunca acima de -30 dB da fala.
    threshold = min(floor + (speech_level - floor) * 0.3, speech_level - 30.0)
    threshold = max(threshold, floor + 4.0)
    quiet = levels < threshold

    silences: list[Silence] = []
    min_frames = int(round(min_silence / FRAME_SECONDS))
    index = 0
    total = len(quiet)
    while index < total:
        if not quiet[index]:
            index += 1
            continue
        end = index
        while end < total and quiet[end]:
            end += 1
        if end - index >= min_frames:
            silences.append(Silence(round(index * FRAME_SECONDS, 3), round(end * FRAME_SECONDS, 3)))
        index = end
    return silences


def _assign_silences(words: Sequence[WordToken], silences: Sequence[Silence]) -> dict[int, Silence]:
    """Liga cada silêncio à fronteira entre palavras mais próxima.

    Fronteira k = entre words[k] e words[k + 1]. Um silêncio só é aceito se a
    fronteira do alinhamento estiver a até MAX_SNAP_DISTANCE dele e se não engolir
    nenhuma das duas palavras inteiras.
    """

    boundaries: dict[int, Silence] = {}
    if len(words) < 2:
        return boundaries
    mids = np.array([(left.end + right.start) / 2 for left, right in zip(words, words[1:])])
    for silence in silences:
        center = (silence.start + silence.end) / 2
        k = int(np.argmin(np.abs(mids - center)))
        left, right = words[k], words[k + 1]
        # As duas bordas precisam estar perto do silêncio: o encaixe corrige o
        # acabamento, nunca move uma palavra de lugar (isso é papel do alinhamento).
        if abs(left.end - silence.start) > MAX_SNAP_DISTANCE or abs(right.start - silence.end) > MAX_SNAP_DISTANCE:
            continue
        # O silêncio não pode começar antes da palavra da esquerda nem terminar depois da direita.
        if silence.start < left.start + _MIN_WORD or silence.end > right.end + MAX_SNAP_DISTANCE:
            continue
        current = boundaries.get(k)
        if current is None or silence.duration > current.duration:
            boundaries[k] = silence
    return boundaries


def snap_words_to_speech(
    words: Sequence[WordToken],
    audio: np.ndarray,
    sample_rate: int,
) -> tuple[WordToken, ...]:
    """Encosta as bordas das palavras nos silêncios reais e mede `pause_after`."""

    if not words:
        return tuple(words)
    silences = find_silences(audio, sample_rate)
    if not silences:
        return tuple(words)

    duration = len(audio) / sample_rate
    boundaries = _assign_silences(words, silences)
    starts = [word.start for word in words]
    ends = [word.end for word in words]
    # Sem silêncio detectado = fala contínua (0.0). Exceção: se o próprio alinhamento
    # vê um buraco grande ali, o mapa pode ter falhado (ruído local); fica "não medido".
    pauses: list[float | None] = [
        None if index + 1 < len(words) and words[index + 1].start - word.end > _UNMEASURED_GAP else 0.0
        for index, word in enumerate(words)
    ]

    for k, silence in boundaries.items():
        ends[k] = max(starts[k] + _MIN_WORD, silence.start)
        starts[k + 1] = silence.end
        ends[k + 1] = max(ends[k + 1], starts[k + 1] + _MIN_WORD)
        pauses[k] = round(silence.end - max(ends[k], silence.start), 3)

    # Primeira palavra: começa onde a voz começa depois do silêncio inicial.
    first_silence = next((s for s in silences if s.end > starts[0] - MAX_SNAP_DISTANCE), None)
    if first_silence is not None and first_silence.start <= starts[0] + _MIN_WORD and abs(first_silence.end - starts[0]) <= MAX_SNAP_DISTANCE:
        starts[0] = min(first_silence.end, ends[0] - _MIN_WORD)
    # Última palavra: termina onde a voz termina; depois dela, só silêncio.
    last = len(words) - 1
    trailing = next((s for s in silences if s.start >= starts[last] + _MIN_WORD and abs(s.start - ends[last]) <= MAX_SNAP_DISTANCE), None)
    if trailing is not None:
        ends[last] = trailing.start
        pauses[last] = round(trailing.duration, 3)
    else:
        pauses[last] = round(max(0.0, duration - ends[last]), 3)

    # Uma palavra não contém um silêncio longo (≥ INNER_SILENCE): oclusivas duram
    # < 100 ms. Se o alinhamento esticou a palavra sobre um silêncio, ela fica do
    # lado onde está a maior parte da voz dela ("Vamos" 31,12–32,32 sobre 31,20–32,05).
    for index in range(len(words)):
        for silence in silences:
            overlap = min(ends[index], silence.end) - max(starts[index], silence.start)
            if overlap < INNER_SILENCE:
                continue
            voice_before = max(0.0, silence.start - starts[index])
            voice_after = max(0.0, ends[index] - silence.end)
            if voice_before < _MIN_WORD and voice_after < _MIN_WORD:
                continue  # palavra inteira no silêncio: não há para onde mover
            if voice_after >= voice_before:
                starts[index] = silence.end
            else:
                ends[index] = silence.start
                pauses[index] = round(silence.duration, 3) if pauses[index] is not None else None

    # Garantias: início nunca regride e toda palavra tem duração positiva.
    for index in range(len(words)):
        if index > 0 and starts[index] < starts[index - 1]:
            starts[index] = starts[index - 1]
        if ends[index] < starts[index] + _MIN_WORD:
            ends[index] = starts[index] + _MIN_WORD

    return tuple(
        replace(
            word,
            start=round(starts[index], 3),
            end=round(ends[index], 3),
            pause_after=pauses[index],
        )
        for index, word in enumerate(words)
    )
