export {}

type RuntimeInfo =
  | { ok: true; available: true; device: string; compute_type: string; cuda_devices: number }
  | { ok: false; available: false; error: string }

type TranscriptionWord = {
  text: string
  start: number
  end: number
  probability?: number | null
}

type TranscriptionResult = {
  ok: true
  language: string
  language_probability: number | null
  duration: number
  model: string
  device: string
  compute_type: string
  words: TranscriptionWord[]
}

declare global {
  interface Window {
    srtStudio: {
      engineHealth(): Promise<{ ok: boolean; engine: string; version: string }>
      transcriptionRuntime(): Promise<RuntimeInfo>
      selectMedia(): Promise<{ canceled: boolean; filePath: string | null }>
      transcribe(input: {
        filePath: string
        model: string
        language: string | null
      }): Promise<TranscriptionResult>
    }
  }
}
