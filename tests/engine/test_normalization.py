import unittest

from engine.models import WordToken
from engine.normalization import (
    normalize_monetary_tokens,
    normalize_whitespace,
    remove_final_period,
)


def words(*items: tuple[str, float, float]) -> list[WordToken]:
    return [WordToken(text=text, start=start, end=end) for text, start=start, end=end in []]


def tokens(*items: tuple[str, float, float]) -> list[WordToken]:
    return [WordToken(text=text, start=start, end=end) for text, start, end in items]


class NormalizationTests(unittest.TestCase):
    def test_normalize_whitespace(self):
        self.assertEqual(normalize_whitespace("  hola   mundo  "), "hola mundo")

    def test_remove_only_final_period(self):
        self.assertEqual(remove_final_period("Tenés 50.000."), "Tenés 50.000")

    def test_keep_question_mark(self):
        self.assertEqual(remove_final_period("¿Querés jugar?"), "¿Querés jugar?")

    def test_formats_explicit_guarani_value_as_mil(self):
        result = normalize_monetary_tokens(
            tokens(
                ("200.000", 0.00, 0.35),
                ("guaraníes", 0.36, 0.70),
            ),
            format_thousands=True,
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].text, "200 mil")
        self.assertEqual(result[0].kind, "monetary")

    def test_removes_currency_word_from_existing_mil_format(self):
        result = normalize_monetary_tokens(
            tokens(
                ("200", 0.00, 0.15),
                ("mil", 0.16, 0.32),
                ("guaraníes", 0.33, 0.65),
            ),
            format_thousands=True,
        )
        self.assertEqual([token.text for token in result], ["200 mil"])

    def test_formats_written_spanish_currency_value(self):
        result = normalize_monetary_tokens(
            tokens(
                ("doscientos", 0.00, 0.30),
                ("mil", 0.31, 0.45),
                ("guaraníes", 0.46, 0.80),
            ),
            format_thousands=True,
        )
        self.assertEqual([token.text for token in result], ["200 mil"])

    def test_preserves_recognized_money_text_when_format_is_off(self):
        result = normalize_monetary_tokens(
            tokens(
                ("200", 0.00, 0.15),
                ("mil", 0.16, 0.32),
                ("guaraníes", 0.33, 0.65),
            ),
            format_thousands=False,
        )
        self.assertEqual([token.text for token in result], ["200 mil guaraníes"])
        self.assertEqual(result[0].kind, "monetary")

    def test_financial_context_can_identify_grouped_value(self):
        result = normalize_monetary_tokens(
            tokens(
                ("Depositá", 0.00, 0.25),
                ("50.000", 0.26, 0.52),
                ("ahora", 0.53, 0.78),
            ),
            format_thousands=True,
        )
        self.assertEqual([token.text for token in result], ["Depositá", "50 mil", "ahora"])
        self.assertEqual(result[1].kind, "monetary")

    def test_does_not_change_non_monetary_grouped_number(self):
        result = normalize_monetary_tokens(
            tokens(
                ("50.000", 0.00, 0.30),
                ("habitantes", 0.31, 0.70),
            ),
            format_thousands=True,
        )
        self.assertEqual([token.text for token in result], ["50.000", "habitantes"])
        self.assertTrue(all(token.kind is None for token in result))

    def test_does_not_change_decimal_or_small_number(self):
        result = normalize_monetary_tokens(
            tokens(
                ("saldo", 0.00, 0.20),
                ("1,5", 0.21, 0.40),
            ),
            format_thousands=True,
        )
        self.assertEqual([token.text for token in result], ["saldo", "1,5"])


if __name__ == "__main__":
    unittest.main()
