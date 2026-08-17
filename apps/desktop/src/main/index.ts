import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'

function repoRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '../../../..')
}

function runEngineHealth(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-m', 'engine.cli', 'health'], {
      cwd: repoRoot(),
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Engine encerrou com código ${code}`))
        return
      }

      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        reject(new Error('Engine retornou JSON inválido'))
      }
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 820,
    minHeight: 580,
    backgroundColor: '#101114',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('engine:health', async () => runEngineHealth())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
