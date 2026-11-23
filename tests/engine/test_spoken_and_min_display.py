"""Números pela forma falada e duração mínima das legendas (D-025)."""

import unittest

from engine.alignment.ctc import tokenize_spoken
from engine.alignment.spoken import spoken_form
from engine.models import WordToken
from engine.segmentation import SegmentationConfig, segment_words
from engine.segmentation.segmenter import MIN_DISPLAY_SECONDS


class SpokenFormTest(unittest.TestCase):
    def test_spanish_numbers(self):
        cases = {
            "100,": "cien",
            "200.": "doscientos",
            "200.000": "doscientos mil",
            "₲200.000": "doscientos mil",
            "31": "treinta y uno",
            "2024": "dos mil veinticuatro",
            "1,5": "uno coma cinco",
            "50%": "cincuenta por ciento",
            "1.000.000": "un millón",
        }
        for written, spoken in cases.items():
            with self.subTest(written=written):
                self.assertEqual(spoken_form(written, "es"), spoken)

    def test_portuguese_and_english(self):
        self.assertEqual(spoken_form("121", "pt"), "cento e vinte e um")
        self.assertEqual(spoken_form("2.500", "pt"), "dois mil quinhentos")
        self.assertEqual(spoken_form("1,500", "en"), "one thousand five hundred")

    def test_words_and_unknown_languages_are_untouched(self):
        self.assertEqual(spoken_form("Mercado", "es"), "Mercado")
        self.assertEqual(spoken_form("4x4", "es"), "4x4")
        self.assertEqual(spoken_form("100", "fr"), "100")

    def test_tokenize_spoken_joins_parts_with_delimiter(self):
        vocab = {"<pad>": 0, "|": 1, "d": 2, "o": 3, "s": 4, "m": 5, "i": 6, "l": 7}
        self.assertEqual(tokenize_spoken(["dos mil"], vocab, 1), [[2, 3, 4, 1, 5, 6, 7]])


def words(*items):
    return [WordToken(text=t, start=s, end=e) for t, s, e in items]


class MinimumDisplayTest(unittest.TestCase):
    def test_no_caption_shorter_than_three_frames(self):
        # Caso real: "Y" falado em 40 ms antes de "quien se".
        result = segment_words(
            words(("piso.", 18.94, 19.14), ("Y", 19.22, 19.26), ("quien", 19.30, 19.44), ("se", 19.48, 19.54), ("ponga", 19.64, 19.92)),
            SegmentationConfig(target_words=2),
        )
        for cue in result:
            self.assertGreaterEqual(round(cue.end - cue.start, 3), MIN_DISPLAY_SECONDS, cue.text)
        self.assertNotIn("Y", [cue.text for cue in result])

    def test_conjunction_attaches_forward(self):
        result = segment_words(
            words(("Y", 0.0, 0.2), ("quien", 0.2, 0.5), ("gana", 0.5, 0.9)),
            SegmentationConfig(target_words=1),
        )
        self.assertEqual(result[0].text, "Y quien")

    def test_forced_short_caption_still_gets_minimum_time(self):
        # Contagem isolada por regra estrutural: cada número fica, no mínimo, 3 frames.
        result = segment_words(
            words(("3", 0.0, 0.05), ("2", 0.06, 0.1), ("1", 0.11, 0.15)),
            SegmentationConfig(target_words=1),
        )
        self.assertEqual([cue.text for cue in result], ["3", "2", "1"])
        for left, right in zip(result, result[1:]):
            self.assertGreaterEqual(round(left.end - left.start, 3), MIN_DISPLAY_SECONDS)
            self.assertLessEqual(left.end, right.start)


if __name__ == "__main__":
    unittest.main()
