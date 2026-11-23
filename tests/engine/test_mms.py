"""Modelo de sincronização MMS (D-026): texto romanizado e escolha do modelo."""

import os
import tempfile
import unittest
from pathlib import Path

from engine.alignment.mms import MMS_DIR_ENV, mms_available, romanize


class RomanizeTest(unittest.TestCase):
    def test_strips_accents_and_punctuation(self):
        self.assertEqual(romanize("¿Están"), "estan")
        self.assertEqual(romanize("año, niño"), "ano nino")
        self.assertEqual(romanize("Ação"), "acao")
        self.assertEqual(romanize("doscientos mil"), "doscientos mil")
        self.assertEqual(romanize("rock'n'roll"), "rock'n'roll")


class AvailabilityTest(unittest.TestCase):
    def test_needs_model_and_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            self.assertFalse(mms_available(path))
            (path / "model.onnx").write_bytes(b"x")
            self.assertFalse(mms_available(path))
            (path / "labels.json").write_text("[]", encoding="utf-8")
            self.assertTrue(mms_available(path))

    def test_env_points_to_another_folder(self):
        previous = os.environ.get(MMS_DIR_ENV)
        os.environ[MMS_DIR_ENV] = "__nao_existe__"
        try:
            self.assertFalse(mms_available())
        finally:
            if previous is None:
                del os.environ[MMS_DIR_ENV]
            else:
                os.environ[MMS_DIR_ENV] = previous


if __name__ == "__main__":
    unittest.main()
