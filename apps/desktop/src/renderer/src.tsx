import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type HealthState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

function App() {
  const [health, setHealth] = useState<HealthState>({
    status: 'idle',
    message: 'Engine ainda não verificado'
  })

  async function checkEngine() {
    setHealth({ status: 'loading', message: 'Verificando Python…' })
    try {
      const result = await window.srtStudio.engineHealth()
      setHealth({
        status: result.ok ? 'success' : 'error',
        message: result.ok
          ? `Engine ${result.version} conectado`
          : 'Engine respondeu com falha'
      })
    } catch (error) {
      setHealth({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha desconhecida'
      })
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">FUNDAÇÃO · 0.1 DEV</span>
        <h1>SRT Studio</h1>
        <p>
          Transcrição local e captions inteligentes para um SRT limpo, previsível e pronto para o Premiere.
        </p>
      </section>

      <section className="grid">
        <article className="card primary">
          <div>
            <span className="label">Engine local</span>
            <h2>{health.message}</h2>
            <p>Electron → IPC → Python. Esta é a primeira integração real entre as camadas.</p>
          </div>
          <button onClick={checkEngine} disabled={health.status === 'loading'}>
            {health.status === 'loading' ? 'Verificando…' : 'Verificar engine local'}
          </button>
        </article>

        <article className="card">
          <span className="label">Próxima entrega</span>
          <h2>Transcrição com faster-whisper</h2>
          <p>Arquivo de áudio → timestamps por palavra → contrato WordToken.</p>
        </article>

        <article className="card">
          <span className="label">Regra central</span>
          <h2>ES-PY sem cortes cegos</h2>
          <p>~12 caracteres como preferência, preservando conectores e leitura natural.</p>
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
