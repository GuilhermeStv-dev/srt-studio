"""Forma falada das palavras, só para a sincronização (D-025).

O modelo de sincronização reconhece letras, não algarismos: "100", "200.000" ou
"50%" não têm som para ele, então a fala desses números era engolida pelas
palavras vizinhas ("¿está" esticado sobre "cien"). Aqui cada número vira a forma
falada ("cien", "doscientos mil", "cincuenta por ciento") apenas para alinhar; o
texto da legenda continua exatamente como foi escrito.
"""

from __future__ import annotations

import re

_EDGE = re.compile(r"^[¿¡\"'“”‘’(\[{]+|[?!,.;:…\"'“”‘’)\]}]+$")
_NUMBER = re.compile(r"^(?P<prefix>₲|\$|R\$|US\$|€)?(?P<number>\d[\d.,]*)(?P<suffix>%|k|K)?$")

# ---------------------------------------------------------------- espanhol
_ES_UNITS = [
    "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
    "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
    "veintisiete", "veintiocho", "veintinueve",
]
_ES_TENS = {3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa"}
_ES_HUNDREDS = {
    1: "ciento", 2: "doscientos", 3: "trescientos", 4: "cuatrocientos", 5: "quinientos",
    6: "seiscientos", 7: "setecientos", 8: "ochocientos", 9: "novecientos",
}


def _es_below_thousand(n: int) -> str:
    if n == 100:
        return "cien"
    parts = []
    if n >= 100:
        parts.append(_ES_HUNDREDS[n // 100])
        n %= 100
    if n:
        if n < 30:
            parts.append(_ES_UNITS[n])
        else:
            tens, unit = divmod(n, 10)
            parts.append(_ES_TENS[tens] + (f" y {_ES_UNITS[unit]}" if unit else ""))
    return " ".join(parts)


def _es(n: int) -> str:
    if n < 1000:
        return _es_below_thousand(n) if n else "cero"
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        head = "mil" if thousands == 1 else f"{_es_below_thousand(thousands)} mil"
        return head + (f" {_es_below_thousand(rest)}" if rest else "")
    millions, rest = divmod(n, 1_000_000)
    head = "un millón" if millions == 1 else f"{_es(millions)} millones"
    return head + (f" {_es(rest)}" if rest else "")


# -------------------------------------------------------------- português
_PT_UNITS = [
    "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]
_PT_TENS = {2: "vinte", 3: "trinta", 4: "quarenta", 5: "cinquenta", 6: "sessenta", 7: "setenta", 8: "oitenta", 9: "noventa"}
_PT_HUNDREDS = {
    1: "cento", 2: "duzentos", 3: "trezentos", 4: "quatrocentos", 5: "quinhentos",
    6: "seiscentos", 7: "setecentos", 8: "oitocentos", 9: "novecentos",
}


def _pt_below_thousand(n: int) -> str:
    if n == 100:
        return "cem"
    parts = []
    if n >= 100:
        parts.append(_PT_HUNDREDS[n // 100])
        n %= 100
    if n:
        if n < 20:
            parts.append(_PT_UNITS[n])
        else:
            tens, unit = divmod(n, 10)
            parts.append(_PT_TENS[tens] + (f" e {_PT_UNITS[unit]}" if unit else ""))
    return " e ".join(parts)


def _pt(n: int) -> str:
    if n < 1000:
        return _pt_below_thousand(n) if n else "zero"
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        head = "mil" if thousands == 1 else f"{_pt_below_thousand(thousands)} mil"
        return head + (f" {_pt_below_thousand(rest)}" if rest else "")
    millions, rest = divmod(n, 1_000_000)
    head = "um milhão" if millions == 1 else f"{_pt(millions)} milhões"
    return head + (f" {_pt(rest)}" if rest else "")


# ----------------------------------------------------------------- inglês
_EN_UNITS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
_EN_TENS = {2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy", 8: "eighty", 9: "ninety"}


def _en_below_thousand(n: int) -> str:
    parts = []
    if n >= 100:
        parts.append(f"{_EN_UNITS[n // 100]} hundred")
        n %= 100
    if n:
        if n < 20:
            parts.append(_EN_UNITS[n])
        else:
            tens, unit = divmod(n, 10)
            parts.append(_EN_TENS[tens] + (f" {_EN_UNITS[unit]}" if unit else ""))
    return " ".join(parts)


def _en(n: int) -> str:
    if n < 1000:
        return _en_below_thousand(n) if n else "zero"
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        return f"{_en_below_thousand(thousands)} thousand" + (f" {_en_below_thousand(rest)}" if rest else "")
    millions, rest = divmod(n, 1_000_000)
    return f"{_en(millions)} million" + (f" {_en(rest)}" if rest else "")


_SPELLERS = {"es": _es, "pt": _pt, "en": _en}
_DECIMAL_WORD = {"es": "coma", "pt": "vírgula", "en": "point"}
_PERCENT = {"es": "por ciento", "pt": "por cento", "en": "percent"}
_THOUSAND = {"es": "mil", "pt": "mil", "en": "thousand"}


def _parse_number(raw: str, language: str) -> tuple[int, str | None] | None:
    """Inteiro + parte decimal (como texto), respeitando o separador do idioma."""

    thousands_sep, decimal_sep = (",", ".") if language == "en" else (".", ",")
    groups = raw.split(thousands_sep)
    if len(groups) > 1 and all(len(group) == 3 for group in groups[1:]) and groups[0]:
        raw = "".join(groups)
    integer, _, decimal = raw.partition(decimal_sep)
    if not integer.isdigit() or (decimal and not decimal.isdigit()):
        return None
    value = int(integer)
    if value >= 1_000_000_000:
        return None
    return value, decimal or None


def spoken_form(word: str, language: str) -> str:
    """Texto como é falado, para alinhar. Palavras comuns voltam como vieram."""

    speller = _SPELLERS.get(language)
    core = _EDGE.sub("", word.strip())
    if speller is None or not core or not any(char.isdigit() for char in core):
        return word
    match = _NUMBER.match(core)
    if not match:
        return word
    parsed = _parse_number(match.group("number"), language)
    if parsed is None:
        return word
    value, decimal = parsed
    spoken = speller(value)
    if decimal:
        spoken += f" {_DECIMAL_WORD[language]} " + " ".join(speller(int(digit)) for digit in decimal)
    suffix = match.group("suffix")
    if suffix == "%":
        spoken += f" {_PERCENT[language]}"
    elif suffix in {"k", "K"}:
        spoken += f" {_THOUSAND[language]}"
    return spoken
