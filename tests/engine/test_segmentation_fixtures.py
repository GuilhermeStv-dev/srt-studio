import json
import unittest
from pathlib import Path

from engine.models import WordToken
from engine.normalization import normalize_monetary_tokens
from engine.segmentation import SegmentationConfig, segment_words


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "segmentation"


def load_fixture(path: Path) -> dict:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    required = {"name", "tokens", "expected_captions"}
    missing = sorted(required - fixture.keys())
    if missing:
        raise AssertionError(f"{path.name}: campos obrigatórios ausentes: {', '.join(missing)}")
    return fixture


def build_tokens(items: list[dict]) -> list[WordToken]:
    return [
        WordToken(
            text=item["text"],
            start=float(item["start"]),
            end=float(item["end"]),
            probability=item.get("probability"),
            kind=item.get("kind"),
        )
        for item in items
    ]


class SegmentationFixtureTests(unittest.TestCase):
    def test_all_calibration_fixtures(self) -> None:
        fixture_paths = sorted(FIXTURE_DIR.glob("*.json"))
        self.assertTrue(fixture_paths, "Nenhuma fixture de calibração encontrada")

        for path in fixture_paths:
            with self.subTest(fixture=path.name):
                fixture = load_fixture(path)
                tokens = build_tokens(fixture["tokens"])

                normalization = fixture.get("normalization", {})
                if "monetary_thousands" in normalization:
                    tokens = list(
                        normalize_monetary_tokens(
                            tokens,
                            format_thousands=bool(normalization["monetary_thousands"]),
                        )
                    )

                config = SegmentationConfig(**fixture.get("config", {}))
                result = segment_words(tokens, config)

                self.assertEqual(
                    [cue.text for cue in result],
                    fixture["expected_captions"],
                    fixture.get("description", fixture["name"]),
                )

                for cue in result:
                    self.assertGreater(cue.end, cue.start)
                for left, right in zip(result, result[1:]):
                    self.assertLessEqual(left.end, right.start)


if __name__ == "__main__":
    unittest.main()
