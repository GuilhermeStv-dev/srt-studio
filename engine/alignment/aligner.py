"""Sincronização palavra-a-palavra por alinhamento forçado (D-019).

O texto já revisado de cada parágrafo é alinhado ao áudio com um modelo
acústico wav2vec2 CTC rodando no onnxruntime. Cada parágrafo é alinhado só
dentro da sua própria janela de tempo (com margem), o que mantém memória e
erros locais.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np

from engine.alignment.ctc import align_transcript, align_words, tokenize_spoken, tokenize_words
from engine.alignment.spoken import spoken_form
from engine.models import WordToken

SAMPLE_RATE = 16000
# A janela do Whisper sem tempo por palavra pode errar o parágrafo em mais de 1 s.
# Margem larga + estados "lixo" nas pontas: a fala vizinha é absorvida sem empurrar
# as palavras do parágrafo para o lugar errado (D-020).
WINDOW_PADDING = 1.5
GARBAGE_PENALTY = 2.0
_MIN_WORD_DURATION = 0.04

ProgressCallback = Callable[[str, float | None], None]


class AlignmentError(RuntimeError):
    """Falha ao preparar ou executar a sincronização."""


@dataclass(frozen=True, slots=True)
class AlignmentModelSpec:
    repo_id: str
    filename: str
    license: str


# Modelos wav2vec2-large-xlsr-53 de Jonatas Grosman (Apache-2.0) exportados para
# ONNX e quantizados. Baixados uma vez no primeiro uso, como os modelos Whisper.
ALIGNMENT_MODELS: dict[str, AlignmentModelSpec] = {
    "es": AlignmentModelSpec("XDcobra/wav2vec2-large-xlsr-53-spanish-ONNX", "onnx/model_int8.onnx", "apache-2.0"),
    "pt": AlignmentModelSpec("onnx-community/wav2vec2-large-xlsr-53-portuguese-ONNX", "onnx/model_q4.onnx", "apache-2.0"),
    "en": AlignmentModelSpec("Xenova/wav2vec2-large-xlsr-53-english", "onnx/model_int8.onnx", "apache-2.0"),
}


@dataclass(frozen=True, slots=True)
class TextSegment:
    """Parágrafo de texto com a janela aproximada (do Whisper) onde foi falado."""

    text: str
    start: float
    end: float


class OnnxCtcModel:
    def __init__(self, model_path: str | Path, vocab: dict[str, int]) -> None:
        try:
            import onnxruntime as ort  # type: ignore[import-not-found]
        except ImportError as exc:
            raise AlignmentError("onnxruntime não está instalado") from exc

        options = ort.SessionOptions()
        options.log_severity_level = 3
        self._session = ort.InferenceSession(
            str(model_path), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self._input_name = self._session.get_inputs()[0].name
        self.vocab = vocab
        self.blank = vocab.get("<pad>", 0)
        self.delimiter = vocab.get("|")

    def log_probs(self, audio: np.ndarray) -> np.ndarray:
        normalized = (audio - audio.mean()) / np.sqrt(audio.var() + 1e-7)
        logits = self._session.run(None, {self._input_name: normalized[None, :].astype(np.float32)})[0][0]
        return logits - np.logaddexp.reduce(logits, axis=1, keepdims=True)


def load_alignment_model(
    language: str,
    progress_callback: ProgressCallback | None = None,
) -> OnnxCtcModel:
    # D-026: o MMS da Meta (feito para sincronização, multilíngue) tem prioridade
    # quando está instalado; o wav2vec2 por idioma fica como reserva.
    from engine.alignment.mms import MmsCtcModel, mms_available

    if mms_available():
        if progress_callback is not None:
            progress_callback("loading_aligner", None)
        try:
            return MmsCtcModel()
        except Exception:  # noqa: BLE001 - arquivo corrompido/versão do onnxruntime: usa a reserva
            pass

    spec = ALIGNMENT_MODELS.get(language)
    if spec is None:
        supported = ", ".join(sorted(ALIGNMENT_MODELS))
        raise AlignmentError(
            f"Ainda não há modelo de sincronização para o idioma '{language}'. Idiomas suportados: {supported}."
        )

    try:
        from huggingface_hub import hf_hub_download  # type: ignore[import-not-found]
    except ImportError as exc:
        raise AlignmentError("huggingface_hub não está instalado") from exc

    if progress_callback is not None:
        progress_callback("loading_aligner", None)
    def fetch(filename: str) -> str:
        # Cache local primeiro: depois do primeiro download funciona offline e sem checagem de rede.
        try:
            return hf_hub_download(spec.repo_id, filename, local_files_only=True)
        except Exception:  # noqa: BLE001 - arquivo ainda não está no cache
            return hf_hub_download(spec.repo_id, filename)

    try:
        vocab_path = fetch("vocab.json")
        model_path = fetch(spec.filename)
    except Exception as exc:  # noqa: BLE001 - erros de rede/cache variam por versão do hub
        raise AlignmentError(
            "Não foi possível baixar o modelo de sincronização. "
            "Conecte-se à internet no primeiro uso; depois ele funciona offline."
        ) from exc

    with open(vocab_path, encoding="utf-8") as handle:
        vocab = {str(key): int(value) for key, value in json.load(handle).items()}
    return OnnxCtcModel(model_path, vocab)


def load_audio(path: str | Path) -> np.ndarray:
    try:
        from faster_whisper import decode_audio  # type: ignore[import-not-found]
    except ImportError as exc:
        raise AlignmentError("faster-whisper não está instalado") from exc
    return decode_audio(str(path), sampling_rate=SAMPLE_RATE)


def _fill_unaligned(
    words: Sequence[str],
    spans: dict[int, tuple[float, float, float]],
    window_start: float,
    window_end: float,
) -> list[tuple[float, float, float | None]]:
    """Dá tempo às palavras sem som alinhável (ex.: "50", "₲") dividindo o
    intervalo entre as vizinhas alinhadas."""

    result: list[tuple[float, float, float | None]] = []
    index = 0
    while index < len(words):
        if index in spans:
            start, end, score = spans[index]
            result.append((start, end, score))
            index += 1
            continue

        run_end = index
        while run_end < len(words) and run_end not in spans:
            run_end += 1
        left = result[-1][1] if result else window_start
        right = spans[run_end][0] if run_end in spans else window_end
        if right - left < _MIN_WORD_DURATION * (run_end - index):
            right = left + _MIN_WORD_DURATION * (run_end - index)
        step = (right - left) / (run_end - index)
        for offset in range(run_end - index):
            result.append((left + step * offset, left + step * (offset + 1), None))
        index = run_end
    return result


# Alinhamento global (D-023): o modelo roda no áudio inteiro em blocos com contexto,
# e um único Viterbi encaixa o texto todo. Os parágrafos do Whisper só limitam a
# busca (com margem larga), sem empurrar uns aos outros.
FRAME_SAMPLES = 320  # passo do wav2vec2: 20 ms a 16 kHz
FRAME_SECONDS = FRAME_SAMPLES / SAMPLE_RATE
CHUNK_SECONDS = 20.0
CONTEXT_SECONDS = 1.0
GLOBAL_WINDOW_MARGIN = 3.0


def full_log_probs(
    audio: np.ndarray,
    model: Any,
    progress_callback: ProgressCallback | None = None,
) -> np.ndarray:
    """Log-probabilidades por frame de 20 ms para o áudio inteiro."""

    total = len(audio)
    total_frames = max(1, (total - 400) // FRAME_SAMPLES + 1)
    chunk = int(CHUNK_SECONDS * SAMPLE_RATE) // FRAME_SAMPLES * FRAME_SAMPLES
    context = int(CONTEXT_SECONDS * SAMPLE_RATE) // FRAME_SAMPLES * FRAME_SAMPLES
    result: np.ndarray | None = None
    chunk_starts = list(range(0, total, chunk))
    for index, core_start in enumerate(chunk_starts):
        start = max(0, core_start - context)
        end = min(total, core_start + chunk + context)
        piece = audio[start:end]
        if len(piece) < 400:
            break
        log_probs = model.log_probs(piece)
        if result is None:
            result = np.full((total_frames, log_probs.shape[1]), np.nan, dtype=np.float32)
        first_frame = core_start // FRAME_SAMPLES
        last_frame = min(total_frames, (core_start + chunk) // FRAME_SAMPLES)
        local_first = first_frame - start // FRAME_SAMPLES
        available = min(last_frame - first_frame, log_probs.shape[0] - local_first)
        if available > 0:
            result[first_frame:first_frame + available] = log_probs[local_first:local_first + available]
        if progress_callback is not None:
            progress_callback("aligning", min(0.85, 0.85 * (index + 1) / len(chunk_starts)))
    if result is None:
        raise AlignmentError("Áudio curto demais para sincronizar")
    # Frames que sobraram nas bordas dos blocos herdam o vizinho.
    missing = np.isnan(result[:, 0])
    if missing.any():
        filled = np.where(~missing)[0]
        nearest = filled[np.clip(np.searchsorted(filled, np.arange(total_frames)), 0, len(filled) - 1)]
        result[missing] = result[nearest[missing]]
    return result


def align_transcript_audio(
    audio: np.ndarray,
    segments: Sequence[TextSegment],
    model: Any,
    progress_callback: ProgressCallback | None = None,
    language: str = "es",
) -> tuple[WordToken, ...]:
    """Alinha todos os parágrafos de uma vez contra o áudio inteiro (D-023).

    Números são alinhados pela forma falada ("100" → "cien", D-025)."""

    duration = len(audio) / SAMPLE_RATE
    words: list[str] = []
    paragraph_end: list[bool] = []
    windows: list[tuple[int, int]] = []
    for segment in segments:
        parts = segment.text.split()
        if not parts:
            continue
        first = max(0, int((segment.start - GLOBAL_WINDOW_MARGIN) / FRAME_SECONDS))
        last = int((segment.end + GLOBAL_WINDOW_MARGIN) / FRAME_SECONDS)
        for index, part in enumerate(parts):
            words.append(part)
            paragraph_end.append(index == len(parts) - 1)
            windows.append((first, last))
    if not words:
        return ()

    log_probs = full_log_probs(audio, model, progress_callback)
    windows = [(min(a, log_probs.shape[0] - 1), min(b, log_probs.shape[0] - 1)) for a, b in windows]
    prepare = getattr(model, "prepare", None) or (lambda text: text)
    tokenized = tokenize_spoken(
        [prepare(spoken_form(word, language)) for word in words], model.vocab, model.delimiter
    )
    spans = align_transcript(
        log_probs,
        tokenized,
        windows,
        blank=model.blank,
        delimiter=model.delimiter,
        garbage_penalty=GARBAGE_PENALTY,
    )
    aligned = {
        span.word_index: (span.start_frame * FRAME_SECONDS, span.end_frame * FRAME_SECONDS, span.score)
        for span in spans
    }
    timed = _fill_unaligned(words, aligned, 0.0, duration)

    tokens: list[WordToken] = []
    previous_end = 0.0
    for index, (text, (start, end, score)) in enumerate(zip(words, timed)):
        start = max(start, previous_end)
        end = max(end, start + _MIN_WORD_DURATION)
        start_ms = round(start * 1000)
        end_ms = max(start_ms + 1, round(end * 1000))
        tokens.append(
            WordToken(
                text=text,
                start=start_ms / 1000,
                end=end_ms / 1000,
                probability=None if score is None or not math.isfinite(score) else round(score, 4),
                break_after=paragraph_end[index],
            )
        )
        previous_end = end_ms / 1000
    if progress_callback is not None:
        progress_callback("aligning", 0.99)
    return tuple(tokens)


def align_segments(
    audio: np.ndarray,
    segments: Sequence[TextSegment],
    model: Any,
    progress_callback: ProgressCallback | None = None,
) -> tuple[WordToken, ...]:
    """Alinha cada parágrafo dentro da sua janela e devolve WordTokens monotônicos."""

    duration = len(audio) / SAMPLE_RATE
    tokens: list[WordToken] = []
    previous_end = 0.0
    total = max(1, len(segments))

    for segment_index, segment in enumerate(segments):
        words = segment.text.split()
        if not words:
            continue

        window_start = max(0.0, min(segment.start, duration) - WINDOW_PADDING, previous_end)
        window_end = min(duration, max(segment.end, window_start) + WINDOW_PADDING)
        if window_end - window_start < 0.1:
            window_end = min(duration, window_start + 0.1)
        chunk = audio[int(window_start * SAMPLE_RATE):int(window_end * SAMPLE_RATE)]

        spans: dict[int, tuple[float, float, float]] = {}
        if len(chunk) > SAMPLE_RATE // 20:
            log_probs = model.log_probs(chunk)
            frame_duration = (len(chunk) / SAMPLE_RATE) / max(1, log_probs.shape[0])
            tokenized = tokenize_words(words, model.vocab)
            try:
                aligned = align_words(
                    log_probs,
                    tokenized,
                    blank=model.blank,
                    delimiter=model.delimiter,
                    garbage_penalty=GARBAGE_PENALTY,
                )
            except ValueError:
                aligned = []
            for span in aligned:
                spans[span.word_index] = (
                    window_start + span.start_frame * frame_duration,
                    window_start + span.end_frame * frame_duration,
                    span.score,
                )

        timed = _fill_unaligned(words, spans, window_start, window_end)
        last_index = len(words) - 1
        for word_index, (text, (start, end, score)) in enumerate(zip(words, timed)):
            start = max(start, previous_end)
            end = max(end, start + _MIN_WORD_DURATION)
            start_ms = round(start * 1000)
            end_ms = max(start_ms + 1, round(end * 1000))
            tokens.append(
                WordToken(
                    text=text,
                    start=start_ms / 1000,
                    end=end_ms / 1000,
                    probability=None if score is None or not math.isfinite(score) else round(score, 4),
                    # Fim de parágrafo = troca de fala provável: fronteira obrigatória de legenda.
                    break_after=word_index == last_index,
                )
            )
            previous_end = end_ms / 1000

        if progress_callback is not None:
            progress_callback("aligning", min(0.99, (segment_index + 1) / total))

    return tuple(tokens)
