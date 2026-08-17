import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type HealthState =
  | { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

type RuntimeState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'missing'; message: string }

type TranscriptionState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; words: Array<{ text: string; start: number; end: number }> }
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
  const [transcription, setTranscription] = useState<TranscriptionState>({
    status: 'idle',
    message: 'Selecione um arquivo para iniciar a primeira transcrição real.'
  })

  const selectedName = useMemo(() => fileName(filePath), [filePath])

  async function checkEngine() {
    setHealth({ status: 'loading', message: 'Verificando Python…' })
    try {
      const result = await window.srtStudio.engineHealth()
      setHealth({
        status: result.ok ? 'success' : 'error',
        message: result.ok ? `Engine ${result.version} conectado` : 'Engine respondeu com falha'
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
        setRuntime({
          status: 'ready',
          message: `${result.device.toUpperCase()} · ${result.compute_type}`
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
    }
  }

  async function runTranscription() {
    if (!filePath) return
    setTranscription({ status: 'loading', message: 'Carregando modelo e transcrevendo…' })
    try {
      const result = await window.srtStudio.transcribe({
        filePath,
        model,
        language: language === 'auto' ? null : language
      })
      setTranscription({
        status: 'success',
        message: `${result.words.length} palavras · ${result.language} · ${result.device.toUpperCase()} · ${result.duration.toFixed(1)}s`,
        words: result.words.slice(0, 24)
      })
    } catch (error) {
      setTranscription({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao transcrever'
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
          <span className="eyebrow">TRANSCRIÇÃO · 0.2 DEV</span>
          <span className={`status-dot ${runtime.status}`}>{runtime.message}</span>
        </div>
        <h1>SRT Studio</h1>
        <p>
          Transcrição local e captions inteligentes para um SRT limpo, previsível e pronto para o Premiere.
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
          <span className="label">2 · Modelo</span>
          <div className="field-row">
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
          </div>
          <div className="engine-line">
            <span>{health.message}</span>
            <button className="ghost" onClick={checkRuntime}>Reverificar runtime</button>
          </div>
        </article>

        <article className="card result">
          <div className="result-header">
            <div>
              <span className="label">3 · Spike de transcrição</span>
              <h2>{transcription.message}</h2>
            </div>
            <button
              onClick={runTranscription}
              disabled={!filePath || transcription.status === 'loading' || runtime.status !== 'ready'}
            >
              {transcription.status === 'loading' ? 'Transcrevendo…' : 'Transcrever agora'}
            </button>
          </div>

          {transcription.status === 'success' && (
            <div className="word-preview">
              {transcription.words.map((word, index) => (
                <span className="word-chip" key={`${word.start}-${index}`}>
                  <strong>{word.text}</strong>
                  <small>{word.start.toFixed(2)} → {word.end.toFixed(2)}</small>
                </span>
              ))}
            </div>
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
