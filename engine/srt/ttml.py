"""Legendas em TTML com estilo, para o painel do Premiere (D-027, experimento).

O Premiere não deixa nenhum painel estilizar legendas nativas por API. O TTML é um
formato de legenda que carrega estilo (tamanho, alinhamento, região na tela); a
ideia é o Premiere já importar as legendas no estilo certo. Mesmas garantias do
SRT: cues validados, UTF-8, sem sobrescrita silenciosa.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

from engine.models import CaptionCue
from engine.srt.export import SrtExportResult
from engine.srt.validate import validate_cues


@dataclass(frozen=True, slots=True)
class CaptionStyle:
    font_size: int = 122
    # Alinhamento do texto: "center" | "left" | "right".
    text_align: str = "center"
    # Alinhamento vertical dentro da região: "after" = embaixo.
    display_align: str = "after"
    # Região na grade 3x3 do Premiere: linha/coluna 0..2. Meio da tela = (1, 1).
    zone_row: int = 1
    zone_column: int = 1
    frame_width: int = 1920
    frame_height: int = 1080
    # Opcionais (estilo salvo do usuário): fonte, cor do texto e contorno.
    font_family: str | None = None
    color: str = "#FFFFFF"
    outline_color: str | None = None
    outline_width: int = 0

    def validate(self) -> None:
        for value in (self.color, self.outline_color):
            if value is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
                raise ValueError(f"Cor inválida: {value}")
        if not 0 <= self.outline_width <= 40:
            raise ValueError("Contorno fora do intervalo 0–40")
        if self.font_family is not None and not re.fullmatch(r"[\w .,'-]{1,80}", self.font_family):
            raise ValueError("Nome de fonte inválido")
        if not 8 <= self.font_size <= 400:
            raise ValueError("Tamanho da fonte fora do intervalo 8–400")
        if self.text_align not in {"center", "left", "right"}:
            raise ValueError("Alinhamento de texto inválido")
        if self.display_align not in {"before", "center", "after"}:
            raise ValueError("Alinhamento vertical inválido")
        if self.zone_row not in {0, 1, 2} or self.zone_column not in {0, 1, 2}:
            raise ValueError("Zona inválida")
        if self.frame_width < 16 or self.frame_height < 16:
            raise ValueError("Tamanho de quadro inválido")


def _clock(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def _pct(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".") + "%"


def _optional_attributes(style: CaptionStyle) -> str:
    parts = []
    if style.font_family:
        parts.append(f' tts:fontFamily="{escape(style.font_family, {chr(34): "&quot;"})}"')
    if style.outline_color and style.outline_width > 0:
        parts.append(f' tts:textOutline="{style.outline_color.upper()} {style.outline_width}px"')
    return "".join(parts)


def render_ttml(cues: Sequence[CaptionCue], style: CaptionStyle) -> str:
    validate_cues(cues)
    style.validate()
    # Região em porcentagem do quadro (não depende de o Premiere converter pixels
    # numa sequência vertical). Largura toda (texto centralizado) e a faixa da zona.
    third = 100 / 3
    origin_x = 0.0 if style.zone_column == 1 else third * style.zone_column
    width = 100.0 if style.zone_column == 1 else third
    origin_y = third * style.zone_row
    height = third

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling"'
        ' xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:timeBase="media"'
        f' tts:extent="{style.frame_width}px {style.frame_height}px" xml:lang="es">',
        "  <head>",
        "    <styling>",
        f'      <style xml:id="srtx" tts:fontSize="{style.font_size}px" tts:textAlign="{style.text_align}"'
        f' tts:displayAlign="{style.display_align}" tts:color="{style.color.upper()}"{_optional_attributes(style)}/>',
        "    </styling>",
        "    <layout>",
        f'      <region xml:id="zone" style="srtx" tts:origin="{_pct(origin_x)} {_pct(origin_y)}"'
        f' tts:extent="{_pct(width)} {_pct(height)}" tts:displayAlign="{style.display_align}" tts:textAlign="{style.text_align}"/>',
        "    </layout>",
        "  </head>",
        '  <body region="zone" style="srtx">',
        "    <div>",
    ]
    for cue in cues:
        lines.append(
            f'      <p begin="{_clock(cue.start)}" end="{_clock(cue.end)}" region="zone" style="srtx">'
            f"{escape(cue.text.strip())}</p>"
        )
    lines += ["    </div>", "  </body>", "</tt>", ""]
    return "\n".join(lines)


def export_ttml(
    cues: Sequence[CaptionCue],
    output_path: str | Path,
    style: CaptionStyle,
    *,
    overwrite: bool = False,
) -> SrtExportResult:
    path = Path(output_path).expanduser()
    if path.suffix.lower() not in {".ttml", ".xml", ".dfxp"}:
        raise ValueError("O destino do TTML precisa usar .ttml, .dfxp ou .xml")
    if not path.parent.exists():
        raise FileNotFoundError(f"Pasta de destino não encontrada: {path.parent}")
    rendered = render_ttml(cues, style)
    with path.open("w" if overwrite else "x", encoding="utf-8", newline="\n") as handle:
        handle.write(rendered)
    return SrtExportResult(path=str(path.resolve()), cue_count=len(cues), byte_count=len(rendered.encode("utf-8")))
