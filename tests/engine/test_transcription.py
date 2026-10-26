from types import SimpleNamespace
import unittest

from engine.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    collect_word_tokens,
    find_missing_windows_cuda_libraries,
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

    def test_cuda_dll_check_is_windows_only(self) -> None:
        missing = find_missing_windows_cuda_libraries(
            platform_name="linux",
            loader=lambda _: (_ for _ in ()).throw(OSError("não deveria carregar")),
        )
        self.assertEqual(missing, ())

    def test_reports_missing_windows_cuda_dlls(self) -> None:
        def fake_loader(name: str) -> object:
            if name == "cublas64_12.dll":
                raise OSError("missing")
            return object()

        missing = find_missing_windows_cuda_libraries(
            platform_name="win32",
            loader=fake_loader,
        )
        self.assertEqual(missing, ("cublas64_12.dll",))


class WordTokenCollectionTests(unittest.TestCase):
    def test_collects_and_trims_words(self) -> None:
        segments = [
            SimpleNamespace(
                end=0.90,
                words=[
                    SimpleNamespace(word=" Hola", start=0.10, end=0.42, probability=0.93),
                    SimpleNamespace(word=" mundo", start=0.44, end=0.90, probability=0.88),
                ],
            )
        ]

        words = collect_word_tokens(segments)
        self.assertEqual([word.text for word in words], ["Hola", "mundo"])
        self.assertEqual(words[0].start, 0.1)
        self.assertEqual(words[1].end, 0.9)

    def test_reports_progress_from_segment_end_and_duration(self) -> None:
        segments = [
            SimpleNamespace(
                end=0.50,
                words=[SimpleNamespace(word="uno", start=0.10, end=0.40, probability=0.9)],
            ),
            SimpleNamespace(
                end=1.50,
                words=[SimpleNamespace(word="dos", start=1.10, end=1.40, probability=0.9)],
            ),
        ]
        events: list[tuple[str, float | None]] = []

        collect_word_tokens(
            segments,
            duration=2.0,
            progress_callback=lambda stage, progress: events.append((stage, progress)),
        )

        self.assertEqual(events, [("transcribing", 0.25), ("transcribing", 0.75)])

    def test_progress_is_capped_below_completion_until_pipeline_finishes(self) -> None:
        segments = [
            SimpleNamespace(
                end=2.20,
                words=[SimpleNamespace(word="fin", start=1.80, end=2.10, probability=0.9)],
            )
        ]
        events: list[tuple[str, float | None]] = []

        collect_word_tokens(
            segments,
            duration=2.0,
            progress_callback=lambda stage, progress: events.append((stage, progress)),
        )

        self.assertEqual(events[-1], ("transcribing", 0.99))

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

    def test_normalizes_zero_duration_using_minimum_interval(self) -> None:
        segments = [
            SimpleNamespace(
                words=[SimpleNamespace(word="hola", start=1.0, end=1.0, probability=0.9)]
            )
        ]
        words = collect_word_tokens(segments)
        self.assertEqual(len(words), 1)
        self.assertEqual(words[0].start, 1.0)
        self.assertEqual(words[0].end, 1.05)

    def test_normalizes_zero_duration_using_next_word_start_when_available(self) -> None:
        segments = [
            SimpleNamespace(
                words=[
                    SimpleNamespace(word="hola", start=1.0, end=1.0, probability=0.9),
                    SimpleNamespace(word="mundo", start=1.08, end=1.30, probability=0.8),
                ]
            )
        ]
        words = collect_word_tokens(segments)
        self.assertEqual([word.text for word in words], ["hola", "mundo"])
        self.assertEqual(words[0].end, 1.08)

    def test_repairs_duration_collapsed_by_millisecond_rounding(self) -> None:
        segments = [
            SimpleNamespace(
                words=[
                    SimpleNamespace(word=" ¿Tenés", start=59.4401, end=59.4404, probability=0.9),
                    SimpleNamespace(word=" hambre?", start=59.62, end=60.1, probability=0.8),
                ]
            )
        ]
        words = collect_word_tokens(segments)
        self.assertEqual(words[0].text, "¿Tenés")
        self.assertEqual(words[0].start, 59.44)
        self.assertEqual(words[0].end, 59.62)

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
