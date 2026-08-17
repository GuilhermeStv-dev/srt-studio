import unittest

from engine.models import WordToken
from engine.normalization import normalize_monetary_tokens
from engine.segmentation import SegmentationConfig, segment_words


def words(*items: tuple[str, float, float]) -> list[WordToken]:
    return [WordToken(text=text, start=start, end=end) for text, start, end in items]


class SegmentationTests(unittest.TestCase):
    def test_empty_input(self) -> None:
        self.assertEqual(segment_words([]), ())

    def test_one_word_per_caption(self) -> None:
        result = segment_words(
            words(
                ("Hola", 0.00, 0.20),
                ("mundo", 0.21, 0.50),
                ("ahora", 0.51, 0.80),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["Hola", "mundo", "ahora"])

    def test_two_words_per_caption(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 0.20),
                ("dos", 0.21, 0.40),
                ("tres", 0.41, 0.60),
                ("cuatro", 0.61, 0.80),
            ),
            SegmentationConfig(target_words=2, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["uno dos", "tres cuatro"])

    def test_three_words_per_caption(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 0.10),
                ("dos", 0.11, 0.20),
                ("tres", 0.21, 0.30),
                ("cuatro", 0.31, 0.40),
            ),
            SegmentationConfig(target_words=3, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["uno dos tres", "cuatro"])

    def test_four_words_per_caption(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 0.10),
                ("dos", 0.11, 0.20),
                ("tres", 0.21, 0.30),
                ("cuatro", 0.31, 0.40),
                ("cinco", 0.41, 0.50),
            ),
            SegmentationConfig(target_words=4, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["uno dos tres cuatro", "cinco"])

    def test_preposition_can_be_ignored_in_count(self) -> None:
        result = segment_words(
            words(
                ("para", 0.00, 0.18),
                ("vos", 0.19, 0.40),
                ("ahora", 0.41, 0.70),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["para vos", "ahora"])

    def test_preposition_counts_when_option_is_disabled(self) -> None:
        result = segment_words(
            words(
                ("para", 0.00, 0.18),
                ("vos", 0.19, 0.40),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["para", "vos"])

    def test_preserves_punctuation_when_enabled(self) -> None:
        result = segment_words(
            words(
                ("¿Hola,", 0.00, 0.30),
                ("qué?", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_punctuation=True),
        )
        self.assertEqual(result[0].text, "¿Hola, qué?")

    def test_removes_edge_punctuation_when_disabled(self) -> None:
        result = segment_words(
            words(
                ("¿Hola,", 0.00, 0.30),
                ("qué?", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_punctuation=False),
        )
        self.assertEqual(result[0].text, "Hola qué")

    def test_punctuation_option_does_not_damage_numeric_separators(self) -> None:
        result = segment_words(
            words(("50.000", 0.00, 0.30)),
            SegmentationConfig(target_words=1, preserve_punctuation=False),
        )
        self.assertEqual(result[0].text, "50.000")

    def test_monetary_value_is_always_isolated_even_after_preposition(self) -> None:
        normalized = normalize_monetary_tokens(
            words(
                ("con", 0.00, 0.15),
                ("50.000", 0.16, 0.45),
                ("guaraníes", 0.46, 0.75),
                ("ahora", 0.76, 1.00),
            ),
            format_thousands=True,
        )
        result = segment_words(
            normalized,
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["con", "50 mil", "ahora"])

    def test_monetary_value_isolated_with_formatting_disabled(self) -> None:
        normalized = normalize_monetary_tokens(
            words(
                ("con", 0.00, 0.15),
                ("50.000", 0.16, 0.45),
                ("guaraníes", 0.46, 0.75),
                ("ahora", 0.76, 1.00),
            ),
            format_thousands=False,
        )
        result = segment_words(
            normalized,
            SegmentationConfig(target_words=4, ignore_prepositions=True),
        )
        self.assertEqual(
            [cue.text for cue in result],
            ["con", "50.000 guaraníes", "ahora"],
        )

    def test_cues_are_positive_and_non_overlapping(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 0.40),
                ("dos", 0.35, 0.70),
                ("tres", 0.72, 1.00),
                ("cuatro", 1.02, 1.35),
            ),
            SegmentationConfig(target_words=2, ignore_prepositions=False),
        )
        for cue in result:
            self.assertGreater(cue.end, cue.start)
        for left, right in zip(result, result[1:]):
            self.assertLessEqual(left.end, right.start)


if __name__ == "__main__":
    unittest.main()
