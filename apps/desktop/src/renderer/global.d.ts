export {}

type RuntimeInfo =
  | { ok: true; available: true; device: string; compute_type: string; cuda_devices: number; warning?: string | null }
  | { ok: false; available: false; error: string }

type TranscriptionWord = {
  text: string
  start: number
  end: number
  probability?: number | null
}

type CaptionPreview = {
  text: string
  start: number
  end: number
}

type SegmentationSettings = {
  target_words: number
  ignore_prepositions: boolean
  preserve_punctuation: boolean
  monetary_thousands: boolean
}

type TranscriptionResult = {
  ok: true
  language: string
  language_probability: number | null
  duration: number
  model: string
  device: string
  compute_type: string
  runtime_warning?: string | null
  words: TranscriptionWord[]
  captions: CaptionPreview[]
  segmentation: SegmentationSettings
}

declare global {
  interface Window {
    srtStudio: {
      engineHealth(): Promise<{ ok: boolean; engine: string; version: string; python_version: string; python_executable: string }>
      transcriptionRuntime(): Promise<RuntimeInfo>
      selectMedia(): Promise<{ canceled: boolean; filePath: string | null }>
      transcribe(input: {
        filePath: string
        model: string
        language: string | null
        targetWords: number
        ignorePrepositions: boolean
        preservePunctuation: boolean
        formatMonetaryThousands: boolean
      }): Promise<TranscriptionResult>
    }
  }
}
