import unittest

from engine.models import WordToken
from engine.normalization import normalize_monetary_tokens
from engine.segmentation import SegmentationConfig, segment_words


def words(*items: tuple[str, float, float]) -> list[WordToken]:
    return [WordToken(text=text, start=start, end=end) for text, start, end in items]


class SegmentationTests(unittest.TestCase):
    def test_empty_input(self) -> None:
        self.assertEqual(segment_words([]), ())

    def test_one_word_target_keeps_neutral_words_separate(self) -> None:
        result = segment_words(
            words(
                ("Hola", 0.00, 0.20),
                ("mundo", 0.21, 0.50),
                ("ahora", 0.51, 0.80),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["Hola", "mundo", "ahora"])

    def test_two_words_per_caption_without_special_cadence(self) -> None:
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

    def test_three_words_per_caption_without_special_cadence(self) -> None:
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

    def test_four_words_per_caption_without_special_cadence(self) -> None:
        result = segment_words(
            words(
                ("un", 0.00, 0.10),
                ("dos", 0.11, 0.20),
                ("tres", 0.21, 0.30),
                ("va", 0.31, 0.40),
                ("cinco", 0.41, 0.50),
            ),
            SegmentationConfig(target_words=4, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["un dos tres va", "cinco"])

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

    def test_hard_caption_width_overrides_preposition_attachment(self) -> None:
        result = segment_words(
            words(
                ("extraordinario", 0.00, 0.34),
                ("para", 0.35, 0.55),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["extraordinario", "para"])

    def test_preposition_counts_when_option_is_disabled(self) -> None:
        result = segment_words(
            words(
                ("para", 0.00, 0.18),
                ("vos", 0.19, 0.40),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["para", "vos"])

    def test_one_word_target_keeps_que_tal_as_short_unit(self) -> None:
        result = segment_words(
            words(
                ("Hola,", 0.00, 0.22),
                ("¿qué", 0.36, 0.82),
                ("tal?", 0.82, 1.16),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["Hola,", "¿qué tal?"])

    def test_one_word_target_can_attach_preposition_to_previous_word(self) -> None:
        result = segment_words(
            words(
                ("participar", 0.00, 0.38),
                ("en", 0.38, 0.68),
                ("un", 0.68, 0.80),
                ("juego?", 0.80, 1.12),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["participar en", "un juego?"])

    def test_one_word_target_keeps_quien_se_but_not_three_word_sentence(self) -> None:
        result = segment_words(
            words(
                ("¿Quién", 0.00, 0.20),
                ("se", 0.20, 0.26),
                ("anima?", 0.26, 0.66),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["¿Quién se", "anima?"])

    def test_one_word_target_can_keep_short_particle_pair(self) -> None:
        result = segment_words(
            words(
                ("acá", 0.00, 0.35),
                ("ya", 0.35, 0.53),
                ("encontramos", 0.53, 0.90),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["acá ya", "encontramos"])

    def test_hard_pause_breaks_even_a_cohesive_pair(self) -> None:
        result = segment_words(
            words(
                ("¿qué", 0.00, 0.20),
                ("tal?", 0.70, 1.00),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual([cue.text for cue in result], ["¿qué", "tal?"])

    def test_real_audio_excerpt_target_one_uses_cadence_and_short_cohesion(self) -> None:
        result = segment_words(
            words(
                ("Hola,", 0.00, 0.22),
                ("¿qué", 0.36, 0.82),
                ("tal?", 0.82, 1.16),
                ("¿Quién", 1.76, 2.16),
                ("quiere", 2.16, 2.30),
                ("participar", 2.30, 2.68),
                ("en", 2.68, 2.98),
                ("un", 2.98, 3.10),
                ("juego?", 3.10, 3.42),
                ("¿Quién", 3.62, 3.82),
                ("se", 3.82, 3.88),
                ("anima?", 3.88, 4.28),
                ("Bueno,", 4.46, 4.86),
                ("acá", 4.86, 5.62),
                ("ya", 5.62, 5.82),
                ("encontramos", 5.82, 6.18),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=True),
        )
        self.assertEqual(
            [cue.text for cue in result],
            [
                "Hola,",
                "¿qué tal?",
                "¿Quién",
                "quiere",
                "participar en",
                "un juego?",
                "¿Quién se",
                "anima?",
                "Bueno,",
                "acá ya",
                "encontramos",
            ],
        )

    def test_preserves_commas_and_periods_when_enabled(self) -> None:
        result = segment_words(
            words(
                ("Hola,", 0.00, 0.30),
                ("mundo.", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_commas_periods=True),
        )
        self.assertEqual(result[0].text, "Hola, mundo.")

    def test_removes_only_edge_commas_and_periods_when_disabled(self) -> None:
        result = segment_words(
            words(
                ("Hola,", 0.00, 0.30),
                ("mundo.", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_commas_periods=False),
        )
        self.assertEqual(result[0].text, "Hola mundo")

    def test_question_and_exclamation_marks_are_always_preserved(self) -> None:
        result = segment_words(
            words(
                ("¿Quién?", 0.00, 0.30),
                ("¡Ahora!", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_commas_periods=False),
        )
        self.assertEqual(result[0].text, "¿Quién? ¡Ahora!")

    def test_comma_period_option_does_not_damage_numeric_separators(self) -> None:
        result = segment_words(
            words(
                ("50.000", 0.00, 0.30),
                ("1,5.", 0.31, 0.55),
            ),
            SegmentationConfig(target_words=2, preserve_commas_periods=False),
        )
        self.assertEqual(result[0].text, "50.000 1,5")

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

    def test_repairs_collapsed_caption_duration_after_overlap_adjustment(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 1.00),
                ("dos", 0.90, 0.95),
            ),
            SegmentationConfig(target_words=1, ignore_prepositions=False),
        )
        self.assertEqual([cue.text for cue in result], ["uno", "dos"])
        self.assertEqual(result[1].start, 1.0)
        self.assertEqual(result[1].end, 1.05)


if __name__ == "__main__":
    unittest.main()
