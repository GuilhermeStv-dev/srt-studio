import codecs
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from engine.models import CaptionCue
from engine.srt import export_srt, format_timestamp, render_srt, validate_cues
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

    def test_export_writes_utf8_crlf_without_bom(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "legenda.srt"
            result = export_srt(
                [
                    CaptionCue("¿Quién?", 0.2, 0.7),
                    CaptionCue("acá", 0.8, 1.2),
                ],
                output,
            )

            data = output.read_bytes()
            self.assertEqual(result.cue_count, 2)
            self.assertEqual(result.byte_count, len(data))
            self.assertFalse(data.startswith(codecs.BOM_UTF8))
            self.assertIn("¿Quién?".encode("utf-8"), data)
            self.assertIn("acá".encode("utf-8"), data)
            self.assertIn(b"\r\n\r\n", data)

    def test_export_refuses_existing_file_without_overwrite(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "legenda.srt"
            output.write_text("original", encoding="utf-8")

            with self.assertRaises(FileExistsError):
                export_srt([CaptionCue("Hola", 0.0, 0.5)], output)

            self.assertEqual(output.read_text(encoding="utf-8"), "original")

    def test_export_overwrites_only_when_explicit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "legenda.srt"
            output.write_text("original", encoding="utf-8")

            export_srt([CaptionCue("Nuevo", 0.0, 0.5)], output, overwrite=True)

            self.assertIn("Nuevo", output.read_text(encoding="utf-8"))
            self.assertNotIn("original", output.read_text(encoding="utf-8"))

    def test_export_validates_before_creating_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "invalido.srt"

            with self.assertRaises(InvalidCueError):
                export_srt([CaptionCue("Sem duração", 1.0, 1.0)], output)

            self.assertFalse(output.exists())

    def test_export_cli_accepts_caption_payload_via_stdin(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "cli.srt"
            payload = {
                "captions": [
                    {"text": "Hola", "start": 0.0, "end": 0.4},
                    {"text": "¿Qué tal?", "start": 0.5, "end": 1.0},
                ]
            }
            repo_root = Path(__file__).resolve().parents[2]

            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "engine.cli",
                    "export-srt",
                    "--output",
                    str(output),
                ],
                cwd=repo_root,
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            response = json.loads(completed.stdout)
            self.assertTrue(response["ok"])
            self.assertEqual(response["cue_count"], 2)
            self.assertTrue(output.exists())
            self.assertIn("¿Qué tal?", output.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
