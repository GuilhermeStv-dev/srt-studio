"""Mapa de fala medido no áudio e corte por blocos de fala (D-022)."""

import unittest

try:
    import numpy as np
except ImportError:  # pragma: no cover - CI instala numpy para esta suíte
    np = None

from engine.models import WordToken
from engine.pipeline import parse_reviewed_words
from engine.segmentation import SegmentationConfig, segment_words

if np is not None:
    from engine.alignment.speech import find_silences, snap_words_to_speech

SR = 16000


def synth(spans: list[tuple[float, float]], duration: float, noise_db: float = -60.0):
    """Áudio sintético: tom forte nos trechos de fala, ruído baixo no resto."""
    rng = np.random.default_rng(7)
    audio = rng.normal(0.0, 10 ** (noise_db / 20), int(duration * SR)).astype(np.float32)
    t = np.arange(len(audio)) / SR
    for start, end in spans:
        mask = (t >= start) & (t < end)
        audio[mask] += 0.3 * np.sin(2 * np.pi * 220 * t[mask])
    return audio


def word(text: str, start: float, end: float, pause_after: float | None = None) -> WordToken:
    return WordToken(text=text, start=start, end=end, pause_after=pause_after)


@unittest.skipIf(np is None, "numpy é necessário para o mapa de fala")
class FindSilencesTest(unittest.TestCase):
    def test_finds_real_pause_between_speech(self) -> None:
        audio = synth([(0.1, 0.8), (0.9, 1.5)], 1.6)
        silences = find_silences(audio, SR)
        inner = [s for s in silences if 0.5 < s.start < 1.0]
        self.assertEqual(len(inner), 1)
        self.assertAlmostEqual(inner[0].start, 0.8, delta=0.02)
        self.assertAlmostEqual(inner[0].end, 0.9, delta=0.02)

    def test_ignores_closure_shorter_than_minimum(self) -> None:
        audio = synth([(0.1, 0.5), (0.53, 1.0)], 1.1)
        self.assertFalse([s for s in find_silences(audio, SR) if 0.4 < s.start < 0.6])

    def test_no_contrast_means_no_map(self) -> None:
        rng = np.random.default_rng(1)
        audio = rng.normal(0, 0.1, SR).astype(np.float32)
        self.assertEqual(find_silences(audio, SR), [])


@unittest.skipIf(np is None, "numpy é necessário para o mapa de fala")
class SnapWordsTest(unittest.TestCase):
    def test_snaps_edges_to_silence_and_measures_pause(self) -> None:
        # Fala real: "El día de hoy" 0,10–0,80 | silêncio | "estamos" 0,90–1,30.
        audio = synth([(0.1, 0.8), (0.9, 1.3)], 1.6)
        aligned = [
            word("El", 0.12, 0.2),
            word("día", 0.25, 0.4),
            word("de", 0.45, 0.5),
            word("hoy", 0.55, 0.68),  # alinhamento terminou cedo
            word("estamos", 0.76, 1.1),  # e começou cedo
        ]
        snapped = snap_words_to_speech(aligned, audio, SR)
        self.assertAlmostEqual(snapped[3].end, 0.8, delta=0.02)
        self.assertAlmostEqual(snapped[4].start, 0.9, delta=0.02)
        self.assertAlmostEqual(snapped[3].pause_after, 0.1, delta=0.03)
        # Dentro do bloco não há silêncio: fala contínua.
        self.assertEqual([w.pause_after for w in snapped[:3]], [0.0, 0.0, 0.0])
        # Contratos: início nunca regride, duração positiva.
        for left, right in zip(snapped, snapped[1:]):
            self.assertLessEqual(left.start, right.start)
        self.assertTrue(all(w.end > w.start for w in snapped))

    def test_never_moves_a_word_far_from_where_it_was_aligned(self) -> None:
        # Silêncio logo depois de "cámara?", mas "Latin" está 1 s adiante: não puxa.
        audio = synth([(0.1, 0.9), (1.0, 1.4), (2.0, 2.6)], 2.8)
        aligned = [word("cámara?", 0.5, 0.88), word("Latin", 2.0, 2.4)]
        snapped = snap_words_to_speech(aligned, audio, SR)
        self.assertAlmostEqual(snapped[1].start, 2.0, delta=0.02)

    def test_word_never_spans_a_long_silence(self) -> None:
        # Caso real: "Vamos" alinhado 31,12–32,32 sobre um silêncio de 0,85 s.
        audio = synth([(0.1, 0.5), (1.4, 1.9)], 2.2)
        aligned = [word("ya.", 0.1, 0.45), word("Vamos", 0.5, 1.8)]
        snapped = snap_words_to_speech(aligned, audio, SR)
        self.assertAlmostEqual(snapped[1].start, 1.4, delta=0.03)

    def test_unchanged_without_usable_map(self) -> None:
        rng = np.random.default_rng(2)
        audio = rng.normal(0, 0.1, SR).astype(np.float32)
        words = (word("hola", 0.1, 0.4), word("gente", 0.5, 0.9))
        self.assertEqual(snap_words_to_speech(words, audio, SR), words)


class SpeechRunSegmentationTest(unittest.TestCase):
    def build(self) -> list[WordToken]:
        return [
            word("El", 0.10, 0.20, 0.0),
            word("día", 0.20, 0.40, 0.0),
            word("de", 0.40, 0.50, 0.0),
            word("hoy", 0.50, 0.80, 0.10),
            word("estamos", 0.90, 1.30, 0.12),
            word("por", 1.42, 1.50, 0.0),
            word("el", 1.50, 1.56, 0.0),
            word("Mercado", 1.56, 1.90, 0.4),
        ]

    def texts(self, target: int) -> list[str]:
        cues = segment_words(self.build(), SegmentationConfig(target_words=target))
        return [cue.text for cue in cues]

    def test_short_real_pause_is_a_boundary_for_every_target(self) -> None:
        for target in (1, 2, 3, 4):
            with self.subTest(target=target):
                for text in self.texts(target):
                    self.assertFalse("hoy estamos" in text or "estamos por" in text, text)

    def test_word_joins_its_own_speech_run_when_the_rule_allows(self) -> None:
        self.assertEqual(self.texts(3)[:2], ["El día de hoy", "estamos"])

    def test_run_splits_inside_itself_when_the_rule_does_not_allow(self) -> None:
        self.assertEqual(self.texts(2)[:3], ["El día", "de hoy", "estamos"])

    def test_cue_starts_where_the_voice_starts(self) -> None:
        cues = segment_words(self.build(), SegmentationConfig(target_words=3))
        self.assertEqual(cues[1].start, 0.9)

    def test_segment_payload_keeps_measured_pause(self) -> None:
        words = parse_reviewed_words([
            {"text": "hoy", "start": 0.5, "end": 0.8, "pause_after": 0.1},
            {"text": "estamos", "start": 0.9, "end": 1.3},
        ])
        self.assertEqual(words[0].pause_after, 0.1)
        self.assertIsNone(words[1].pause_after)
        with self.assertRaises(ValueError):
            parse_reviewed_words([{"text": "hoy", "start": 0.5, "end": 0.8, "pause_after": -1}])


if __name__ == "__main__":
    unittest.main()
