from types import SimpleNamespace
import unittest

from engine.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    collect_word_tokens,
    select_runtime,
)


class RuntimeSelectionTests(unittest.TestCase):
    def test_prefers_cuda_int8_float16_when_available(self) -> None:
        runtime = select_runtime(
            cuda_devices=1,
            cuda_compute_types={"float16", "int8_float16", "float32"},
            cpu_compute_types={"int8", "float32"},
        )
        self.assertEqual(runtime.device, "cuda")
        self.assertEqual(runtime.compute_type, "int8_float16")

    def test_falls_back_to_cpu_int8_without_cuda(self) -> None:
        runtime = select_runtime(
            cuda_devices=0,
            cuda_compute_types=set(),
            cpu_compute_types={"int8", "float32"},
        )
        self.assertEqual(runtime.device, "cpu")
        self.assertEqual(runtime.compute_type, "int8")

    def test_explicit_cuda_without_gpu_fails(self) -> None:
        with self.assertRaises(TranscriptionUnavailableError):
            select_runtime(
                cuda_devices=0,
                cuda_compute_types=set(),
                cpu_compute_types={"int8"},
                requested_device="cuda",
            )


class WordTokenCollectionTests(unittest.TestCase):
    def test_collects_and_trims_words(self) -> None:
        segments = [
            SimpleNamespace(
                words=[
                    SimpleNamespace(word=" Hola", start=0.10, end=0.42, probability=0.93),
                    SimpleNamespace(word=" mundo", start=0.44, end=0.90, probability=0.88),
                ]
            )
        ]

        words = collect_word_tokens(segments)
        self.assertEqual([word.text for word in words], ["Hola", "mundo"])
        self.assertEqual(words[0].start, 0.1)
        self.assertEqual(words[1].end, 0.9)

    def test_discards_empty_word_tokens(self) -> None:
        segments = [
            SimpleNamespace(
                words=[
                    SimpleNamespace(word="   ", start=0.0, end=0.1, probability=0.1),
                    SimpleNamespace(word="ok", start=0.2, end=0.4, probability=0.9),
                ]
            )
        ]
        words = collect_word_tokens(segments)
        self.assertEqual(len(words), 1)
        self.assertEqual(words[0].text, "ok")

    def test_rejects_zero_duration(self) -> None:
        segments = [
            SimpleNamespace(
                words=[SimpleNamespace(word="hola", start=1.0, end=1.0, probability=0.9)]
            )
        ]
        with self.assertRaises(TranscriptionError):
            collect_word_tokens(segments)

    def test_rejects_regressive_start(self) -> None:
        segments = [
            SimpleNamespace(
                words=[
                    SimpleNamespace(word="uno", start=1.0, end=1.2, probability=0.9),
                    SimpleNamespace(word="dos", start=0.8, end=1.4, probability=0.9),
                ]
            )
        ]
        with self.assertRaises(TranscriptionError):
            collect_word_tokens(segments)


if __name__ == "__main__":
    unittest.main()
