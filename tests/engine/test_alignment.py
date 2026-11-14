import unittest

try:
    import numpy as np
except ImportError:  # pragma: no cover - CI instala numpy para esta suíte
    np = None

if np is not None:
    from engine.alignment.aligner import TextSegment, _fill_unaligned, align_segments
    from engine.alignment.ctc import align_words, tokenize_words

VOCAB = {"<pad>": 0, "|": 1, "a": 2, "c": 3, "h": 4, "i": 5, "l": 6, "m": 7, "o": 8, "s": 9, "é": 10, "n": 11}


def emissions(frames: list[str], vocab: dict[str, int], confidence: float = 0.9):
    """Log-probs sintéticos: cada frame aponta para um símbolo (`_` = blank)."""
    other = (1.0 - confidence) / (len(vocab) - 1)
    probs = np.full((len(frames), len(vocab)), other)
    for t, symbol in enumerate(frames):
        probs[t, vocab["<pad>" if symbol == "_" else symbol]] = confidence
    return np.log(probs)


@unittest.skipIf(np is None, "numpy é necessário para o alinhamento")
class TokenizeTest(unittest.TestCase):
    def test_lowercases_folds_accents_and_drops_symbols(self):
        tokens = tokenize_words(["¿Hola,", "Mâs", "50", "₲"], VOCAB)
        self.assertEqual(tokens[0], [VOCAB["h"], VOCAB["o"], VOCAB["l"], VOCAB["a"]])
        self.assertEqual(tokens[1], [VOCAB["m"], VOCAB["a"], VOCAB["s"]])
        self.assertEqual(tokens[2], [])
        self.assertEqual(tokens[3], [])

    def test_keeps_accented_letters_present_in_vocab(self):
        self.assertEqual(tokenize_words(["Sé"], VOCAB)[0], [VOCAB["s"], VOCAB["é"]])


@unittest.skipIf(np is None, "numpy é necessário para o alinhamento")
class AlignWordsTest(unittest.TestCase):
    def test_finds_word_boundaries_from_emissions(self):
        frames = list("___hhoola___|__ccasaa__")
        spans = align_words(
            emissions(frames, VOCAB),
            tokenize_words(["hola", "casa"], VOCAB),
            blank=0,
            delimiter=VOCAB["|"],
        )
        self.assertEqual([(s.word_index, s.start_frame, s.end_frame) for s in spans], [(0, 3, 9), (1, 15, 21)])

    def test_repeated_letters_need_a_blank_between(self):
        frames = list("__s_s__")
        spans = align_words(emissions(frames, VOCAB), [[VOCAB["s"], VOCAB["s"]]], blank=0)
        self.assertEqual((spans[0].start_frame, spans[0].end_frame), (2, 5))

    def test_words_without_tokens_are_left_for_interpolation(self):
        frames = list("__hola____mil__")
        spans = align_words(
            emissions(frames, VOCAB),
            tokenize_words(["hola", "50", "mil"], VOCAB),
            blank=0,
        )
        self.assertEqual([s.word_index for s in spans], [0, 2])

    def test_garbage_states_absorb_speech_outside_the_text(self):
        # Outro falante diz "mas" antes e "si" depois; o texto é só "hola".
        frames = list("__mas__hola__si__")
        tokens = tokenize_words(["hola"], VOCAB)
        robust = align_words(emissions(frames, VOCAB), tokens, blank=0, garbage_penalty=2.0)
        self.assertEqual((robust[0].start_frame, robust[0].end_frame), (7, 11))

    def test_garbage_never_swallows_the_text_itself(self):
        frames = list("hola")
        spans = align_words(emissions(frames, VOCAB), tokenize_words(["hola"], VOCAB), blank=0, garbage_penalty=0.0)
        self.assertEqual((spans[0].start_frame, spans[0].end_frame), (0, 4))

    def test_rejects_audio_shorter_than_text(self):
        with self.assertRaises(ValueError):
            align_words(emissions(list("__"), VOCAB), tokenize_words(["hola"], VOCAB), blank=0)


@unittest.skipIf(np is None, "numpy é necessário para o alinhamento")
class FillUnalignedTest(unittest.TestCase):
    def test_spreads_missing_words_between_neighbors(self):
        timed = _fill_unaligned(["con", "50", "mil"], {0: (1.0, 1.2, 0.9), 2: (1.6, 1.8, 0.9)}, 0.0, 3.0)
        self.assertEqual([round(start, 3) for start, _end, _score in timed], [1.0, 1.2, 1.6])
        self.assertIsNone(timed[1][2])

    def test_whole_segment_without_alignment_uses_window(self):
        timed = _fill_unaligned(["50", "₲"], {}, 2.0, 3.0)
        self.assertEqual([(round(s, 3), round(e, 3)) for s, e, _ in timed], [(2.0, 2.5), (2.5, 3.0)])


class FakeModel:
    """Modelo CTC falso: 1 frame = 20 ms e emissões montadas por posição."""

    vocab = VOCAB
    blank = 0
    delimiter = None

    def __init__(self, script: dict[float, str]):
        self.script = script
        self.offsets: list[float] = []

    def log_probs(self, audio):
        frames = len(audio) // 320
        offset = audio[0]
        self.offsets.append(float(offset))
        symbols = ["_"] * frames
        for start_seconds, text in self.script.items():
            first = int(round((start_seconds - offset) / 0.02))
            for index, char in enumerate(text):
                if 0 <= first + index < frames:
                    symbols[first + index] = char
        return emissions(symbols, VOCAB)


@unittest.skipIf(np is None, "numpy é necessário para o alinhamento")
class AlignSegmentsTest(unittest.TestCase):
    def audio(self, seconds: float):
        # Cada amostra guarda o próprio instante, para o FakeModel saber o offset da janela.
        return np.arange(int(seconds * 16000), dtype=np.float32) / 16000

    def test_word_times_come_from_audio_not_from_whisper_window(self):
        model = FakeModel({1.30: "hola", 1.50: "casa"})
        words = align_segments(self.audio(4.0), [TextSegment("Hola casa", start=0.5, end=3.0)], model)
        self.assertEqual([w.text for w in words], ["Hola", "casa"])
        self.assertAlmostEqual(words[0].start, 1.30, delta=0.021)
        self.assertAlmostEqual(words[1].start, 1.50, delta=0.021)

    def test_times_are_monotonic_across_segments(self):
        model = FakeModel({1.0: "hola", 2.0: "casa"})
        words = align_segments(
            self.audio(4.0),
            [TextSegment("hola", 0.8, 1.5), TextSegment("casa", 1.0, 2.5)],
            model,
        )
        for left, right in zip(words, words[1:]):
            self.assertGreaterEqual(right.start, left.end)
            self.assertGreater(left.end, left.start)

    def test_edited_text_with_unspoken_number_is_interpolated(self):
        model = FakeModel({1.0: "con", 1.4: "mil"})
        words = align_segments(self.audio(3.0), [TextSegment("con 50 mil", 0.5, 2.0)], model)
        self.assertEqual([w.text for w in words], ["con", "50", "mil"])
        self.assertGreaterEqual(words[1].start, words[0].end)
        self.assertLessEqual(words[1].end, words[2].start + 1e-9)
        self.assertIsNone(words[1].probability)

    def test_last_word_of_each_paragraph_forces_a_caption_break(self):
        model = FakeModel({1.0: "hola", 2.0: "casa"})
        words = align_segments(
            self.audio(4.0),
            [TextSegment("hola", 0.8, 1.5), TextSegment("casa", 1.6, 2.5)],
            model,
        )
        self.assertEqual([w.break_after for w in words], [True, True])

    def test_empty_segment_is_skipped(self):
        model = FakeModel({1.0: "hola"})
        words = align_segments(self.audio(2.0), [TextSegment("   ", 0.0, 0.5), TextSegment("hola", 0.6, 1.5)], model)
        self.assertEqual([w.text for w in words], ["hola"])


if __name__ == "__main__":
    unittest.main()
