"""Renderiza os PNGs do ícone "Sx" com uma fonte de verdade (D-021 / BRANDING.md).

Uso único, quando a marca mudar (precisa de Pillow e da fonte instalada):

    .venv\\Scripts\\python.exe scripts\\render-brand-icons.py "C:\\caminho\\da\\fonte.otf"

Grava `assets/branding/srtx-<tamanho>.png` (versionados). O `build-brand-icon.mjs`
só empacota esses PNGs em .ico/.icns/.png, sem depender de Python nem da fonte.
A fonte em si nunca é copiada para o repositório.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "branding"
SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256, 512)
SUPERSAMPLE = 4

FILL = (30, 8, 84, 255)  # #1E0854 roxo profundo
MARK = (164, 136, 255, 255)  # #A488FF roxo SRTX claro
TEXT = "Sx"
RADIUS = 0.18  # canto, em fração do lado (como os ícones da Adobe)
CAP_HEIGHT = 0.49  # altura do "S" em fração do lado
BASELINE = 0.745  # linha de base em fração do lado


def render(size: int, font_path: str) -> Image.Image:
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * RADIUS), fill=FILL)

    # Ajusta o corpo da fonte para o "S" ter exatamente CAP_HEIGHT.
    probe = ImageFont.truetype(font_path, 1000)
    left, top, right, bottom = probe.getbbox("S", anchor="ls")
    font = ImageFont.truetype(font_path, round(1000 * CAP_HEIGHT * big / (bottom - top)))

    text_left, _, text_right, _ = font.getbbox(TEXT, anchor="ls")
    x = (big - (text_right - text_left)) / 2 - text_left
    draw.text((x, BASELINE * big), TEXT, font=font, fill=MARK, anchor="ls")
    return image.resize((size, size), Image.LANCZOS)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    font_path = sys.argv[1]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        render(size, font_path).save(OUTPUT / f"srtx-{size}.png", optimize=True)
    print(f"PNGs gravados em {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
