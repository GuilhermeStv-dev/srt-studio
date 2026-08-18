import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import squirrelStartup from 'electron-squirrel-startup'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

if (squirrelStartup) app.quit()

const PROGRESS_PREFIX = 'SRT_PROGRESS '
const APP_USER_MODEL_ID = 'com.squirrel.SRTStudio.SRTStudio'

type ActiveTranscription = {
  child: ChildProcessWithoutNullStreams
  cancelled: boolean
}

let activeTranscription: ActiveTranscription | null = null

function repoRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '../../../..')
}

function appIconPath(): string | undefined {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'srtx.ico')
    : path.join(repoRoot(), 'build', 'branding', 'srtx.ico')

  return existsSync(candidate) ? candidate : undefined
}

function pythonExecutable(): string {
  const override = process.env.SRT_STUDIO_PYTHON?.trim()
  if (override) return override

  const localPython = process.platform === 'win32'
    ? path.join(repoRoot(), '.venv', 'Scripts', 'python.exe')
    : path.join(repoRoot(), '.venv', 'bin', 'python')

  return existsSync(localPython) ? localPython : 'python'
}

function packagedEngineExecutable(): string {
  const override = process.env.SRT_STUDIO_ENGINE?.trim()
  if (override) return override

  return process.platform === 'win32'
    ? path.join(process.resourcesPath, 'srt-studio-engine', 'srt-studio-engine.exe')
    : path.join(process.resourcesPath, 'srt-studio-engine', 'srt-studio-engine')
}

function engineSpawn(args: string[]): ChildProcessWithoutNullStreams {
  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8'
  }

  if (app.isPackaged) {
    const executable = packagedEngineExecutable()
    return spawn(executable, args, {
      cwd: path.dirname(executable),
      windowsHide: true,
      env
    })
  }

  return spawn(pythonExecutable(), ['-X', 'utf8', '-m', 'engine.cli', ...args], {
    cwd: repoRoot(),
    windowsHide: true,
    env
  })
}

function parseJson(value: string, fallbackMessage: string): unknown {
  try {
    return JSON.parse(value.trim())
  } catch {
    throw new Error(fallbackMessage)
  }
}

function engineError(stderr: string, code: number | null): Error {
  const value = stderr.trim()
  if (value) {
    const lines = value.split(/\r?\n/).filter(Boolean)
    const lastLine = lines.at(-1) ?? value
    try {
      const payload = JSON.parse(lastLine) as { error?: string }
      return new Error(payload.error || value)
    } catch {
      return new Error(value)
    }
  }
  return new Error(`Engine encerrou com código ${code}`)
}

function runEngineJson(
  args: string[],
  acceptNonZero = false,
  stdinPayload?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = engineSpawn(args)
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !acceptNonZero) {
        reject(engineError(stderr, code))
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

function runTranscriptionJson(
  args: string[],
  onProgress: (payload: { stage: string; progress: number | null }) => void
): Promise<unknown> {
  if (activeTranscription) {
    return Promise.reject(new Error('Já existe uma transcrição em andamento'))
  }

  return new Promise((resolve, reject) => {
    const child = engineSpawn([...args, '--progress-events'])
    const job: ActiveTranscription = { child, cancelled: false }
    activeTranscription = job

    let stdout = ''
    let stderr = ''
    let stderrBuffer = ''
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      if (activeTranscription === job) activeTranscription = null
      callback()
    }

    const handleStderrLine = (line: string) => {
      if (!line) return
      if (line.startsWith(PROGRESS_PREFIX)) {
        const raw = line.slice(PROGRESS_PREFIX.length)
        try {
          const payload = JSON.parse(raw) as { stage?: unknown; progress?: unknown }
          if (typeof payload.stage === 'string') {
            const progress = typeof payload.progress === 'number' && Number.isFinite(payload.progress)
              ? Math.min(1, Math.max(0, payload.progress))
              : null
            onProgress({ stage: payload.stage, progress })
          }
        } catch {
          stderr += `${line}\n`
        }
        return
      }
      stderr += `${line}\n`
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk
      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() ?? ''
      for (const line of lines) handleStderrLine(line)
    })

    child.on('error', (error) => {
      finish(() => reject(error))
    })

    child.on('close', (code) => {
      if (stderrBuffer) {
        handleStderrLine(stderrBuffer)
        stderrBuffer = ''
      }

      if (job.cancelled) {
        finish(() => resolve({ ok: false, cancelled: true }))
        return
      }

      if (code !== 0) {
        finish(() => reject(engineError(stderr, code)))
        return
      }

      if (!stdout.trim()) {
        finish(() => reject(new Error(stderr.trim() || 'Engine não retornou resposta')))
        return
      }

      try {
        const payload = parseJson(stdout, 'Engine retornou JSON inválido')
        finish(() => resolve(payload))
      } catch (error) {
        finish(() => reject(error))
      }
    })
  })
}

function createWindow(): void {
  const icon = appIconPath()
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#101114',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.platform === 'win32') {
    if (icon) win.setIcon(icon)
    win.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: icon ?? process.execPath,
      appIconIndex: 0,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'SRTX'
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.setAppUserModelId(APP_USER_MODEL_ID)

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
    async (event, input: {
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

      return runTranscriptionJson(args, (payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('engine:transcription-progress', payload)
        }
      })
    }
  )

  ipcMain.handle('engine:cancel-transcription', async () => {
    const job = activeTranscription
    if (!job) return { ok: true, hadActiveTranscription: false }

    job.cancelled = true
    const signaled = job.child.kill()
    return {
      ok: true,
      hadActiveTranscription: true,
      signalSent: signaled || job.child.killed
    }
  })

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

app.on('before-quit', () => {
  if (activeTranscription) {
    activeTranscription.cancelled = true
    activeTranscription.child.kill()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
