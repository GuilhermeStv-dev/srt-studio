from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "build" / "branding"
PNG_PATH = OUTPUT_DIR / "srtx.png"
ICO_PATH = OUTPUT_DIR / "srtx.ico"

CANVAS = 512
BG = "#432180"
BORDER = "#8B5CFF"
TEXT = "#F4F0E8"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\bahnschrift.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int) -> ImageFont.ImageFont:
    for size in range(142, 64, -2):
        font = load_font(size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font
    return load_font(72)


def build_icon() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    image = Image.new("RGBA", (CANVAS, CANVAS), BG)
    draw = ImageDraw.Draw(image)

    margin = 10
    radius = 72
    draw.rounded_rectangle(
        (margin, margin, CANVAS - margin - 1, CANVAS - margin - 1),
        radius=radius,
        outline=BORDER,
        width=3,
    )

    label = "SRTX"
    font = fit_font(draw, label, 330)
    bbox = draw.textbbox((0, 0), label, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (CANVAS - width) / 2 - bbox[0]
    y = (CANVAS - height) / 2 - bbox[1] - 2
    draw.text((x, y), label, fill=TEXT, font=font)

    image.save(PNG_PATH, format="PNG", optimize=True)
    image.save(
        ICO_PATH,
        format="ICO",
        sizes=[
            (16, 16),
            (20, 20),
            (24, 24),
            (32, 32),
            (40, 40),
            (48, 48),
            (64, 64),
            (128, 128),
            (256, 256),
        ],
    )

    print(f"PNG: {PNG_PATH}")
    print(f"ICO: {ICO_PATH}")


if __name__ == "__main__":
    build_icon()
