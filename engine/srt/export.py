from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from collections.abc import Sequence

from engine.models import CaptionCue
from engine.srt.render import render_srt


@dataclass(frozen=True, slots=True)
class SrtExportResult:
    path: str
    cue_count: int
    byte_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "path": self.path,
            "cue_count": self.cue_count,
            "byte_count": self.byte_count,
        }


def export_srt(
    cues: Sequence[CaptionCue],
    output_path: str | Path,
    *,
    overwrite: bool = False,
) -> SrtExportResult:
    """Valida, renderiza e grava um SRT UTF-8 sem sobrescrita silenciosa."""

    path = Path(output_path).expanduser()
    if path.suffix.lower() != ".srt":
        raise ValueError("O destino do SRT precisa usar a extensão .srt")
    if not path.parent.exists():
        raise FileNotFoundError(f"Pasta de destino não encontrada: {path.parent}")

    rendered = render_srt(cues)
    encoded = rendered.encode("utf-8")

    # `x` torna a política de não sobrescrita atômica. O modo `w` só é usado
    # depois de confirmação explícita no desktop/CLI.
    mode = "w" if overwrite else "x"
    with path.open(mode, encoding="utf-8", newline="") as handle:
        handle.write(rendered)

    return SrtExportResult(
        path=str(path.resolve()),
        cue_count=len(cues),
        byte_count=len(encoded),
    )
