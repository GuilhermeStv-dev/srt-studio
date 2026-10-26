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
import '@fontsource-variable/inter'
import '@fontsource/geist-mono/400.css'
import './style.css'

// Acento da marca SRTX (o restante da interface é monocromático).
const BRAND_ACCENT = '#6C3BFF'

type HealthState =
  | { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

type RuntimeState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'missing'; message: string }

type Caption = { text: string; start: number; end: number }

type Word = { text: string; start: number; end: number; probability?: number | null }

type SegmentationSettings = {
  target_words: number
  ignore_prepositions: boolean
  preserve_commas_periods: boolean
  monetary_thousands: boolean
}

type TranscriptionState =
  | { status: 'idle'; message: string }
  | {
      status: 'loading'
      message: string
      stage: string
      progress: number | null
      cancelling: boolean
    }
  | {
      status: 'success'
      message: string
      summary: string
      words: Word[]
      captions: Caption[]
      segmentation: SegmentationSettings
      captionsEdited: boolean
    }
  | { status: 'error'; message: string }

type SegmentState =
  | { status: 'idle' | 'loading'; message: string }
  | { status: 'error'; message: string }

type ExportState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; path: string }
  | { status: 'error'; message: string }

type HelpTopic = 'prepositions' | 'punctuation' | 'money' | 'visual-limit'

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

function resultMessage(captionCount: number, wordCount: number, summary: string): string {
  return `${captionCount} captions · ${wordCount} palavras · ${summary}`
}

function sameSegmentation(left: SegmentationSettings, right: SegmentationSettings): boolean {
  return left.target_words === right.target_words &&
    left.ignore_prepositions === right.ignore_prepositions &&
    left.preserve_commas_periods === right.preserve_commas_periods &&
    left.monetary_thousands === right.monetary_thousands
}

function captionCharacterCount(text: string): number {
  return Array.from(text).length
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function closestSplitOffset(text: string, requestedOffset: number): number | null {
  const safeOffset = clamp(requestedOffset, 1, text.length - 1)
  const before = text.slice(0, safeOffset).search(/\s+\S*$/)
  const after = text.slice(safeOffset).search(/\s/)

  const candidates = [
    before >= 0 ? before : null,
    after >= 0 ? safeOffset + after : null
  ].filter((candidate): candidate is number => candidate !== null)

  if (candidates.length === 0) return safeOffset
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate - safeOffset) < Math.abs(best - safeOffset) ? candidate : best
  ))
}

function splitCaption(caption: Caption, requestedOffset: number): [Caption, Caption] | null {
  const offset = closestSplitOffset(caption.text, requestedOffset)
  if (offset === null) return null

  const leftText = caption.text.slice(0, offset).trim()
  const rightText = caption.text.slice(offset).trim()
  if (!leftText || !rightText) return null

  const duration = caption.end - caption.start
  if (duration < 0.12) return null

  const ratio = clamp(
    captionCharacterCount(leftText) / Math.max(1, captionCharacterCount(leftText) + captionCharacterCount(rightText)),
    0.18,
    0.82
  )
  const splitTime = roundTime(clamp(
    caption.start + duration * ratio,
    caption.start + 0.05,
    caption.end - 0.05
  ))

  if (splitTime <= caption.start || splitTime >= caption.end) return null

  return [
    { text: leftText, start: caption.start, end: splitTime },
    { text: rightText, start: splitTime, end: caption.end }
  ]
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

function fitTextarea(element: HTMLTextAreaElement | null): void {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000
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
  const [segmentState, setSegmentState] = useState<SegmentState>({ status: 'idle', message: '' })
  const [openHelp, setOpenHelp] = useState<HelpTopic | null>(null)
  const captionInputRefs = useRef<Array<HTMLTextAreaElement | null>>([])

  const selectedName = useMemo(() => fileName(filePath), [filePath])
  const isTranscribing = transcription.status === 'loading'
  const isSegmenting = segmentState.status === 'loading'
  const currentSegmentation = useMemo<SegmentationSettings>(() => ({
    target_words: targetWords,
    ignore_prepositions: ignorePrepositions,
    preserve_commas_periods: preserveCommasPeriods,
    monetary_thousands: formatMonetaryThousands
  }), [targetWords, ignorePrepositions, preserveCommasPeriods, formatMonetaryThousands])
  const segmentationChanged = transcription.status === 'success' &&
    !sameSegmentation(transcription.segmentation, currentSegmentation)
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
      const summary = `${result.language} · ${result.device.toUpperCase()}${fallbackLabel} · ${result.duration.toFixed(1)}s`
      setSegmentState({ status: 'idle', message: '' })
      setTranscription({
        status: 'success',
        message: resultMessage(result.captions.length, result.words.length, summary),
        summary,
        words: result.words,
        captions: result.captions,
        segmentation: result.segmentation,
        captionsEdited: false
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

  async function regenerateCaptions() {
    if (transcription.status !== 'success' || isSegmenting) return
    if (
      transcription.captionsEdited &&
      !window.confirm('Regerar as legendas descarta as edições manuais feitas no preview. Continuar?')
    ) {
      return
    }

    const { words, summary } = transcription
    const segmentation = currentSegmentation
    setSegmentState({ status: 'loading', message: 'Gerando legendas com as opções atuais…' })
    try {
      const result = await window.srtStudio.segment({ words, segmentation })
      setTranscription((current) => {
        if (current.status !== 'success' || current.words !== words) return current
        return {
          ...current,
          message: resultMessage(result.captions.length, words.length, summary),
          captions: result.captions,
          segmentation: result.segmentation,
          captionsEdited: false
        }
      })
      setSegmentState({ status: 'idle', message: '' })
      setExportState({
        status: 'idle',
        message: 'Legendas regeradas sem retranscrever. Escolha onde salvar o SRT.'
      })
    } catch (error) {
      setSegmentState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar legendas'
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

  function replaceCaptions(updater: (captions: Caption[]) => Caption[]) {
    setTranscription((current) => {
      if (current.status !== 'success') return current
      const captions = updater(current.captions)
      return { ...current, captions, captionsEdited: true }
    })
    setExportState({
      status: 'idle',
      message: 'Edição manual aplicada. Exporte novamente quando estiver satisfeito.'
    })
  }

  function updateCaptionText(index: number, text: string) {
    replaceCaptions((captions) => captions.map((caption, currentIndex) => (
      currentIndex === index ? { ...caption, text } : caption
    )))
  }

  function removeCaption(index: number) {
    replaceCaptions((captions) => captions.filter((_, currentIndex) => currentIndex !== index))
  }

  function splitCaptionAt(index: number, offset: number) {
    let didSplit = false
    replaceCaptions((captions) => {
      const caption = captions[index]
      if (!caption) return captions
      const split = splitCaption(caption, offset)
      if (!split) return captions
      didSplit = true
      return [
        ...captions.slice(0, index),
        split[0],
        split[1],
        ...captions.slice(index + 1)
      ]
    })

    if (didSplit) {
      window.setTimeout(() => captionInputRefs.current[index + 1]?.focus(), 0)
    }
  }

  function handleCaptionKeyDown(index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      splitCaptionAt(index, target.selectionStart)
      return
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && target.value.trim() === '') {
      event.preventDefault()
      removeCaption(index)
    }
  }

  function toggleHelp(topic: HelpTopic) {
    setOpenHelp((current) => current === topic ? null : topic)
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

  useEffect(() => {
    if (!openHelp) return undefined

    const closeHelp = () => setOpenHelp(null)
    const closeHelpOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHelp()
    }

    window.addEventListener('mousedown', closeHelp)
    window.addEventListener('keydown', closeHelpOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeHelp)
      window.removeEventListener('keydown', closeHelpOnEscape)
    }
  }, [openHelp])

  const hasCaptions = transcription.status === 'success'
  const steps = [
    { label: 'Arquivo', state: filePath ? 'done' : 'current', hint: filePath ? 'ok' : '' },
    {
      label: 'Transcrição',
      state: hasCaptions ? 'done' : filePath ? 'current' : 'pending',
      hint: isTranscribing ? '…' : hasCaptions ? 'ok' : ''
    },
    { label: 'Legendas', state: hasCaptions ? 'current' : 'pending', hint: '' }
  ] as const
  const topbarTitle = filePath ? selectedName : 'Nova transcrição'
  const topbarSubtitle = transcription.status === 'success' || transcription.status === 'loading'
    ? transcription.message
    : filePath || 'Áudio ou vídeo local · o arquivo original nunca é modificado'

  function renderHelp(topic: HelpTopic, label: string, text: string) {
    return (
      <>
        <button
          className="help-button"
          type="button"
          aria-label={label}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => toggleHelp(topic)}
        >
          ?
        </button>
        {openHelp === topic && (
          <div
            className="setting-popover"
            role="dialog"
            aria-label={label}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {text}
          </div>
        )}
      </>
    )
  }

  function renderToggle(checked: boolean, onToggle: () => void, label: string) {
    return (
      <button
        className="toggle"
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onToggle}
        disabled={isTranscribing}
      >
        <span aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" style={{ background: BRAND_ACCENT }} aria-hidden="true">SX</span>
          <span className="brand-name">SRTX</span>
          <span className="brand-tag">beta</span>
        </div>

        <nav className="nav-section" aria-label="Etapas">
          <p className="nav-title">Fluxo</p>
          {steps.map((step, index) => (
            <div className={`nav-step ${step.state}`} key={step.label} aria-current={step.state === 'current' ? 'step' : undefined}>
              <span className="step-index">{step.state === 'done' ? '✓' : index + 1}</span>
              <span>{step.label}</span>
              {step.hint && <small>{step.hint}</small>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="runtime-line">
            <span className={`status-dot ${runtime.status}`} aria-hidden="true" />
            <span>{runtime.message}</span>
          </div>
          <span className="engine-version">{health.message}</span>
          <button className="btn ghost small" onClick={checkRuntime} disabled={isTranscribing}>Reverificar runtime</button>
          <span className="signature">Guilherme Estevão Editor</span>
        </div>
      </aside>

      <main
        className={`main ${isDragging ? 'dragging' : ''}`}
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

        <header className="topbar">
          <div className="topbar-title">
            <h1>{topbarTitle}</h1>
            <p>{topbarSubtitle}</p>
          </div>
          <div className="topbar-actions">
            {segmentationChanged && (
              <button className="btn secondary" onClick={regenerateCaptions} disabled={isSegmenting}>
                {isSegmenting ? 'Gerando legendas…' : 'Regerar legendas'}
              </button>
            )}
            {transcription.status === 'loading' && (
              <button className="btn secondary" onClick={cancelTranscription} disabled={transcription.cancelling}>
                {transcription.cancelling ? 'Cancelando…' : 'Cancelar'}
              </button>
            )}
            {filePath && (
              <button
                className={`btn ${hasCaptions ? 'secondary' : ''}`}
                onClick={runTranscription}
                disabled={isTranscribing || isSegmenting || runtime.status !== 'ready'}
              >
                {isTranscribing
                  ? 'Transcrevendo…'
                  : hasCaptions
                    ? 'Transcrever novamente'
                    : transcription.status === 'error'
                      ? 'Tentar novamente'
                      : 'Transcrever'}
              </button>
            )}
            {hasCaptions && (
              <button
                className="btn"
                onClick={exportSrt}
                disabled={
                  exportState.status === 'loading' ||
                  isSegmenting ||
                  transcription.captions.length === 0 ||
                  transcription.captions.some((caption) => !caption.text.trim())
                }
              >
                {exportState.status === 'loading' ? 'Exportando…' : 'Exportar SRT'}
              </button>
            )}
          </div>
        </header>

        <div className="content">
          <section className="canvas">
            {!filePath && (
              <div className={`dropzone ${isDragging ? 'dragging' : ''}`}>
                <span className="dropzone-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" />
                  </svg>
                </span>
                <h2>Arraste um áudio ou vídeo</h2>
                <p>Transcrição local com faster-whisper e legendas prontas para o Premiere. Nada sai do seu computador.</p>
                <button className="btn" onClick={selectMedia} disabled={isTranscribing}>Selecionar arquivo</button>
                <small>MP3 · WAV · M4A · FLAC · MP4 · MOV · MKV · WEBM</small>
                {sourceMessage && <span className="source-error">{sourceMessage}</span>}
              </div>
            )}

            {filePath && (
              <div className="panel file-card">
                <span className="file-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </span>
                <div className="file-meta">
                  <strong>{selectedName}</strong>
                  <small>{filePath}</small>
                  {sourceMessage && <span className="source-error">{sourceMessage}</span>}
                </div>
                <button className="btn secondary small" onClick={selectMedia} disabled={isTranscribing}>Trocar arquivo</button>
              </div>
            )}

            {filePath && transcription.status === 'idle' && (
              <div className="panel empty-state">
                <h2>Pronto para transcrever</h2>
                <p>{transcription.message}</p>
                <p>Ajuste modelo, idioma e legendas no painel à direita e clique em <strong>Transcrever</strong>.</p>
              </div>
            )}

            {transcription.status === 'loading' && (
              <div className="panel progress-card" aria-live="polite">
                <div className="progress-meta">
                  <strong>{transcription.message}</strong>
                  {transcription.progress !== null && <span>{Math.round(transcription.progress * 100)}%</span>}
                </div>
                <div className={`progress-track ${transcription.progress === null ? 'indeterminate' : ''}`}>
                  <div
                    className="progress-fill"
                    style={transcription.progress === null ? undefined : { width: `${Math.round(transcription.progress * 100)}%` }}
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
              <div className="notice error" role="alert">
                <strong>A transcrição não foi concluída.</strong>
                <small>{transcription.message}</small>
                <small>O arquivo e todas as configurações foram preservados. Use “Tentar novamente” ou reverifique o runtime.</small>
              </div>
            )}

            {transcription.status === 'success' && (
              <>
                <div className={`notice ${exportState.status === 'success' ? 'success' : exportState.status === 'error' ? 'error' : ''}`}>
                  <strong>{exportState.message}</strong>
                  {exportState.status === 'success' && <small>{exportState.path}</small>}
                </div>

                {segmentationChanged && segmentState.status !== 'error' && (
                  <div className="notice accent" aria-live="polite">
                    <strong>
                      {isSegmenting
                        ? segmentState.message
                        : 'As opções de legenda mudaram. Use “Regerar legendas” para aplicá-las sem transcrever de novo.'}
                    </strong>
                    {transcription.captionsEdited && !isSegmenting && (
                      <small>Regerar descarta as edições manuais feitas abaixo; o app pede confirmação.</small>
                    )}
                  </div>
                )}

                {segmentState.status === 'error' && segmentationChanged && (
                  <div className="notice error" role="alert">
                    <strong>As legendas não foram regeradas.</strong>
                    <small>{segmentState.message}</small>
                  </div>
                )}

                <div className="editor-heading">
                  <h2>Legendas · {transcription.captions.length}</h2>
                  <small>Enter divide · vazio + Backspace remove · clique no texto para editar</small>
                </div>

                <div className="panel caption-list">
                  {transcription.captions.map((caption, index) => {
                    const count = captionCharacterCount(caption.text)
                    const over = count > 17 && /\s/.test(caption.text.trim())
                    return (
                      <div className="caption-row" key={`${caption.start}-${index}`}>
                        <span className="caption-time">{formatTime(caption.start)} → {formatTime(caption.end)}</span>
                        <textarea
                          ref={(element) => {
                            captionInputRefs.current[index] = element
                            fitTextarea(element)
                          }}
                          value={caption.text}
                          rows={1}
                          spellCheck={false}
                          aria-label={`Editar caption ${index + 1}`}
                          onChange={(event) => {
                            fitTextarea(event.target)
                            updateCaptionText(index, event.target.value)
                          }}
                          onKeyDown={(event) => handleCaptionKeyDown(index, event)}
                        />
                        <div className="caption-side">
                          <div className="caption-actions">
                            <button
                              className="btn ghost small"
                              type="button"
                              title="Dividir no meio do texto"
                              onClick={() => splitCaptionAt(index, Math.floor(caption.text.length / 2))}
                            >
                              Dividir
                            </button>
                            <button
                              className="btn ghost small danger"
                              type="button"
                              title="Excluir este segmento"
                              onClick={() => removeCaption(index)}
                            >
                              Excluir
                            </button>
                          </div>
                          <span className={`char-count ${over ? 'over' : ''}`} title="Caracteres nesta legenda">{count}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <details className="panel raw-words">
                  <summary>Ver amostra de palavras e timestamps brutos</summary>
                  <div className="word-preview">
                    {transcription.words.slice(0, 24).map((word, index) => (
                      <span className="word-chip" key={`${word.start}-${index}`}>
                        <strong>{word.text}</strong>
                        <small>{word.start.toFixed(2)} → {word.end.toFixed(2)}</small>
                      </span>
                    ))}
                  </div>
                </details>
              </>
            )}
          </section>

          <aside className="inspector" aria-label="Configurações">
            <section className="inspector-section">
              <h3>Preset</h3>
              <label className="field">
                <select value={activePresetId} onChange={(event) => applyPreset(event.target.value)} disabled={isTranscribing} aria-label="Preset">
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
                <button className="btn ghost small" onClick={saveCurrentPreset} disabled={isTranscribing}>Salvar atual</button>
                {activeCustomPreset && (
                  <button className="btn ghost small danger" onClick={deleteActivePreset} disabled={isTranscribing}>Excluir preset</button>
                )}
              </div>
              {presetMessage && <small className="preset-message">{presetMessage}</small>}
            </section>

            <section className="inspector-section">
              <h3>Transcrição</h3>
              <label className="field">
                Modelo Whisper
                <select value={model} onChange={(event) => setModel(event.target.value)} disabled={isTranscribing}>
                  <option value="large-v3">Large v3 · precisão</option>
                  <option value="medium">Medium · equilíbrio</option>
                  <option value="small">Small · mais rápido</option>
                </select>
              </label>
              <label className="field">
                Idioma
                <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={isTranscribing}>
                  <option value="es">Español / ES-PY</option>
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                  <option value="auto">Detectar</option>
                </select>
              </label>
            </section>

            <section className="inspector-section">
              <h3>Legendas</h3>
              <div className="field">
                Palavras por legenda
                <div className="segmented" role="group" aria-label="Palavras por legenda">
                  {[1, 2, 3, 4].map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={targetWords === value}
                      onClick={() => setTargetWords(value)}
                      disabled={isTranscribing}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <span className="segmented-hint">
                  {targetWords === 1 ? 'Muito dinâmica' : targetWords === 2 ? 'Padrão' : targetWords === 3 ? 'Mais texto por tela' : 'Leitura longa'}
                </span>
              </div>

              <div className="panel setting-list">
                <div className="setting-row">
                  <span>Ignorar preposições</span>
                  {renderHelp('prepositions', 'Explicar preposições', 'Preposições como “a”, “en”, “de” e “para” podem acompanhar a palavra vizinha sem contar como uma palavra extra. A pausa real e o limite de 17 caracteres continuam mandando.')}
                  {renderToggle(ignorePrepositions, () => setIgnorePrepositions((current) => !current), 'Ignorar preposições')}
                </div>
                <div className="setting-row">
                  <span>Manter vírgulas e pontos</span>
                  {renderHelp('punctuation', 'Explicar pontuação', 'Controla só vírgulas e pontos nas bordas. Interrogação, exclamação e sinais espanhóis como “¿” e “¡” são sempre preservados.')}
                  {renderToggle(preserveCommasPeriods, () => setPreserveCommasPeriods((current) => !current), 'Manter vírgulas e pontos')}
                </div>
                <div className="setting-row">
                  <span>Moeda em formato “mil”</span>
                  {renderHelp('money', 'Explicar valores monetários', 'Quando reconhecer dinheiro em guaraníes, o app pode padronizar como “200 mil”. Números comuns de contagem não são tratados como moeda.')}
                  {renderToggle(formatMonetaryThousands, () => setFormatMonetaryThousands((current) => !current), 'Moeda em formato mil')}
                </div>
                <div className="setting-row">
                  <span>Trava visual · 17 caracteres</span>
                  {renderHelp('visual-limit', 'Explicar trava visual', 'Se uma legenda tiver mais de uma palavra e passar de 17 caracteres contando espaços, o engine separa. Palavra única longa continua inteira.')}
                  <span className="static-pill">ativa</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
