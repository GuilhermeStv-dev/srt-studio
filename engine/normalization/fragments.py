from __future__ import annotations

import re
import unicodedata
from typing import Sequence

from engine.models import WordToken

_FIRST_GROUP = re.compile(r"^\d{1,3}$")
_THOUSAND_FRAGMENT = re.compile(r"^\.\d{3}$")
_CURRENCY_WORDS = {"guarani", "guaranies", "guaranis", "gs", "pyg"}


def _fold(text: str) -> str:
    value = unicodedata.normalize("NFD", text.strip().lower().rstrip("."))
    return "".join(char for char in value if unicodedata.category(char) != "Mn")


def _is_currency_word(text: str) -> bool:
    return _fold(text) in _CURRENCY_WORDS


def merge_fragmented_currency_numbers(words: Sequence[WordToken]) -> tuple[WordToken, ...]:
    """Reagrupa números monetários que o ASR separou em `100` + `.000`.

    A fusão só ocorre quando os fragmentos são imediatamente seguidos por uma
    palavra de moeda conhecida, evitando alterar números não monetários.
    """
    if not words:
        return ()

    output: list[WordToken] = []
    index = 0

    while index < len(words):
        first = words[index].text.strip()
        if _FIRST_GROUP.fullmatch(first):
            fragment_end = index
            cursor = index + 1
            while cursor < len(words) and _THOUSAND_FRAGMENT.fullmatch(words[cursor].text.strip()):
                fragment_end = cursor
                cursor += 1

            if fragment_end > index and cursor < len(words) and _is_currency_word(words[cursor].text):
                probability_values = [
                    word.probability
                    for word in words[index : fragment_end + 1]
                    if word.probability is not None
                ]
                output.append(
                    WordToken(
                        text="".join(word.text.strip() for word in words[index : fragment_end + 1]),
                        start=words[index].start,
                        end=max(word.end for word in words[index : fragment_end + 1]),
                        probability=min(probability_values) if probability_values else None,
                    )
                )
                index = fragment_end + 1
                continue

        output.append(words[index])
        index += 1

    return tuple(output)
