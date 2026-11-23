"""Exporta o modelo de sincronização MMS da Meta (MMS_FA) para ONNX fp32 (D-026).

O MMS_FA é um wav2vec2 de 300M parâmetros treinado especificamente para
alinhamento forçado (31 mil horas, 1.100+ idiomas). O app roda ONNX no
onnxruntime, então o PyTorch só é necessário aqui, na exportação — o instalador
não carrega o PyTorch.

Uso (precisa de torch + torchaudio no .venv):

    .venv\\Scripts\\python.exe scripts\\export_mms_onnx.py [pasta_destino]

Destino padrão: a pasta de modelos do SRTX (ver engine/alignment/mms.py).
Grava `model.onnx` (fp32, sem compressão) e `labels.json`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main() -> int:
    import torch
    from torchaudio.pipelines import MMS_FA

    from engine.alignment.mms import default_model_dir

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default_model_dir()
    target.mkdir(parents=True, exist_ok=True)

    print("Baixando pesos do MMS_FA (Meta)…", flush=True)
    model = MMS_FA.get_model(with_star=False)
    model.eval()

    class Emissions(torch.nn.Module):
        def __init__(self, inner: torch.nn.Module) -> None:
            super().__init__()
            self.inner = inner

        def forward(self, waveform: torch.Tensor) -> torch.Tensor:
            # Mesmo que o wrapper do torchaudio (layer_norm na onda inteira +
            # log_softmax), escrito com operações que exportam com tamanho dinâmico.
            mean = waveform.mean()
            var = ((waveform - mean) ** 2).mean()
            normalized = (waveform - mean) / torch.sqrt(var + 1e-5)
            logits, _ = self.inner.model(normalized)
            return torch.nn.functional.log_softmax(logits, dim=-1)

    wrapper = Emissions(model)
    example = torch.zeros(1, 16000 * 4)
    output = target / "model.onnx"
    print(f"Exportando para {output} (fp32)…", flush=True)
    torch.onnx.export(
        wrapper,
        (example,),
        str(output),
        input_names=["waveform"],
        output_names=["emissions"],
        dynamic_axes={"waveform": {1: "samples"}, "emissions": {1: "frames"}},
        opset_version=17,
        dynamo=False,
    )
    labels = list(MMS_FA.get_labels(star=None))
    (target / "labels.json").write_text(json.dumps(labels, ensure_ascii=False), encoding="utf-8")

    # Conferência: ONNX e PyTorch precisam dar o mesmo resultado.
    import numpy as np
    import onnxruntime as ort

    # Modelo recém-carregado: a exportação altera o estado do objeto exportado.
    reference = MMS_FA.get_model(with_star=False).eval()
    probe = torch.randn(1, 16000 * 3) * 0.1
    with torch.inference_mode():
        expected = reference(probe)[0].numpy()  # wrapper original do torchaudio
    session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
    actual = session.run(None, {"waveform": probe.numpy()})[0]
    diff = float(np.max(np.abs(expected - actual)))
    print(f"Diferença máxima PyTorch x ONNX: {diff:.2e}")
    if diff > 1e-2:
        raise SystemExit("A exportação divergiu do modelo original")
    print("Pronto.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
