from __future__ import annotations

import re
import unicodedata
from typing import Sequence

from engine.models import WordToken

_CURRENCY_WORDS = {
    "guarani",
    "guaranies",
    "guaranis",
    "gs",
    "pyg",
}
_CURRENCY_SYMBOLS = {"₲"}

_FINANCIAL_CONTEXT = {
    "abonar",
    "apuesta",
    "apostar",
    "bono",
    "cobrar",
    "cuenta",
    "depositar",
    "deposito",
    "deposita",
    "dinero",
    "ganar",
    "gana",
    "jugar",
    "juga",
    "pagar",
    "pago",
    "premio",
    "recarga",
    "recargar",
    "retiro",
    "retirar",
    "saldo",
}

_NON_MONETARY_UNITS = {
    "habitantes",
    "personas",
    "puntos",
    "metros",
    "kilometros",
    "km",
    "kg",
    "gramos",
    "seguidores",
    "visitas",
}

_EDGE_PUNCT = re.compile(r"^[¿¡\"'“”‘’([{]+|[?!,;:…\"'“”‘’)\]}]+$")
_GROUPED_INTEGER = re.compile(r"^(?:\d{1,3}(?:\.\d{3})+|\d{4,9})$")
_SIMPLE_INTEGER = re.compile(r"^\d{1,6}$")

_UNITS = {
    "uno": 1,
    "un": 1,
    "una": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
}
_TEENS_AND_TWENTIES = {
    "diez": 10,
    "once": 11,
    "doce": 12,
    "trece": 13,
    "catorce": 14,
    "quince": 15,
    "dieciseis": 16,
    "diecisiete": 17,
    "dieciocho": 18,
    "diecinueve": 19,
    "veinte": 20,
    "veintiuno": 21,
    "veintidos": 22,
    "veintitres": 23,
    "veinticuatro": 24,
    "veinticinco": 25,
    "veintiseis": 26,
    "veintisiete": 27,
    "veintiocho": 28,
    "veintinueve": 29,
}
_TENS = {
    "treinta": 30,
    "cuarenta": 40,
    "cincuenta": 50,
    "sesenta": 60,
    "setenta": 70,
    "ochenta": 80,
    "noventa": 90,
}
_HUNDREDS = {
    "cien": 100,
    "ciento": 100,
    "doscientos": 200,
    "trescientos": 300,
    "cuatrocientos": 400,
    "quinientos": 500,
    "seiscientos": 600,
    "setecientos": 700,
    "ochocientos": 800,
    "novecientos": 900,
}


def _fold(text: str) -> str:
    value = text.strip().lower()
    previous = None
    while value != previous:
        previous = value
        value = _EDGE_PUNCT.sub("", value).strip()
    value = unicodedata.normalize("NFD", value)
    return "".join(char for char in value if unicodedata.category(char) != "Mn")


def _is_currency(text: str) -> bool:
    folded = _fold(text).rstrip(".")
    return folded in _CURRENCY_WORDS or text.strip() in _CURRENCY_SYMBOLS


def _numeric_thousands(text: str) -> int | None:
    folded = _fold(text)
    for symbol in _CURRENCY_SYMBOLS:
        folded = folded.replace(symbol, "")
    folded = folded.strip()
    if not _GROUPED_INTEGER.fullmatch(folded):
        return None
    value = int(folded.replace(".", ""))
    if value < 1000 or value % 1000 != 0:
        return None
    return value // 1000


def _simple_number(text: str) -> int | None:
    folded = _fold(text)
    if not _SIMPLE_INTEGER.fullmatch(folded):
        return None
    return int(folded)


def _parse_spanish_number(parts: Sequence[str]) -> int | None:
    tokens = [_fold(part) for part in parts]
    tokens = [token for token in tokens if token]
    if not tokens:
        return None

    total = 0
    index = 0
    if tokens[index] in _HUNDREDS:
        total += _HUNDREDS[tokens[index]]
        index += 1
        if index == len(tokens):
            return total

    if index < len(tokens) and tokens[index] in _TEENS_AND_TWENTIES:
        total += _TEENS_AND_TWENTIES[tokens[index]]
        index += 1
    elif index < len(tokens) and tokens[index] in _TENS:
        total += _TENS[tokens[index]]
        index += 1
        if index < len(tokens) and tokens[index] == "y":
            index += 1
        if index < len(tokens) and tokens[index] in _UNITS:
            total += _UNITS[tokens[index]]
            index += 1
    elif index < len(tokens) and tokens[index] in _UNITS:
        total += _UNITS[tokens[index]]
        index += 1

    return total if index == len(tokens) and 0 < total < 1000 else None


def _has_financial_context(words: Sequence[WordToken], start: int, end: int) -> bool:
    left = max(0, start - 4)
    right = min(len(words), end + 5)
    context = [_fold(word.text) for word in words[left:right]]
    return any(token in _FINANCIAL_CONTEXT for token in context)


def _has_non_monetary_unit_after(words: Sequence[WordToken], end: int) -> bool:
    if end + 1 >= len(words):
        return False
    return _fold(words[end + 1].text) in _NON_MONETARY_UNITS


def _source_text(words: Sequence[WordToken], start: int, end: int) -> str:
    return " ".join(word.text.strip() for word in words[start : end + 1] if word.text.strip())


def _merged_token(
    words: Sequence[WordToken],
    start: int,
    end: int,
    text: str,
) -> WordToken:
    probability_values = [
        word.probability for word in words[start : end + 1] if word.probability is not None
    ]
    probability = min(probability_values) if probability_values else None
    return WordToken(
        text=text,
        start=words[start].start,
        end=max(word.end for word in words[start : end + 1]),
        probability=probability,
        kind="monetary",
    )


def _render_money(
    words: Sequence[WordToken],
    start: int,
    end: int,
    thousands: int,
    format_thousands: bool,
) -> str:
    if format_thousands:
        return f"{thousands} mil"
    return _source_text(words, start, end)


def normalize_monetary_tokens(
    words: Sequence[WordToken],
    format_thousands: bool = False,
) -> tuple[WordToken, ...]:
    """Reconhece valores monetários e os transforma em um token semântico único.

    O reconhecimento acontece sempre para que valores monetários possam ser isolados
    na segmentação. Quando `format_thousands=True`, valores redondos em milhares são
    exibidos como `N mil` e marcadores como `₲`/`guaraníes` somem da saída.
    Quando desligado, o texto reconhecido é preservado como o Whisper o entregou.
    Números não monetários permanecem intactos.
    """
    if not words:
        return ()

    output: list[WordToken] = []
    index = 0

    while index < len(words):
        # Símbolo separado: ₲ 50.000 [guaraníes]
        if _is_currency(words[index].text) and words[index].text.strip() in _CURRENCY_SYMBOLS:
            if index + 1 < len(words):
                thousands = _numeric_thousands(words[index + 1].text)
                if thousands is not None:
                    end = index + 1
                    if end + 1 < len(words) and _is_currency(words[end + 1].text):
                        end += 1
                    output.append(
                        _merged_token(
                            words,
                            index,
                            end,
                            _render_money(words, index, end, thousands, format_thousands),
                        )
                    )
                    index = end + 1
                    continue

        # 50.000 / ₲50.000, reconhecido por moeda explícita ou contexto financeiro.
        thousands = _numeric_thousands(words[index].text)
        if thousands is not None:
            explicit_symbol = any(symbol in words[index].text for symbol in _CURRENCY_SYMBOLS)
            end = index
            explicit_currency = explicit_symbol
            if index + 1 < len(words) and _is_currency(words[index + 1].text):
                explicit_currency = True
                end = index + 1
            if (
                explicit_currency
                or (
                    _has_financial_context(words, index, end)
                    and not _has_non_monetary_unit_after(words, end)
                )
            ):
                output.append(
                    _merged_token(
                        words,
                        index,
                        end,
                        _render_money(words, index, end, thousands, format_thousands),
                    )
                )
                index = end + 1
                continue

        # 200 mil [guaraníes]
        number = _simple_number(words[index].text)
        if number is not None and index + 1 < len(words) and _fold(words[index + 1].text) == "mil":
            end = index + 1
            explicit_currency = False
            if end + 1 < len(words) and _is_currency(words[end + 1].text):
                explicit_currency = True
                end += 1
            if (
                explicit_currency
                or (
                    _has_financial_context(words, index, end)
                    and not _has_non_monetary_unit_after(words, end)
                )
            ):
                output.append(
                    _merged_token(
                        words,
                        index,
                        end,
                        _render_money(words, index, end, number, format_thousands),
                    )
                )
                index = end + 1
                continue

        # doscientos mil [guaraníes]
        matched_written = False
        for mil_index in range(index + 1, min(len(words), index + 5)):
            if _fold(words[mil_index].text) != "mil":
                continue
            parsed = _parse_spanish_number([word.text for word in words[index:mil_index]])
            if parsed is None:
                break
            end = mil_index
            explicit_currency = False
            if end + 1 < len(words) and _is_currency(words[end + 1].text):
                explicit_currency = True
                end += 1
            if explicit_currency or _has_financial_context(words, index, end):
                output.append(
                    _merged_token(
                        words,
                        index,
                        end,
                        _render_money(words, index, end, parsed, format_thousands),
                    )
                )
                index = end + 1
                matched_written = True
            break
        if matched_written:
            continue

        output.append(words[index])
        index += 1

    return tuple(output)
