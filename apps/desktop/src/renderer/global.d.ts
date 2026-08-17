export {}

declare global {
  interface Window {
    srtStudio: {
      engineHealth(): Promise<{ ok: boolean; engine: string; version: string }>
    }
  }
}
