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
  preserve_commas_periods: boolean
  monetary_thousands: boolean
}

type SuccessfulTranscriptionResult = {
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

type TextSegment = {
  text: string
  start: number
  end: number
}

type SuccessfulTextTranscriptionResult = {
  ok: true
  language: string
  language_probability: number | null
  duration: number
  model: string
  device: string
  compute_type: string
  runtime_warning?: string | null
  segments: TextSegment[]
}

type TextTranscriptionResult =
  | SuccessfulTextTranscriptionResult
  | { ok: false; cancelled: true }

type CaptionResult =
  | {
      ok: true
      words: TranscriptionWord[]
      captions: CaptionPreview[]
      segmentation: SegmentationSettings
    }
  | { ok: false; cancelled: true }

type SegmentResult = {
  ok: true
  captions: CaptionPreview[]
  segmentation: SegmentationSettings
}

type TranscriptionResult =
  | SuccessfulTranscriptionResult
  | { ok: false; cancelled: true }

type TranscriptionProgress = {
  stage: string
  progress: number | null
}

type SrtExportResult =
  | { canceled: true }
  | {
      canceled: false
      ok: true
      path: string
      cue_count: number
      byte_count: number
    }

declare global {
  interface Window {
    srtStudio: {
      engineHealth(): Promise<{ ok: boolean; engine: string; version: string; python_version: string; python_executable: string }>
      transcriptionRuntime(): Promise<RuntimeInfo>
      selectMedia(): Promise<{ canceled: boolean; filePath: string | null }>
      filePathFor(file: File): string
      transcribe(input: {
        filePath: string
        model: string
        language: string | null
        targetWords: number
        ignorePrepositions: boolean
        preserveCommasPeriods: boolean
        formatMonetaryThousands: boolean
      }): Promise<TranscriptionResult>
      transcribeText(input: {
        filePath: string
        model: string
        language: string | null
      }): Promise<TextTranscriptionResult>
      caption(input: {
        filePath: string
        language: string
        segments: TextSegment[]
        segmentation: SegmentationSettings
      }): Promise<CaptionResult>
      onCaptionProgress(callback: (payload: TranscriptionProgress) => void): () => void
      cancelTranscription(): Promise<{
        ok: true
        hadActiveTranscription: boolean
        signalSent?: boolean
      }>
      onTranscriptionProgress(callback: (payload: TranscriptionProgress) => void): () => void
      segment(input: {
        words: TranscriptionWord[]
        segmentation: SegmentationSettings
      }): Promise<SegmentResult>
      exportSrt(input: {
        sourceFilePath: string
        captions: CaptionPreview[]
      }): Promise<SrtExportResult>
    }
  }
}