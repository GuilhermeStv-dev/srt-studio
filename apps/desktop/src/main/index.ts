import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

function repoRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '../../../..')
}

function pythonExecutable(): string {
  const override = process.env.SRT_STUDIO_PYTHON?.trim()
  if (override) return override

  const localPython = process.platform === 'win32'
    ? path.join(repoRoot(), '.venv', 'Scripts', 'python.exe')
    : path.join(repoRoot(), '.venv', 'bin', 'python')

  return existsSync(localPython) ? localPython : 'python'
}

function parseJson(value: string, fallbackMessage: string): unknown {
  try {
    return JSON.parse(value.trim())
  } catch {
    throw new Error(fallbackMessage)
  }
}

function runEngineJson(
  args: string[],
  acceptNonZero = false,
  stdinPayload?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable(), ['-X', 'utf8', '-m', 'engine.cli', ...args], {
      cwd: repoRoot(),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !acceptNonZero) {
        if (stderr.trim()) {
          try {
            const payload = JSON.parse(stderr.trim()) as { error?: string }
            reject(new Error(payload.error || stderr.trim()))
          } catch {
            reject(new Error(stderr.trim()))
          }
          return
        }
        reject(new Error(`Engine encerrou com código ${code}`))
        return
      }

      if (!stdout.trim()) {
        reject(new Error(stderr.trim() || 'Engine não retornou resposta'))
        return
      }

      try {
        resolve(parseJson(stdout, 'Engine retornou JSON inválido'))
      } catch (error) {
        reject(error)
      }
    })

    if (stdinPayload !== undefined) {
      child.stdin.setDefaultEncoding('utf8')
      child.stdin.end(JSON.stringify(stdinPayload))
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 860,
    minHeight: 620,
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
  ipcMain.handle('engine:health', async () => runEngineJson(['health']))
  ipcMain.handle('engine:runtime', async () => runEngineJson(['runtime'], true))

  ipcMain.handle('media:select', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar áudio ou vídeo',
      properties: ['openFile'],
      filters: [
        {
          name: 'Áudio e vídeo',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm']
        },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })

    return {
      canceled: result.canceled,
      filePath: result.filePaths[0] ?? null
    }
  })

  ipcMain.handle(
    'engine:transcribe',
    async (_event, input: {
      filePath: string
      model: string
      language: string | null
      targetWords: number
      ignorePrepositions: boolean
      preserveCommasPeriods: boolean
      formatMonetaryThousands: boolean
    }) => {
      const args = [
        'transcribe',
        input.filePath,
        '--model',
        input.model,
        '--target-words',
        String(input.targetWords)
      ]
      if (input.language) args.push('--language', input.language)
      if (!input.ignorePrepositions) args.push('--count-prepositions')
      if (!input.preserveCommasPeriods) args.push('--remove-commas-periods')
      if (input.formatMonetaryThousands) args.push('--monetary-thousands')
      return runEngineJson(args)
    }
  )

  ipcMain.handle(
    'srt:export',
    async (_event, input: {
      sourceFilePath: string
      captions: Array<{ text: string; start: number; end: number }>
    }) => {
      if (!input.sourceFilePath || !Array.isArray(input.captions) || input.captions.length === 0) {
        throw new Error('É preciso transcrever e gerar captions antes de exportar o SRT')
      }

      const source = path.parse(input.sourceFilePath)
      const selection = await dialog.showSaveDialog({
        title: 'Exportar SRT',
        defaultPath: path.join(source.dir, `${source.name}.srt`),
        filters: [{ name: 'Legenda SubRip', extensions: ['srt'] }]
      })

      if (selection.canceled || !selection.filePath) {
        return { canceled: true }
      }

      const outputPath = path.extname(selection.filePath).toLowerCase() === '.srt'
        ? selection.filePath
        : `${selection.filePath}.srt`

      let overwrite = false
      if (existsSync(outputPath)) {
        const confirmation = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Cancelar', 'Substituir'],
          defaultId: 0,
          cancelId: 0,
          title: 'Arquivo já existe',
          message: 'Já existe um SRT com esse nome.',
          detail: `O arquivo só será substituído se você confirmar.\n\n${outputPath}`
        })
        if (confirmation.response !== 1) {
          return { canceled: true }
        }
        overwrite = true
      }

      const args = ['export-srt', '--output', outputPath]
      if (overwrite) args.push('--overwrite')

      const result = await runEngineJson(args, false, { captions: input.captions })
      return { canceled: false, ...(result as Record<string, unknown>) }
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
