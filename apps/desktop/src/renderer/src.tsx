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

type TextSegment = { text: string; start: number; end: number }

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
      language: string
    }
  | { status: 'error'; message: string }

// Etapa 2 de D-019: sincronização por alinhamento forçado + segmentação.
type CaptionJobState =
  | { status: 'idle' }
  | {
      status: 'loading'
      message: string
      stage: string
      progress: number | null
      cancelling: boolean
    }
  | { status: 'error'; message: string }

type CaptionsState = {
  words: Word[]
  captions: Caption[]
  segmentation: SegmentationSettings
  captionsEdited: boolean
  // Versão do texto usada para gerar estas legendas; se o texto mudar, elas ficam desatualizadas.
  textVersion: number
}

type View = 'text' | 'captions'

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
  if (stage === 'loading_aligner') return 'Carregando modelo de sincronização…'
  if (stage === 'aligning') {
    return progress === null
      ? 'Sincronizando cada palavra com o áudio…'
      : `Sincronizando cada palavra com o áudio… ${Math.round(progress * 100)}%`
  }
  if (stage === 'completed') return 'Finalizando resultado…'
  return 'Transcrevendo…'
}

function resultMessage(captionCount: number, wordCount: number, summary: string): string {
  return `${captionCount} captions · ${wordCount} palavras · ${summary}`
}

function countWords(segments: TextSegment[]): number {
  return segments.reduce((total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length, 0)
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

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
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
  const [textSegments, setTextSegments] = useState<TextSegment[]>([])
  const [textVersion, setTextVersion] = useState(0)
  const [captionJob, setCaptionJob] = useState<CaptionJobState>({ status: 'idle' })
  const [captionsData, setCaptionsData] = useState<CaptionsState | null>(null)
  const [view, setView] = useState<View>('text')
  const [openHelp, setOpenHelp] = useState<HelpTopic | null>(null)
  const captionInputRefs = useRef<Array<HTMLTextAreaElement | null>>([])
  const textInputRefs = useRef<Array<HTMLTextAreaElement | null>>([])

  const selectedName = useMemo(() => fileName(filePath), [filePath])
  const isTranscribing = transcription.status === 'loading'
  const isSegmenting = segmentState.status === 'loading'
  const isCaptioning = captionJob.status === 'loading'
  const isBusy = isTranscribing || isCaptioning || isSegmenting
  const textChanged = captionsData !== null && captionsData.textVersion !== textVersion
  const currentSegmentation = useMemo<SegmentationSettings>(() => ({
    target_words: targetWords,
    ignore_prepositions: ignorePrepositions,
    preserve_commas_periods: preserveCommasPeriods,
    monetary_thousands: formatMonetaryThousands
  }), [targetWords, ignorePrepositions, preserveCommasPeriods, formatMonetaryThousands])
  const segmentationChanged = captionsData !== null &&
    !sameSegmentation(captionsData.segmentation, currentSegmentation)
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
    if (isBusy || presetId === 'custom') return
    const preset = allPresets.find((item) => item.id === presetId)
    if (!preset) return
    applySettings(preset)
    setPresetMessage(`Preset aplicado: ${preset.name}`)
  }

  function saveCurrentPreset() {
    if (isBusy) return
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
    if (isBusy || !activeCustomPreset) return
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
    setTextSegments([])
    setCaptionsData(null)
    setCaptionJob({ status: 'idle' })
    setView('text')
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
    if (isBusy) return
    const result = await window.srtStudio.selectMedia()
    if (!result.canceled && result.filePath) {
      applySourceFile(result.filePath)
    }
  }

  function handleDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (isBusy || !event.dataTransfer.types.includes('Files')) return
    dragDepth.current += 1
    setIsDragging(true)
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    if (isBusy || !event.dataTransfer.types.includes('Files')) return
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

    if (isBusy) {
      setSourceMessage('Cancele o processamento atual antes de trocar o arquivo.')
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
    if (
      (textVersion > 0 || captionsData) &&
      !window.confirm('Transcrever de novo substitui o texto revisado e as legendas atuais. Continuar?')
    ) {
      return
    }

    setExportState({ status: 'idle', message: 'Aguardando a nova transcrição.' })
    setCaptionJob({ status: 'idle' })
    setTranscription({
      status: 'loading',
      message: 'Preparando runtime de transcrição…',
      stage: 'preparing',
      progress: null,
      cancelling: false
    })

    try {
      const result = await window.srtStudio.transcribeText({
        filePath,
        model,
        language: language === 'auto' ? null : language
      })

      if (!result.ok) {
        setTranscription({
          status: 'idle',
          message: 'Transcrição cancelada. Nenhum texto novo foi aplicado.'
        })
        return
      }

      const summary = `${result.language.toUpperCase()} · ${formatDuration(result.duration)}`
      setSegmentState({ status: 'idle', message: '' })
      setTextSegments(result.segments)
      setTextVersion(0)
      setCaptionsData(null)
      setView('text')
      setTranscription({
        status: 'success',
        message: `${countWords(result.segments)} palavras · ${summary}`,
        summary,
        language: result.language
      })
      setExportState({
        status: 'idle',
        message: 'Revise o texto e clique em “Gerar legendas”.'
      })
    } catch (error) {
      setTranscription({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao transcrever'
      })
    }
  }

  function updateSegmentText(index: number, text: string) {
    setTextSegments((current) => current.map((segment, currentIndex) => (
      currentIndex === index ? { ...segment, text } : segment
    )))
    setTextVersion((current) => current + 1)
  }

  // Cada parágrafo vira fronteira obrigatória de legenda (D-020): Enter separa
  // falas que o Whisper juntou; Backspace no início junta com o anterior.
  function splitSegment(index: number, offset: number) {
    const segment = textSegments[index]
    if (!segment) return
    const left = segment.text.slice(0, offset).trim()
    const right = segment.text.slice(offset).trim()
    if (!left || !right) return
    setTextSegments((current) => [
      ...current.slice(0, index),
      { ...segment, text: left },
      { ...segment, text: right },
      ...current.slice(index + 1)
    ])
    setTextVersion((current) => current + 1)
    window.setTimeout(() => {
      const next = textInputRefs.current[index + 1]
      next?.focus()
      next?.setSelectionRange(0, 0)
    }, 0)
  }

  function mergeWithPrevious(index: number) {
    if (index === 0) return
    const previous = textSegments[index - 1]
    const segment = textSegments[index]
    if (!previous || !segment) return
    const joinAt = previous.text.trimEnd().length
    setTextSegments((current) => [
      ...current.slice(0, index - 1),
      {
        text: `${previous.text.trimEnd()} ${segment.text.trimStart()}`.trim(),
        start: Math.min(previous.start, segment.start),
        end: Math.max(previous.end, segment.end)
      },
      ...current.slice(index + 1)
    ])
    setTextVersion((current) => current + 1)
    window.setTimeout(() => {
      const target = textInputRefs.current[index - 1]
      target?.focus()
      target?.setSelectionRange(joinAt, joinAt)
    }, 0)
  }

  function handleTextKeyDown(index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      splitSegment(index, target.selectionStart)
      return
    }
    if (event.key === 'Backspace' && target.selectionStart === 0 && target.selectionEnd === 0 && index > 0) {
      event.preventDefault()
      mergeWithPrevious(index)
    }
  }

  async function generateCaptions() {
    if (!filePath || transcription.status !== 'success' || isBusy) return
    if (
      captionsData?.captionsEdited &&
      !window.confirm('Gerar as legendas de novo descarta as edições manuais feitas nas legendas. Continuar?')
    ) {
      return
    }

    const segments = textSegments.filter((segment) => segment.text.trim())
    if (segments.length === 0) {
      setCaptionJob({ status: 'error', message: 'O texto está vazio; não há o que legendar.' })
      return
    }

    const versionUsed = textVersion
    const segmentation = currentSegmentation
    setCaptionJob({
      status: 'loading',
      message: 'Carregando modelo de sincronização…',
      stage: 'loading_aligner',
      progress: null,
      cancelling: false
    })

    try {
      const result = await window.srtStudio.caption({
        filePath,
        language: transcription.language,
        segments,
        segmentation
      })

      if (!result.ok) {
        setCaptionJob({ status: 'idle' })
        return
      }

      setCaptionJob({ status: 'idle' })
      setSegmentState({ status: 'idle', message: '' })
      setCaptionsData({
        words: result.words,
        captions: result.captions,
        segmentation: result.segmentation,
        captionsEdited: false,
        textVersion: versionUsed
      })
      setView('captions')
      setExportState({
        status: 'idle',
        message: 'Legendas sincronizadas com o áudio. Escolha onde salvar o SRT.'
      })
    } catch (error) {
      setCaptionJob({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar legendas'
      })
    }
  }

  async function regenerateCaptions() {
    if (!captionsData || isBusy) return
    if (
      captionsData.captionsEdited &&
      !window.confirm('Regerar as legendas descarta as edições manuais feitas no preview. Continuar?')
    ) {
      return
    }

    const { words } = captionsData
    const segmentation = currentSegmentation
    setSegmentState({ status: 'loading', message: 'Gerando legendas com as opções atuais…' })
    try {
      const result = await window.srtStudio.segment({ words, segmentation })
      setCaptionsData((current) => {
        if (!current || current.words !== words) return current
        return {
          ...current,
          captions: result.captions,
          segmentation: result.segmentation,
          captionsEdited: false
        }
      })
      setSegmentState({ status: 'idle', message: '' })
      setExportState({
        status: 'idle',
        message: 'Legendas regeradas sem sincronizar de novo. Escolha onde salvar o SRT.'
      })
    } catch (error) {
      setSegmentState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao gerar legendas'
      })
    }
  }

  async function cancelTranscription() {
    setCaptionJob((current) => {
      if (current.status !== 'loading') return current
      return { ...current, cancelling: true, message: 'Cancelando sincronização…' }
    })
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
    if (!filePath || !captionsData) return

    setExportState({ status: 'loading', message: 'Validando e preparando o SRT…' })
    try {
      const result = await window.srtStudio.exportSrt({
        sourceFilePath: filePath,
        captions: captionsData.captions
      })
      if (result.canceled) {
        setExportState({ status: 'idle', message: 'Exportação cancelada. Nenhum arquivo foi alterado.' })
        return
      }
      setExportState({
        status: 'success',
        path: result.path,
        message: `SRT salvo · ${result.cue_count} legendas`
      })
    } catch (error) {
      setExportState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao exportar o SRT'
      })
    }
  }

  function replaceCaptions(updater: (captions: Caption[]) => Caption[]) {
    setCaptionsData((current) => {
      if (!current) return current
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

    const unsubscribeCaptionProgress = window.srtStudio.onCaptionProgress(({ stage, progress }) => {
      setCaptionJob((current) => {
        if (current.status !== 'loading' || current.cancelling) return current
        return { ...current, stage, progress, message: progressMessage(stage, progress) }
      })
    })

    const preventNativeFileOpen = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventNativeFileOpen)
    window.addEventListener('drop', preventNativeFileOpen)
    return () => {
      unsubscribeProgress()
      unsubscribeCaptionProgress()
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

  const hasText = transcription.status === 'success'
  const hasCaptions = captionsData !== null
  const captionsReady = hasCaptions && !textChanged
  const steps = [
    { label: 'Arquivo', state: filePath ? 'done' : 'current', hint: filePath ? 'ok' : '' },
    {
      label: 'Texto',
      state: hasText ? 'done' : filePath ? 'current' : 'pending',
      hint: isTranscribing ? '…' : hasText ? 'ok' : ''
    },
    {
      label: 'Legendas',
      state: captionsReady ? 'done' : hasText ? 'current' : 'pending',
      hint: isCaptioning ? '…' : captionsReady ? 'ok' : ''
    }
  ] as const
  const topbarTitle = filePath ? selectedName : 'Nova transcrição'
  const topbarSubtitle = transcription.status === 'success' ? transcription.summary : ''

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
        disabled={isBusy}
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
              {step.hint === '…' && <small>…</small>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {runtime.status === 'missing' && (
            <>
              <div className="runtime-line">
                <span className="status-dot missing" aria-hidden="true" />
                <span>{runtime.message}</span>
              </div>
              <button className="btn ghost small" onClick={checkRuntime} disabled={isBusy}>Verificar de novo</button>
            </>
          )}
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
            <div className="topbar-heading">
              <h1 title={filePath ?? undefined}>{topbarTitle}</h1>
              {filePath && (
                <button className="link-button" onClick={selectMedia} disabled={isBusy}>Trocar</button>
              )}
            </div>
            {topbarSubtitle && <p>{topbarSubtitle}</p>}
          </div>
          <div className="topbar-actions">
            {(transcription.status === 'loading' || captionJob.status === 'loading') && (
              <button
                className="btn secondary"
                onClick={cancelTranscription}
                disabled={transcription.status === 'loading' ? transcription.cancelling : captionJob.status === 'loading' && captionJob.cancelling}
              >
                {(transcription.status === 'loading' && transcription.cancelling) ||
                (captionJob.status === 'loading' && captionJob.cancelling)
                  ? 'Cancelando…'
                  : 'Cancelar'}
              </button>
            )}
            {filePath && (
              <button
                className={`btn ${hasText ? 'ghost' : ''}`}
                onClick={runTranscription}
                disabled={isBusy || runtime.status !== 'ready'}
              >
                {isTranscribing
                  ? 'Transcrevendo…'
                  : hasText
                    ? 'Transcrever novamente'
                    : transcription.status === 'error'
                      ? 'Tentar novamente'
                      : 'Transcrever'}
              </button>
            )}
            {hasText && (!hasCaptions || textChanged) && (
              <button className="btn" onClick={generateCaptions} disabled={isBusy}>
                {isCaptioning ? 'Gerando legendas…' : hasCaptions ? 'Gerar legendas novamente' : 'Gerar legendas'}
              </button>
            )}
            {captionsReady && segmentationChanged && (
              <button className="btn secondary" onClick={regenerateCaptions} disabled={isBusy}>
                {isSegmenting ? 'Gerando legendas…' : 'Regerar legendas'}
              </button>
            )}
            {hasCaptions && (
              <button
                className={`btn ${textChanged ? 'secondary' : ''}`}
                onClick={exportSrt}
                disabled={
                  exportState.status === 'loading' ||
                  isBusy ||
                  captionsData.captions.length === 0 ||
                  captionsData.captions.some((caption) => !caption.text.trim())
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
                <p>Tudo roda no seu computador.</p>
                <button className="btn" onClick={selectMedia} disabled={isBusy}>Selecionar arquivo</button>
                <small>MP3 · WAV · M4A · FLAC · MP4 · MOV · MKV · WEBM</small>
                {sourceMessage && <span className="source-error">{sourceMessage}</span>}
              </div>
            )}

            {filePath && sourceMessage && <span className="source-error">{sourceMessage}</span>}

            {filePath && transcription.status === 'idle' && (
              <div className="panel empty-state">
                <h2>Pronto para transcrever</h2>
                <p>Primeiro o texto, depois as legendas sincronizadas com o áudio.</p>
              </div>
            )}

            {(transcription.status === 'loading' || captionJob.status === 'loading') && (() => {
              const job = transcription.status === 'loading' ? transcription : captionJob.status === 'loading' ? captionJob : null
              if (!job) return null
              return (
                <div className="panel progress-card" aria-live="polite">
                  <div className="progress-meta">
                    <strong>{job.message}</strong>
                    {job.progress !== null && <span>{Math.round(job.progress * 100)}%</span>}
                  </div>
                  <div className={`progress-track ${job.progress === null ? 'indeterminate' : ''}`}>
                    <div
                      className="progress-fill"
                      style={job.progress === null ? undefined : { width: `${Math.round(job.progress * 100)}%` }}
                    />
                  </div>
                  {job.stage === 'loading_aligner' && (
                    <small>Na primeira vez o modelo de sincronização (~350 MB) é baixado.</small>
                  )}
                </div>
              )
            })()}

            {transcription.status === 'error' && (
              <div className="notice error" role="alert">
                <strong>A transcrição não foi concluída.</strong>
                <small>{transcription.message}</small>
              </div>
            )}

            {captionJob.status === 'error' && (
              <div className="notice error" role="alert">
                <strong>As legendas não foram geradas.</strong>
                <small>{captionJob.message}</small>
              </div>
            )}

            {hasText && (
              <>
                {hasCaptions && (
                  <div className="segmented view-switch" role="tablist" aria-label="Visualização">
                    <button type="button" role="tab" aria-pressed={view === 'text'} aria-selected={view === 'text'} onClick={() => setView('text')}>
                      Texto
                    </button>
                    <button type="button" role="tab" aria-pressed={view === 'captions'} aria-selected={view === 'captions'} onClick={() => setView('captions')}>
                      Legendas · {captionsData.captions.length}
                    </button>
                  </div>
                )}

                {textChanged && (
                  <div className="notice accent" aria-live="polite">
                    <strong>Texto alterado — gere as legendas novamente.</strong>
                  </div>
                )}

                {(view === 'text' || !hasCaptions) && (
                  <>
                    <div className="editor-heading">
                      <h2>{hasCaptions ? '' : `Texto · ${countWords(textSegments)} palavras`}</h2>
                      <small>Enter separa falas · Backspace no início junta</small>
                    </div>
                    <div className="panel caption-list text-list">
                      {textSegments.map((segment, index) => (
                        <div className="caption-row text-row" key={`${segment.start}-${index}`}>
                          <span className="caption-time">{formatTime(segment.start)}</span>
                          <textarea
                            ref={(element) => {
                              textInputRefs.current[index] = element
                              fitTextarea(element)
                            }}
                            value={segment.text}
                            rows={1}
                            spellCheck={false}
                            disabled={isCaptioning}
                            aria-label={`Editar parágrafo ${index + 1}`}
                            onChange={(event) => {
                              fitTextarea(event.target)
                              updateSegmentText(index, event.target.value)
                            }}
                            onKeyDown={(event) => handleTextKeyDown(index, event)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {view === 'captions' && captionsData && (
                  <>
                    {(exportState.status === 'success' || exportState.status === 'error') && (
                      <div className={`notice ${exportState.status}`} role={exportState.status === 'error' ? 'alert' : 'status'}>
                        <strong>{exportState.message}</strong>
                        {exportState.status === 'success' && <small>{exportState.path}</small>}
                      </div>
                    )}

                    {segmentState.status === 'error' && segmentationChanged && (
                      <div className="notice error" role="alert">
                        <strong>As legendas não foram regeradas.</strong>
                        <small>{segmentState.message}</small>
                      </div>
                    )}

                    <div className="editor-heading">
                      <h2 />
                      <small>Enter divide · Backspace em vazia remove</small>
                    </div>

                    <div className="panel caption-list">
                      {captionsData.captions.map((caption, index) => {
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

                  </>
                )}
              </>
            )}
          </section>

          <aside className="inspector" aria-label="Configurações">
            <section className="inspector-section">
              <h3>Preset</h3>
              <label className="field">
                <select value={activePresetId} onChange={(event) => applyPreset(event.target.value)} disabled={isBusy} aria-label="Preset">
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
                <button className="btn ghost small" onClick={saveCurrentPreset} disabled={isBusy}>Salvar atual</button>
                {activeCustomPreset && (
                  <button className="btn ghost small danger" onClick={deleteActivePreset} disabled={isBusy}>Excluir preset</button>
                )}
              </div>
              {presetMessage && <small className="preset-message">{presetMessage}</small>}
            </section>

            <section className="inspector-section">
              <h3>Transcrição</h3>
              <label className="field">
                Modelo Whisper
                <select value={model} onChange={(event) => setModel(event.target.value)} disabled={isBusy}>
                  <option value="large-v3">Large v3 · precisão</option>
                  <option value="medium">Medium · equilíbrio</option>
                  <option value="small">Small · mais rápido</option>
                </select>
              </label>
              <label className="field">
                Idioma
                <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={isBusy}>
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
                      disabled={isBusy}
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
