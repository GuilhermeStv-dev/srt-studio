import { contextBridge, ipcRenderer, webUtils } from 'electron'

type TranscriptionProgress = {
  stage: string
  progress: number | null
}

contextBridge.exposeInMainWorld('srtStudio', {
  engineHealth: () => ipcRenderer.invoke('engine:health'),
  transcriptionRuntime: () => ipcRenderer.invoke('engine:runtime'),
  selectMedia: () => ipcRenderer.invoke('media:select'),
  filePathFor: (file: File) => webUtils.getPathForFile(file),
  transcribe: (input: {
    filePath: string
    model: string
    language: string | null
    targetWords: number
    ignorePrepositions: boolean
    preserveCommasPeriods: boolean
    formatMonetaryThousands: boolean
  }) => ipcRenderer.invoke('engine:transcribe', input),
  cancelTranscription: () => ipcRenderer.invoke('engine:cancel-transcription'),
  onTranscriptionProgress: (callback: (payload: TranscriptionProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TranscriptionProgress) => callback(payload)
    ipcRenderer.on('engine:transcription-progress', listener)
    return () => ipcRenderer.removeListener('engine:transcription-progress', listener)
  },
  exportSrt: (input: {
    sourceFilePath: string
    captions: Array<{ text: string; start: number; end: number }>
  }) => ipcRenderer.invoke('srt:export', input)
})