import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BUILTIN_PRESETS,
  createCustomPreset,
  loadCustomPresets,
  persistCustomPresets,
  samePresetSettings,
  type Preset,
  type PresetSettings
} from './presets'
import './style.css'

type HealthState =
  | { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

type RuntimeState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'missing'; message: string }

type Caption = { text: string; start: number; end: number }

type TranscriptionState =
  | { status: 'idle'; message: string }
  | {
      status: 'loading'
      message: string
      stage: string
      progress: number | null
      cancelling: boolean
    }
  | { status: 'success'; message: string; words: Caption[]; captions: Caption[] }
  | { status: 'error'; message: string }

type ExportState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; path: string }
  | { status: 'error'; message: string }

const MEDIA_EXTENSIONS = new Set([
  'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg',
  'mp4', 'mov', 'mkv', 'avi', 'webm'
])

function fileName(filePath: string | null): string {
  if (!filePath) return 'Nenhum arquivo selecionado'
  return filePath.split(/[\\/]/).pop() || filePath
}

function hasSupportedMediaExtension(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase()
  return Boolean(extension && MEDIA_EXTENSIONS.has(extension))
}

function progressMessage(stage: string, progress: number | null): string {
  if (stage === 'preparing') return 'Preparando runtime de transcrição…'
  if (stage === 'loading_model') return 'Carregando modelo Whisper…'
  if (stage === 'transcribing') {
    return progress === null
      ? 'Transcrevendo áudio…'
      : `Transcrevendo áudio… ${Math.round(progress * 100)}%`
  }
  if (stage === 'finalizing') return 'Segmentando e validando captions…'
  if (stage === 'completed') return 'Finalizando resultado…'
  return 'Transcrevendo…'
}

function App() {
  const [health, setHealth] = useState<HealthState>({
    status: 'idle',
    message: 'Engine ainda não verificado'
  })
  const [runtime, setRuntime] = useState<RuntimeState>({
    status: 'loading',
    message: 'Verificando faster-whisper…'
  })
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [sourceMessage, setSourceMessage] = useState<string | null>(null)
  const dragDepth = useRef(0)
  const [model, setModel] = useState('large-v3')
  const [language, setLanguage] = useState('es')
  const [targetWords, setTargetWords] = useState(2)
  const [ignorePrepositions, setIgnorePrepositions] = useState(true)
  const [preserveCommasPeriods, setPreserveCommasPeriods] = useState(true)
  const [formatMonetaryThousands, setFormatMonetaryThousands] = useState(false)
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => loadCustomPresets())
  const [presetMessage, setPresetMessage] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<TranscriptionState>({
    status: 'idle',
    message: 'Selecione um arquivo para iniciar a primeira transcrição real.'
  })
  const [exportState, setExportState] = useState<ExportState>({
    status: 'idle',
    message: 'O SRT ficará disponível depois da transcrição.'
  })

  const selectedName = useMemo(() => fileName(filePath), [filePath])
  const isTranscribing = transcription.status === 'loading'
  const allPresets = useMemo(() => [...BUILTIN_PRESETS, ...customPresets], [customPresets])
  const currentSettings = useMemo<PresetSettings>(() => ({
    model,
    language,
    targetWords,
    ignorePrepositions,
    preserveCommasPeriods,
    formatMonetaryThousands
  }), [
    model,
    language,
    targetWords,
    ignorePrepositions,
    preserveCommasPeriods,
    formatMonetaryThousands
  ])
  const activePresetId = useMemo(
    () => allPresets.find((preset) => samePresetSettings(preset, currentSettings))?.id ?? 'custom',
    [allPresets, currentSettings]
  )
  const activeCustomPreset = useMemo(
    () => customPresets.find((preset) => preset.id === activePresetId) ?? null,
    [customPresets, activePresetId]
  )

  function applySettings(settings: PresetSettings) {
    setModel(settings.model)
    setLanguage(settings.language)
    setTargetWords(settings.targetWords)
    setIgnorePrepositions(settings.ignorePrepositions)
    setPreserveCommasPeriods(settings.preserveCommasPeriods)
    setFormatMonetaryThousands(settings.formatMonetaryThousands)
  }

  function applyPreset(presetId: string) {
    if (isTranscribing || presetId === 'custom') return
    const preset = allPresets.find((item) => item.id === presetId)
    if (!preset) return
    applySettings(preset)
    setPresetMessage(`Preset aplicado: ${preset.name}`)
  }

  function saveCurrentPreset() {
    if (isTranscribing) return
    const suggestedName = activeCustomPreset?.name ?? ''
    const requested = window.prompt('Nome do preset', suggestedName)
    const name = requested?.trim()
    if (!name) return

    if (BUILTIN_PRESETS.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
      window.alert('Esse nome pertence a um preset padrão. Escolha outro nome.')
      return
    }

    setCustomPresets((current) => {
      const existing = current.find((preset) => preset.name.toLowerCase() === name.toLowerCase())
      const next = existing
        ? current.map((preset) => preset.id === existing.id
          ? { ...preset, ...currentSettings, name }
          : preset)
        : [...current, createCustomPreset(name, currentSettings)]
      persistCustomPresets(next)
      return next
    })
    setPresetMessage(`Preset salvo: ${name}`)
  }

  function deleteActivePreset() {
    if (isTranscribing || !activeCustomPreset) return
    if (!window.confirm(`Excluir o preset “${activeCustomPreset.name}”?`)) return

    setCustomPresets((current) => {
      const next = current.filter((preset) => preset.id !== activeCustomPreset.id)
      persistCustomPresets(next)
      return next
    })
    setPresetMessage(`Preset excluído: ${activeCustomPreset.name}`)
  }

  function applySourceFile(nextFilePath: string) {
    setFilePath(nextFilePath)
    setSourceMessage(null)
    setTranscription({
      status: 'idle',
      message: 'Arquivo pronto. A transcrição ainda não altera nem sobrescreve o original.'
    })
    setExportState({
      status: 'idle',
      message: 'O SRT ficará disponível depois da transcrição.'
    })
  }

  async function checkEngine() {
    setHealth({ status: 'loading', message: 'Verificando Python…' })
    try {
      const result = await window.srtStudio.engineHealth()
      setHealth({
        status: result.ok ? 'success' : 'error',
        message: result.ok ? `Engine ${result.version} · Python ${result.python_version}` : 'Engine respondeu com falha'
      })
    } catch (error) {
      setHealth({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha desconhecida'
      })
    }
  }

  async function checkRuntime() {
    setRuntime({ status: 'loading', message: 'Verificando faster-whisper…' })
    try {
      const result = await window.srtStudio.transcriptionRuntime()
      if (result.ok && result.available) {
        const base = `${result.device.toUpperCase()} · ${result.compute_type}`
        setRuntime({
          status: 'ready',
          message: result.warning ? `${base} · fallback CUDA` : base
        })
      } else {
        setRuntime({ status: 'missing', message: result.error })
      }
    } catch (error) {
      setRuntime({
        status: 'missing',
        message: error instanceof Error ? error.message : 'Runtime indisponível'
      })
    }
  }

  async function selectMedia() {
    if (isTranscribing) return
    const result = await window.srtStudio.selectMedia()
    if (!result.canceled && result.filePath) {
      applySourceFile(result.filePath)
    }
  }

  function handleDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (isTranscribing || !event.dataTransfer.types.includes('Files')) return
    dragDepth.current += 1
    setIsDragging(true)
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (isTranscribing || !event.dataTransfer.types.includes('Files')) return
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)

    if (isTranscribing) {
      setSourceMessage('Cancele a transcrição atual antes de trocar o arquivo.')
      return
    }

    const droppedFile = event.dataTransfer.files[0]
    if (!droppedFile) return

    const mediaMime = droppedFile.type.startsWith('audio/') || droppedFile.type.startsWith('video/')
    if (!mediaMime && !hasSupportedMediaExtension(droppedFile.name)) {
      setSourceMessage('Solte um arquivo de áudio ou vídeo compatível.')
      return
    }

    try {
      const droppedPath = window.srtStudio.filePathFor(droppedFile)
      if (!droppedPath) {
        setSourceMessage('Não foi possível obter o caminho local desse arquivo.')
        return
      }
      applySourceFile(droppedPath)
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : 'Falha ao receber o arquivo arrastado.')
    }
  }

  async function runTranscription() {
    if (!filePath) return
    setExportState({ status: 'idle', message: 'Aguardando a nova transcrição.' })
    setTranscription({
      status: 'loading',
      message: 'Preparando runtime de transcrição…',
      stage: 'preparing',
      progress: null,
      cancelling: false
    })

    try {
      const result = await window.srtStudio.transcribe({
        filePath,
        model,
        language: language === 'auto' ? null : language,
        targetWords,
        ignorePrepositions,
        preserveCommasPeriods,
        formatMonetaryThousands
      })

      if (!result.ok) {
        setTranscription({
          status: 'idle',
          message: 'Transcrição cancelada. Nenhuma caption nova foi aplicada.'
        })
        setExportState({
          status: 'idle',
          message: 'A transcrição foi cancelada; nenhum SRT novo foi gerado.'
        })
        return
      }

      const fallbackLabel = result.runtime_warning ? ' · fallback CUDA → CPU' : ''
      setTranscription({
        status: 'success',
        message: `${result.captions.length} captions · ${result.words.length} palavras · ${result.language} · ${result.device.toUpperCase()}${fallbackLabel} · ${result.duration.toFixed(1)}s`,
        words: result.words.slice(0, 24),
        captions: result.captions
      })
      setExportState({
        status: 'idle',
        message: 'Captions validadas no pipeline. Escolha onde salvar o SRT.'
      })
    } catch (error) {
      setTranscription({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao transcrever'
      })
    }
  }

  async function cancelTranscription() {
    setTranscription((current) => {
      if (current.status !== 'loading') return current
      return {
        ...current,
        cancelling: true,
        message: 'Cancelando transcrição…'
      }
    })

    try {
      const result = await window.srtStudio.cancelTranscription()
      if (!result.hadActiveTranscription) {
        setTranscription({
          status: 'idle',
          message: 'Nenhuma transcrição estava ativa.'
        })
      }
    } catch (error) {
      setTranscription({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao cancelar a transcrição'
      })
    }
  }

  async function exportSrt() {
    if (!filePath || transcription.status !== 'success') return

    setExportState({ status: 'loading', message: 'Validando e preparando o SRT…' })
    try {
      const result = await window.srtStudio.exportSrt({
        sourceFilePath: filePath,
        captions: transcription.captions
      })
      if (result.canceled) {
        setExportState({ status: 'idle', message: 'Exportação cancelada. Nenhum arquivo foi alterado.' })
        return
      }
      setExportState({
        status: 'success',
        path: result.path,
        message: `SRT exportado com ${result.cue_count} captions · UTF-8`
      })
    } catch (error) {
      setExportState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao exportar o SRT'
      })
    }
  }

  useEffect(() => {
    void checkEngine()
    void checkRuntime()

    const unsubscribeProgress = window.srtStudio.onTranscriptionProgress(({ stage, progress }) => {
      setTranscription((current) => {
        if (current.status !== 'loading' || current.cancelling) return current
        return {
          ...current,
          stage,
          progress,
          message: progressMessage(stage, progress)
        }
      })
    })

    const preventNativeFileOpen = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventNativeFileOpen)
    window.addEventListener('drop', preventNativeFileOpen)
    return () => {
      unsubscribeProgress()
      window.removeEventListener('dragover', preventNativeFileOpen)
      window.removeEventListener('drop', preventNativeFileOpen)
    }
  }, [])

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-topline">
          <span className="eyebrow">TRANSCRIÇÃO · 0.7 DEV</span>
          <span className={`status-dot ${runtime.status}`}>{runtime.message}</span>
        </div>
        <h1>SRT Studio</h1>
        <p>
          Transcrição local e captions inteligentes para um SRT rápido de editar no Premiere.
        </p>
      </section>

      <section className="workspace">
        <article
          className={`card primary source-card ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drop-overlay" aria-hidden="true">
              <strong>Solte o arquivo aqui</strong>
              <span>Áudio ou vídeo local</span>
            </div>
          )}
          <div className="card-copy">
            <span className="label">1 · Arquivo de origem</span>
            <h2>{selectedName}</h2>
            <p>{filePath || 'Áudio ou vídeo local. O arquivo original nunca é modificado.'}</p>
            <small className="source-hint">Arraste um arquivo para este cartão ou use o seletor.</small>
            {sourceMessage && <small className="source-error">{sourceMessage}</small>}
          </div>
          <button className="secondary" onClick={selectMedia} disabled={isTranscribing}>Selecionar arquivo</button>
        </article>

        <article className="card controls">
          <span className="label">2 · Transcrição e segmentação</span>

          <div className="preset-row">
            <label className="preset-selector">
              Preset
              <select
                value={activePresetId}
                onChange={(event) => applyPreset(event.target.value)}
                disabled={isTranscribing}
              >
                <option value="custom">Configuração personalizada</option>
                <optgroup label="Padrões">
                  {BUILTIN_PRESETS.map((preset) => (
                    <option value={preset.id} key={preset.id}>{preset.name}</option>
                  ))}
                </optgroup>
                {customPresets.length > 0 && (
                  <optgroup label="Meus presets">
                    {customPresets.map((preset) => (
                      <option value={preset.id} key={preset.id}>{preset.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="preset-actions">
              <button className="ghost" onClick={saveCurrentPreset} disabled={isTranscribing}>Salvar atual</button>
              {activeCustomPreset && (
                <button className="ghost danger" onClick={deleteActivePreset} disabled={isTranscribing}>Excluir preset</button>
              )}
            </div>
            {presetMessage && <small className="preset-message">{presetMessage}</small>}
          </div>

          <div className="field-row three">
            <label>
              Modelo Whisper
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={isTranscribing}>
                <option value="large-v3">Large v3 · precisão</option>
                <option value="medium">Medium · equilíbrio</option>
                <option value="small">Small · mais rápido</option>
              </select>
            </label>
            <label>
              Idioma
              <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={isTranscribing}>
                <option value="es">Español / ES-PY</option>
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="auto">Detectar</option>
              </select>
            </label>
            <label>
              Densidade preferida
              <select value={targetWords} onChange={(event) => setTargetWords(Number(event.target.value))} disabled={isTranscribing}>
                <option value={1}>1 palavra · muito dinâmica</option>
                <option value={2}>2 palavras · padrão</option>
                <option value={3}>3 palavras</option>
                <option value={4}>4 palavras</option>
              </select>
            </label>
          </div>

          <div className="option-grid">
            <label className="toggle-card">
              <input
                type="checkbox"
                checked={ignorePrepositions}
                onChange={(event) => setIgnorePrepositions(event.target.checked)}
                disabled={isTranscribing}
              />
              <span>
                <strong>Ignorar preposições na contagem</strong>
                <small>A densidade é uma preferência; cadência e coesão ainda podem ajustar o corte.</small>
              </span>
            </label>

            <label className="toggle-card">
              <input
                type="checkbox"
                checked={preserveCommasPeriods}
                onChange={(event) => setPreserveCommasPeriods(event.target.checked)}
                disabled={isTranscribing}
              />
              <span>
                <strong>Manter vírgulas e pontos</strong>
                <small>Controla apenas “,” e “.”. ¿ ? ¡ ! são sempre preservados.</small>
              </span>
            </label>

            <label className="toggle-card">
              <input
                type="checkbox"
                checked={formatMonetaryThousands}
                onChange={(event) => setFormatMonetaryThousands(event.target.checked)}
                disabled={isTranscribing}
              />
              <span>
                <strong>Valores monetários no formato “mil”</strong>
                <small>Ex.: ₲200.000 / 200 mil guaraníes → 200 mil. Outros números não são alterados.</small>
              </span>
            </label>
          </div>

          <div className="engine-line">
            <span>{health.message}</span>
            <button className="ghost" onClick={checkRuntime} disabled={isTranscribing}>Reverificar runtime</button>
          </div>
        </article>

        <article className="card result">
          <div className="result-header">
            <div>
              <span className="label">3 · Preview das captions</span>
              <h2>{transcription.message}</h2>
            </div>
            <div className="result-actions">
              <button
                className={transcription.status === 'success' ? 'secondary' : undefined}
                onClick={runTranscription}
                disabled={!filePath || isTranscribing || runtime.status !== 'ready'}
              >
                {isTranscribing
                  ? 'Transcrevendo…'
                  : transcription.status === 'success'
                    ? 'Transcrever novamente'
                    : transcription.status === 'error'
                      ? 'Tentar novamente'
                      : 'Transcrever agora'}
              </button>
              {transcription.status === 'loading' && (
                <button
                  className="secondary cancel-button"
                  onClick={cancelTranscription}
                  disabled={transcription.cancelling}
                >
                  {transcription.cancelling ? 'Cancelando…' : 'Cancelar'}
                </button>
              )}
              {transcription.status === 'success' && (
                <button
                  onClick={exportSrt}
                  disabled={exportState.status === 'loading'}
                >
                  {exportState.status === 'loading' ? 'Exportando…' : 'Exportar SRT'}
                </button>
              )}
            </div>
          </div>

          {transcription.status === 'loading' && (
            <div className="transcription-progress" aria-live="polite">
              <div className="progress-meta">
                <strong>{transcription.message}</strong>
                {transcription.progress !== null && (
                  <span>{Math.round(transcription.progress * 100)}%</span>
                )}
              </div>
              <div className={`progress-track ${transcription.progress === null ? 'indeterminate' : ''}`}>
                <div
                  className="progress-fill"
                  style={transcription.progress === null
                    ? undefined
                    : { width: `${Math.round(transcription.progress * 100)}%` }}
                />
              </div>
              <small>
                {transcription.progress === null
                  ? 'O carregamento do modelo não possui percentual artificial; o progresso numérico começa com a inferência.'
                  : 'Percentual calculado pela posição temporal já processada no áudio.'}
              </small>
            </div>
          )}

          {transcription.status === 'error' && (
            <div className="transcription-error" role="alert">
              <strong>A transcrição não foi concluída.</strong>
              <span>{transcription.message}</span>
              <small>O arquivo e todas as configurações foram preservados. Use “Tentar novamente” ou reverifique o runtime.</small>
            </div>
          )}

          {transcription.status === 'success' && (
            <>
              <div className={`export-status ${exportState.status}`}>
                <strong>{exportState.message}</strong>
                {exportState.status === 'success' && <small>{exportState.path}</small>}
              </div>

              <div className="preview-heading">
                <strong>Todas as captions</strong>
                <small>{transcription.captions.length} itens</small>
              </div>
              <div className="caption-preview">
                {transcription.captions.map((caption, index) => (
                  <div className="caption-row" key={`${caption.start}-${index}`}>
                    <span className="caption-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{caption.text}</strong>
                    <small>{caption.start.toFixed(2)} → {caption.end.toFixed(2)}</small>
                  </div>
                ))}
              </div>
              <details className="raw-words">
                <summary>Ver amostra de palavras e timestamps brutos</summary>
                <div className="word-preview">
                  {transcription.words.map((word, index) => (
                    <span className="word-chip" key={`${word.start}-${index}`}>
                      <strong>{word.text}</strong>
                      <small>{word.start.toFixed(2)} → {word.end.toFixed(2)}</small>
                    </span>
                  ))}
                </div>
              </details>
            </>
          )}
        </article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
