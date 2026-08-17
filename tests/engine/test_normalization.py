import unittest

from engine.normalization import normalize_whitespace, remove_final_period


class NormalizationTests(unittest.TestCase):
    def test_normalize_whitespace(self):
        self.assertEqual(normalize_whitespace("  hola   mundo  "), "hola mundo")

    def test_remove_only_final_period(self):
        self.assertEqual(remove_final_period("Tenés 50.000."), "Tenés 50.000")

    def test_keep_question_mark(self):
        self.assertEqual(remove_final_period("¿Querés jugar?"), "¿Querés jugar?")


if __name__ == "__main__":
    unittest.main()
