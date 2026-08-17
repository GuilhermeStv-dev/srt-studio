import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('srtStudio', {
  engineHealth: () => ipcRenderer.invoke('engine:health'),
  transcriptionRuntime: () => ipcRenderer.invoke('engine:runtime'),
  selectMedia: () => ipcRenderer.invoke('media:select'),
  transcribe: (input: {
    filePath: string
    model: string
    language: string | null
    targetWords: number
    ignorePrepositions: boolean
    preserveCommasPeriods: boolean
    formatMonetaryThousands: boolean
  }) => ipcRenderer.invoke('engine:transcribe', input),
  exportSrt: (input: {
    sourceFilePath: string
    captions: Array<{ text: string; start: number; end: number }>
  }) => ipcRenderer.invoke('srt:export', input)
})
