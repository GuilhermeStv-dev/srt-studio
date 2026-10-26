import importlib.util
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path


HAS_FASTER_WHISPER = importlib.util.find_spec("faster_whisper") is not None


def write_tone(path: Path, seconds: float = 0.5, rate: int = 16000) -> None:
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(
            b"".join(
                struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * index / rate)))
                for index in range(frames)
            )
        )


@unittest.skipUnless(HAS_FASTER_WHISPER, "faster-whisper não instalado (extra `transcription`)")
class AudioDecodeCompatibilityTests(unittest.TestCase):
    """Regressão: PyAV 19 quebrou `faster_whisper.audio.decode_audio` (`metadata_errors`)."""

    def test_decode_audio_reads_wav_with_installed_pyav(self) -> None:
        from faster_whisper.audio import decode_audio

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "tone.wav"
            write_tone(path)
            audio = decode_audio(str(path), sampling_rate=16000)

        self.assertGreater(len(audio), 7000)
        self.assertLess(len(audio), 9000)


if __name__ == "__main__":
    unittest.main()
