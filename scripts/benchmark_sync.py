"""Mede a sincronização das legendas no vídeo inteiro, sem precisar de gabarito.

Uso (com o .venv do repositório):

    python scripts/benchmark_sync.py audio.wav transcricao.json [--language es] [--target 2]

`transcricao.json` é a saída de `engine.cli transcribe-text`. O script compara os
modelos de sincronização disponíveis (MMS e o antigo) e mede, no áudio inteiro:

- inicio_de_fala: quando a voz volta depois de um silêncio ≥ 0,12 s, uma legenda
  deveria começar ali. Mede a distância até a legenda mais próxima (mediana, p90 e
  quantas passam de 150 ms). É o "atraso/adiantamento" que o editor vê na timeline;
- legendas_curtas: legendas com menos de 3 frames a 24 fps;
- cruzam_silencio: legendas que atravessam um silêncio real ≥ 80 ms;
- palavras_esticadas: palavras com mais de 1,2 s (sinal de alinhamento perdido);
- confianca_baixa: palavras com confiança < 0,3 no alinhamento.

Não é um gabarito humano; é um termômetro geral que vale para qualquer vídeo.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.alignment import (  # noqa: E402
    align_segments,
    align_transcript_audio,
    load_alignment_model,
    load_audio,
    snap_words_to_speech,
)
from engine.alignment.mms import MMS_DIR_ENV, mms_available  # noqa: E402
from engine.alignment.aligner import SAMPLE_RATE, TextSegment  # noqa: E402
from engine.alignment.speech import find_silences  # noqa: E402
from engine.pipeline import SegmentationOptions, build_captions  # noqa: E402
from engine.segmentation.segmenter import MIN_DISPLAY_SECONDS  # noqa: E402

PHRASE_SILENCE = 0.12
ONSET_TOLERANCE = 0.15


def measure(label: str, words, audio, silences, target: int) -> dict:
    cues = build_captions(words, SegmentationOptions(target_words=target))
    starts = np.array([cue.start for cue in cues])
    onsets = [s.end for s in silences if s.duration >= PHRASE_SILENCE and s.end < len(audio) / SAMPLE_RATE - 0.2]
    errors = np.array([np.min(np.abs(starts - onset)) for onset in onsets]) if len(starts) else np.array([])
    short = sum(1 for cue in cues if cue.end - cue.start < MIN_DISPLAY_SECONDS - 1e-6)
    crossing = 0
    for cue in cues:
        inner = [w for w in words if cue.start - 1e-6 <= w.start < cue.end - 1e-6]
        # Silêncio real entre duas palavras da mesma legenda.
        if any(s.duration >= 0.08 and left.end - 0.02 <= s.start and s.end <= right.start + 0.02
               for left, right in zip(inner, inner[1:]) for s in silences):
            crossing += 1
    stretched = sum(1 for w in words if w.end - w.start > 1.2 and not w.break_after)
    low = sum(1 for w in words if w.probability is not None and w.probability < 0.3)
    result = {
        "legendas": len(cues),
        "inicio_de_fala_mediana_ms": round(float(np.median(errors)) * 1000) if errors.size else None,
        "inicio_de_fala_p90_ms": round(float(np.percentile(errors, 90)) * 1000) if errors.size else None,
        f"inicios_fora_>{int(ONSET_TOLERANCE * 1000)}ms": f"{int((errors > ONSET_TOLERANCE).sum())}/{len(errors)}",
        "legendas_curtas": short,
        "cruzam_silencio": crossing,
        "palavras_esticadas": stretched,
        "confianca_baixa": low,
    }
    print(f"\n{label}")
    for key, value in result.items():
        print(f"  {key:28} {value}")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("transcript")
    parser.add_argument("--language", default="es")
    parser.add_argument("--target", type=int, default=2)
    args = parser.parse_args()

    payload = json.loads(Path(args.transcript).read_text(encoding="utf-8-sig"))
    segments = [TextSegment(s["text"], s["start"], s["end"]) for s in payload["segments"]]
    audio = load_audio(args.audio)
    silences = find_silences(audio, SAMPLE_RATE)

    models = []
    if mms_available():
        models.append(("MMS fp32 (D-026)", load_alignment_model(args.language)))
    previous = os.environ.get(MMS_DIR_ENV)
    os.environ[MMS_DIR_ENV] = "__desligado__"
    models.append(("wav2vec2 por idioma (antigo)", load_alignment_model(args.language)))
    if previous is None:
        del os.environ[MMS_DIR_ENV]
    else:
        os.environ[MMS_DIR_ENV] = previous

    for label, model in models:
        old = snap_words_to_speech(align_segments(audio, segments, model), audio, SAMPLE_RATE)
        measure(f"{label} · parágrafo a parágrafo (D-022)", old, audio, silences, args.target)
        final = align_transcript_audio(audio, segments, model, language=args.language)
        measure(f"{label} · global + números falados (D-023/D-025)", snap_words_to_speech(final, audio, SAMPLE_RATE), audio, silences, args.target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
