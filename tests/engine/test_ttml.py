"""Legendas em TTML com estilo (D-027)."""

import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from engine.models import CaptionCue
from engine.srt.ttml import CaptionStyle, export_ttml, render_ttml

TT = "{http://www.w3.org/ns/ttml}"
TTS = "{http://www.w3.org/ns/ttml#styling}"


class TtmlTest(unittest.TestCase):
    def cues(self):
        return [CaptionCue("¿Qué tal?", 0.5, 1.2), CaptionCue("50 mil & más", 1.2, 2.0)]

    def test_style_size_alignment_and_middle_zone(self):
        root = ET.fromstring(render_ttml(self.cues(), CaptionStyle(frame_width=1080, frame_height=1920)))
        style = root.find(f"{TT}head/{TT}styling/{TT}style")
        self.assertEqual(style.get(f"{TTS}fontSize"), "122px")
        self.assertEqual(style.get(f"{TTS}textAlign"), "center")
        self.assertEqual(style.get(f"{TTS}displayAlign"), "after")
        region = root.find(f"{TT}head/{TT}layout/{TT}region")
        # Faixa do meio em porcentagem (vale para sequência vertical e horizontal).
        self.assertEqual(region.get(f"{TTS}origin"), "0% 33.333%")
        self.assertEqual(region.get(f"{TTS}extent"), "100% 33.333%")

    def test_text_is_escaped_and_times_are_exact(self):
        root = ET.fromstring(render_ttml(self.cues(), CaptionStyle()))
        paragraphs = root.findall(f"{TT}body/{TT}div/{TT}p")
        self.assertEqual([p.text for p in paragraphs], ["¿Qué tal?", "50 mil & más"])
        self.assertEqual((paragraphs[0].get("begin"), paragraphs[0].get("end")), ("00:00:00.500", "00:00:01.200"))

    def test_never_overwrites_silently(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "legenda.xml"
            export_ttml(self.cues(), path, CaptionStyle())
            with self.assertRaises(FileExistsError):
                export_ttml(self.cues(), path, CaptionStyle())

    def test_saved_style_font_color_and_outline(self):
        style = CaptionStyle(font_family="Portlin", color="#ffc400", outline_color="#000000", outline_width=4)
        root = ET.fromstring(render_ttml(self.cues(), style))
        node = root.find(f"{TT}head/{TT}styling/{TT}style")
        self.assertEqual(node.get(f"{TTS}fontFamily"), "Portlin")
        self.assertEqual(node.get(f"{TTS}color"), "#FFC400")
        self.assertEqual(node.get(f"{TTS}textOutline"), "#000000 4px")

    def test_plain_style_has_no_font_or_outline(self):
        root = ET.fromstring(render_ttml(self.cues(), CaptionStyle()))
        node = root.find(f"{TT}head/{TT}styling/{TT}style")
        self.assertIsNone(node.get(f"{TTS}fontFamily"))
        self.assertIsNone(node.get(f"{TTS}textOutline"))

    def test_rejects_invalid_style(self):
        with self.assertRaises(ValueError):
            render_ttml(self.cues(), CaptionStyle(color="amarelo"))
        with self.assertRaises(ValueError):
            render_ttml(self.cues(), CaptionStyle(font_family='x" onload="y'))
        with self.assertRaises(ValueError):
            render_ttml(self.cues(), CaptionStyle(font_size=2))


if __name__ == "__main__":
    unittest.main()
