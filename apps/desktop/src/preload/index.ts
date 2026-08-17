import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('srtStudio', {
  engineHealth: () => ipcRenderer.invoke('engine:health'),
  transcriptionRuntime: () => ipcRenderer.invoke('engine:runtime'),
  selectMedia: () => ipcRenderer.invoke('media:select'),
  transcribe: (input: { filePath: string; model: string; language: string | null; targetChars: number }) =>
    ipcRenderer.invoke('engine:transcribe', input)
})
