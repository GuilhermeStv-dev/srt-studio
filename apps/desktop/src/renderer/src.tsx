import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
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
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; words: Caption[]; captions: Caption[] }
  | { status: 'error'; message: string }

type ExportState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; path: string }
  | { status: 'error'; message: string }

function fileName(filePath: string | null): string {
  if (!filePath) return 'Nenhum arquivo selecionado'
  return filePath.split(/[\\/]/).pop() || filePath
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
  const [model, setModel] = useState('large-v3')
  const [language, setLanguage] = useState('es')
  const [targetWords, setTargetWords] = useState(2)
  const [ignorePrepositions, setIgnorePrepositions] = useState(true)
  const [preservePunctuation, setPreservePunctuation] = useState(true)
  const [formatMonetaryThousands, setFormatMonetaryThousands] = useState(false)
  const [transcription, setTranscription] = useState<TranscriptionState>({
    status: 'idle',
    message: 'Selecione um arquivo para iniciar a primeira transcrição real.'
  })
  const [exportState, setExportState] = useState<ExportState>({
    status: 'idle',
    message: 'O SRT ficará disponível depois da transcrição.'
  })

  const selectedName = useMemo(() => fileName(filePath), [filePath])

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
    const result = await window.srtStudio.selectMedia()
    if (!result.canceled && result.filePath) {
      setFilePath(result.filePath)
      setTranscription({
        status: 'idle',
        message: 'Arquivo pronto. A transcrição ainda não altera nem sobrescreve o original.'
      })
      setExportState({
        status: 'idle',
        message: 'O SRT ficará disponível depois da transcrição.'
      })
    }
  }

  async function runTranscription() {
    if (!filePath) return
    setExportState({ status: 'idle', message: 'Aguardando a nova transcrição.' })
    setTranscription({ status: 'loading', message: 'Carregando modelo e transcrevendo…' })
    try {
      const result = await window.srtStudio.transcribe({
        filePath,
        model,
        language: language === 'auto' ? null : language,
        targetWords,
        ignorePrepositions,
        preservePunctuation,
        formatMonetaryThousands
      })
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
  }, [])

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-topline">
          <span className="eyebrow">TRANSCRIÇÃO · 0.4 DEV</span>
          <span className={`status-dot ${runtime.status}`}>{runtime.message}</span>
        </div>
        <h1>SRT Studio</h1>
        <p>
          Transcrição local e captions previsíveis para um SRT rápido de editar no Premiere.
        </p>
      </section>

      <section className="workspace">
        <article className="card primary">
          <div className="card-copy">
            <span className="label">1 · Arquivo de origem</span>
            <h2>{selectedName}</h2>
            <p>{filePath || 'Áudio ou vídeo local. O arquivo original nunca é modificado.'}</p>
          </div>
          <button className="secondary" onClick={selectMedia}>Selecionar arquivo</button>
        </article>

        <article className="card controls">
          <span className="label">2 · Transcrição e segmentação</span>
          <div className="field-row three">
            <label>
              Modelo Whisper
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="large-v3">Large v3 · precisão</option>
                <option value="medium">Medium · equilíbrio</option>
                <option value="small">Small · mais rápido</option>
              </select>
            </label>
            <label>
              Idioma
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="es">Español / ES-PY</option>
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="auto">Detectar</option>
              </select>
            </label>
            <label>
              Palavras por caption
              <select value={targetWords} onChange={(event) => setTargetWords(Number(event.target.value))}>
                <option value={1}>1 palavra</option>
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
              />
              <span>
                <strong>Ignorar preposições na contagem</strong>
                <small>Ex.: com 1 palavra, “para vos” pode permanecer junto.</small>
              </span>
            </label>

            <label className="toggle-card">
              <input
                type="checkbox"
                checked={preservePunctuation}
                onChange={(event) => setPreservePunctuation(event.target.checked)}
              />
              <span>
                <strong>Manter pontuação</strong>
                <small>Preserva vírgulas, ¿ ?, ¡ ! e outros sinais da transcrição.</small>
              </span>
            </label>

            <label className="toggle-card">
              <input
                type="checkbox"
                checked={formatMonetaryThousands}
                onChange={(event) => setFormatMonetaryThousands(event.target.checked)}
              />
              <span>
                <strong>Valores monetários no formato “mil”</strong>
                <small>Ex.: ₲200.000 / 200 mil guaraníes → 200 mil. Outros números não são alterados.</small>
              </span>
            </label>
          </div>

          <div className="engine-line">
            <span>{health.message}</span>
            <button className="ghost" onClick={checkRuntime}>Reverificar runtime</button>
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
                disabled={!filePath || transcription.status === 'loading' || runtime.status !== 'ready'}
              >
                {transcription.status === 'loading' ? 'Transcrevendo…' : transcription.status === 'success' ? 'Transcrever novamente' : 'Transcrever agora'}
              </button>
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

          {transcription.status === 'success' && (
            <>
              <div className={`export-status ${exportState.status}`}>
                <strong>{exportState.message}</strong>
                {exportState.status === 'success' && <small>{exportState.path}</small>}
              </div>

              <div className="caption-preview">
                {transcription.captions.slice(0, 24).map((caption, index) => (
                  <div className="caption-row" key={`${caption.start}-${index}`}>
                    <span className="caption-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{caption.text}</strong>
                    <small>{caption.start.toFixed(2)} → {caption.end.toFixed(2)}</small>
                  </div>
                ))}
              </div>
              {transcription.captions.length > 24 && (
                <p className="preview-note">Preview mostrando as primeiras 24 de {transcription.captions.length} captions. A exportação usa todas.</p>
              )}
              <details className="raw-words">
                <summary>Ver palavras e timestamps brutos</summary>
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
