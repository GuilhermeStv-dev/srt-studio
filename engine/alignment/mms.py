"""Modelo de sincronização MMS da Meta (MMS_FA) rodando em ONNX fp32 (D-026).

Treinado especificamente para alinhamento forçado, multilíngue. Trabalha com o
alfabeto latino sem acentos (a–z e apóstrofo): o texto é "romanizado" aqui antes
de virar tokens ("¿Están" → "estan", "año" → "ano"). Números já chegam na forma
falada (D-025).
"""

from __future__ import annotations

import json
import os
import unicodedata
from pathlib import Path

import numpy as np

MMS_DIR_ENV = "SRTX_MMS_MODEL_DIR"


def default_model_dir() -> Path:
    override = os.environ.get(MMS_DIR_ENV, "").strip()
    if override:
        return Path(override)
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".cache")
    return Path(base) / "SRTX" / "models" / "mms-fa"


def mms_available(model_dir: Path | None = None) -> bool:
    folder = model_dir or default_model_dir()
    return (folder / "model.onnx").is_file() and (folder / "labels.json").is_file()


def romanize(text: str) -> str:
    """Minúsculas, sem acentos, só a–z e apóstrofo (ñ → n, ç → c)."""

    folded = unicodedata.normalize("NFKD", text.lower())
    return "".join(char for char in folded if ("a" <= char <= "z") or char == "'" or char.isspace())


class MmsCtcModel:
    """Mesma interface do modelo wav2vec2 antigo: `vocab`, `blank`, `delimiter`,
    `log_probs(audio)` e `prepare(text)` para romanizar."""

    def __init__(self, model_dir: Path | None = None) -> None:
        import onnxruntime as ort

        folder = model_dir or default_model_dir()
        labels = json.loads((folder / "labels.json").read_text(encoding="utf-8"))
        self.vocab = {label: index for index, label in enumerate(labels)}
        self.blank = self.vocab.get("-", 0)
        self.delimiter = None  # MMS_FA não tem separador de palavra
        options = ort.SessionOptions()
        options.log_severity_level = 3
        providers = ["CPUExecutionProvider"]
        self._session = ort.InferenceSession(str(folder / "model.onnx"), sess_options=options, providers=providers)
        self._input = self._session.get_inputs()[0].name

    @staticmethod
    def prepare(text: str) -> str:
        return romanize(text)

    def log_probs(self, audio: np.ndarray) -> np.ndarray:
        # O modelo exportado já normaliza a onda e aplica log_softmax.
        emissions = self._session.run(None, {self._input: audio[None, :].astype(np.float32)})[0][0]
        return emissions.astype(np.float32)
