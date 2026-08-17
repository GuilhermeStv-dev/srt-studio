import unittest

from engine.models import CaptionCue
from engine.srt import format_timestamp, render_srt, validate_cues
from engine.srt.validate import InvalidCueError


class SrtTests(unittest.TestCase):
    def test_format_timestamp(self):
        self.assertEqual(format_timestamp(61.234), "00:01:01,234")

    def test_hours_can_exceed_24(self):
        self.assertEqual(format_timestamp(25 * 3600), "25:00:00,000")

    def test_render(self):
        cues = [
            CaptionCue("Hola", 0.2, 0.7),
            CaptionCue("¿cómo estás?", 0.8, 1.5),
        ]
        value = render_srt(cues, newline="\n")
        self.assertIn("00:00:00,200 --> 00:00:00,700", value)
        self.assertIn("2\n00:00:00,800 --> 00:00:01,500\n¿cómo estás?", value)

    def test_reject_zero_duration(self):
        with self.assertRaises(InvalidCueError):
            validate_cues([CaptionCue("Hola", 1.0, 1.0)])

    def test_reject_overlap(self):
        with self.assertRaises(InvalidCueError):
            validate_cues([
                CaptionCue("A", 0.0, 1.0),
                CaptionCue("B", 0.9, 1.2),
            ])


if __name__ == "__main__":
    unittest.main()
