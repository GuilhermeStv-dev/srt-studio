from __future__ import annotations

import re

_SPACES = re.compile(r"\s+")
_FINAL_PERIOD = re.compile(r"(?:\.{1,3}|…)+$")


def normalize_whitespace(text: str) -> str:
    """Colapsa whitespace sem alterar conteúdo interno importante."""
    return _SPACES.sub(" ", text).strip()


def remove_final_period(text: str) -> str:
    """Remove ponto/reticências apenas no fim; preserva pontuação interna e números."""
    normalized = normalize_whitespace(text)
    return _FINAL_PERIOD.sub("", normalized).rstrip()
