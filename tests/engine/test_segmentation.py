import unittest

from engine.models import WordToken
from engine.segmentation import SegmentationConfig, segment_words


def words(*items: tuple[str, float, float]) -> list[WordToken]:
    return [WordToken(text=text, start=start, end=end) for text, start, end in items]


class SegmentationTests(unittest.TestCase):
    def test_empty_input(self) -> None:
        self.assertEqual(segment_words([]), ())

    def test_preserves_question_boundary(self) -> None:
        result = segment_words(
            words(
                ("¿Querés", 0.00, 0.35),
                ("jugar?", 0.37, 0.72),
                ("Tenemos", 1.45, 1.80),
                ("premios", 1.82, 2.20),
            )
        )
        self.assertEqual(result[0].text, "¿Querés jugar?")
        self.assertEqual(result[1].text, "Tenemos premios")

    def test_does_not_leave_preposition_at_end(self) -> None:
        result = segment_words(
            words(
                ("Depositá", 0.00, 0.30),
                ("ahora", 0.31, 0.58),
                ("en", 0.59, 0.68),
                ("NuevaBet", 0.69, 1.10),
            ),
            SegmentationConfig(target_chars=12, hard_max_chars=22),
        )
        self.assertFalse(any(cue.text.endswith(" en") for cue in result[:-1]))

    def test_does_not_isolate_article(self) -> None:
        result = segment_words(
            words(
                ("Mirá", 0.00, 0.24),
                ("todos", 0.25, 0.51),
                ("los", 0.52, 0.64),
                ("premios", 0.65, 0.98),
                ("disponibles", 0.99, 1.42),
            ),
            SegmentationConfig(target_chars=12, hard_max_chars=24),
        )
        self.assertFalse(any(cue.text.lower() == "los" for cue in result))

    def test_strong_pause_is_preferred_as_boundary(self) -> None:
        result = segment_words(
            words(
                ("Hola", 0.00, 0.25),
                ("amigos", 0.26, 0.55),
                ("hoy", 1.40, 1.62),
                ("jugamos", 1.63, 2.00),
            )
        )
        self.assertEqual([cue.text for cue in result], ["Hola amigos", "hoy jugamos"])

    def test_long_single_word_is_allowed(self) -> None:
        result = segment_words(words(("responsablemente", 0.0, 0.8)))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].text, "responsablemente")

    def test_removes_final_period_but_keeps_question_mark(self) -> None:
        result = segment_words(
            words(
                ("Hola", 0.0, 0.2),
                ("mundo.", 0.21, 0.5),
                ("¿Vamos?", 0.9, 1.2),
            )
        )
        self.assertFalse(result[0].text.endswith("."))
        self.assertTrue(result[-1].text.endswith("?"))

    def test_cues_are_positive_and_non_overlapping(self) -> None:
        result = segment_words(
            words(
                ("uno", 0.00, 0.40),
                ("dos", 0.35, 0.70),
                ("tres", 0.72, 1.00),
                ("cuatro", 1.02, 1.35),
            )
        )
        for cue in result:
            self.assertGreater(cue.end, cue.start)
        for left, right in zip(result, result[1:]):
            self.assertLessEqual(left.end, right.start)


if __name__ == "__main__":
    unittest.main()
