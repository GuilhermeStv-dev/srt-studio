import argparse
import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from engine import cli
from engine.models import WordToken
from engine.transcription.faster_whisper_adapter import TranscriptionResult


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "segmentation"


def run_segment(payload: object) -> tuple[int, dict]:
    raw = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    stdout, stderr = io.StringIO(), io.StringIO()
    with patch("sys.stdin", io.StringIO(raw)), redirect_stdout(stdout), redirect_stderr(stderr):
        code = cli.segment_command(argparse.Namespace())
    output = stdout.getvalue() if code == 0 else stderr.getvalue()
    return code, json.loads(output)


def fixture_options(fixture: dict) -> dict:
    options = dict(fixture.get("config", {}))
    if "monetary_thousands" in fixture.get("normalization", {}):
        options["monetary_thousands"] = fixture["normalization"]["monetary_thousands"]
    return options


WORDS = [
    {"text": "Hola,", "start": 0.00, "end": 0.30, "probability": 0.98},
    {"text": "¿cómo", "start": 0.80, "end": 1.00, "probability": 0.95},
    {"text": "tenes", "start": 1.02, "end": 1.30, "probability": 0.41},
    {"text": "eso?", "start": 1.32, "end": 1.60, "probability": 0.97},
]


class SegmentCommandTests(unittest.TestCase):
    def test_matches_all_calibration_fixtures(self) -> None:
        paths = sorted(FIXTURE_DIR.glob("*.json"))
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(fixture=path.name):
                fixture = json.loads(path.read_text(encoding="utf-8"))
                code, response = run_segment(
                    {"words": fixture["tokens"], "segmentation": fixture_options(fixture)}
                )
                self.assertEqual(code, 0, response)
                self.assertEqual(
                    [cue["text"] for cue in response["captions"]],
                    fixture["expected_captions"],
                )

    def test_transcribe_and_segment_produce_identical_captions(self) -> None:
        tokens = tuple(
            WordToken(
                text=item["text"],
                start=item["start"],
                end=item["end"],
                probability=item["probability"],
            )
            for item in WORDS
        )
        result = TranscriptionResult(
            language="es",
            language_probability=0.99,
            duration=2.0,
            model="tiny",
            device="cpu",
            compute_type="int8",
            words=tokens,
        )
        args = cli.build_parser().parse_args(["transcribe", "fake.wav", "--target-words", "1"])
        stdout = io.StringIO()
        with patch("engine.cli.transcribe_file", return_value=result), redirect_stdout(stdout):
            self.assertEqual(cli.transcribe(args), 0)
        transcribed = json.loads(stdout.getvalue())

        code, segmented = run_segment(
            {"words": transcribed["words"], "segmentation": transcribed["segmentation"]}
        )

        self.assertEqual(code, 0, segmented)
        self.assertEqual(segmented["captions"], transcribed["captions"])
        self.assertEqual(segmented["segmentation"], transcribed["segmentation"])

    def test_defaults_match_transcribe_defaults(self) -> None:
        code, response = run_segment({"words": WORDS})
        self.assertEqual(code, 0, response)
        self.assertEqual(
            response["segmentation"],
            {
                "target_words": 2,
                "ignore_prepositions": True,
                "preserve_commas_periods": True,
                "monetary_thousands": False,
            },
        )

    def test_reviewed_text_is_used_and_timestamps_are_preserved(self) -> None:
        reviewed = [dict(word) for word in WORDS]
        reviewed[2]["text"] = "tenés"
        code, response = run_segment(
            {"words": reviewed, "segmentation": {"target_words": 1}}
        )
        self.assertEqual(code, 0, response)
        texts = " ".join(cue["text"] for cue in response["captions"])
        self.assertIn("tenés", texts)
        self.assertNotIn("tenes", texts.split())
        self.assertEqual(response["captions"][0]["start"], 0.00)
        self.assertEqual(response["captions"][-1]["end"], 1.60)

    def test_deleted_word_is_omitted(self) -> None:
        reviewed = [word for index, word in enumerate(WORDS) if index != 0]
        code, response = run_segment({"words": reviewed})
        self.assertEqual(code, 0, response)
        self.assertNotIn("Hola", " ".join(cue["text"] for cue in response["captions"]))
        self.assertEqual(response["captions"][0]["start"], 0.80)

    def test_accepts_full_transcribe_payload_with_extra_fields(self) -> None:
        payload = {
            "ok": True,
            "language": "es",
            "words": [dict(word, kind=None) for word in WORDS],
            "captions": [{"text": "antiga", "start": 0.0, "end": 1.0}],
            "segmentation": {"target_words": 2},
        }
        code, response = run_segment(payload)
        self.assertEqual(code, 0, response)
        self.assertNotIn("antiga", [cue["text"] for cue in response["captions"]])

    def test_rejects_invalid_payloads(self) -> None:
        cases = {
            "vazio": "",
            "json inválido": "{",
            "sem palavras": {"words": []},
            "palavra vazia": {"words": [{"text": "  ", "start": 0.0, "end": 0.5}]},
            "palavra com espaço": {"words": [{"text": "tenés eso", "start": 0.0, "end": 0.5}]},
            "sem timestamp": {"words": [{"text": "Hola"}]},
            "duração negativa": {"words": [{"text": "Hola", "start": 0.5, "end": 0.2}]},
            "start negativo": {"words": [{"text": "Hola", "start": -0.1, "end": 0.2}]},
            "não finito": {"words": [{"text": "Hola", "start": 0.0, "end": "nan"}]},
            "regressivo": {
                "words": [
                    {"text": "Hola", "start": 1.0, "end": 1.2},
                    {"text": "che", "start": 0.5, "end": 0.7},
                ]
            },
            "alvo inválido": {"words": WORDS, "segmentation": {"target_words": 7}},
            "opção não booleana": {
                "words": WORDS,
                "segmentation": {"ignore_prepositions": "sim"},
            },
            "opção desconhecida": {"words": WORDS, "segmentation": {"max_chars": 12}},
        }
        for name, payload in cases.items():
            with self.subTest(case=name):
                code, response = run_segment(payload)
                self.assertEqual(code, 6)
                self.assertFalse(response["ok"])
                self.assertTrue(response["error"])

    def test_cli_subprocess_keeps_utf8(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "engine.cli", "segment"],
            cwd=REPO_ROOT,
            input=json.dumps({"words": WORDS}, ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        response = json.loads(completed.stdout)
        self.assertTrue(response["ok"])
        self.assertIn("¿cómo", " ".join(cue["text"] for cue in response["captions"]))


if __name__ == "__main__":
    unittest.main()
