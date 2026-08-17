# SRT Studio

Aplicativo desktop Windows para transformar áudio/vídeo em **SRT pronto para edição no Premiere**, com operação prioritariamente local e offline.

## Estado atual

**Fase 1 — Fundação** em andamento.

Esta base já contém:

- monorepo com aplicativo desktop em Electron + React + TypeScript;
- engine Python isolado da interface;
- contratos iniciais de `WordToken` e `CaptionCue`;
- normalização básica de texto;
- geração e validação estrutural de SRT;
- health-check do engine via CLI;
- ponte IPC Electron → Python para verificar o engine;
- testes unitários iniciais;
- CI inicial para engine Python e typecheck/build do desktop.

## Objetivo do MVP

1. Selecionar áudio ou vídeo local.
2. Transcrever localmente com `faster-whisper`.
3. Obter timestamps por palavra.
4. Normalizar fala ES-PY sem destruir números e pontuação útil.
5. Segmentar captions com preferência aproximada de 12 caracteres, sem cortes cegos.
6. Evitar preposições, artigos e conectores isolados.
7. Exportar SRT válido e seguro para Premiere.
8. Nunca sobrescrever automaticamente o arquivo original.

## Arquitetura

```text
srt-studio/
├─ apps/
│  └─ desktop/               # Electron + React + TypeScript
├─ engine/
│  ├─ transcription/         # faster-whisper
│  ├─ segmentation/          # lógica ES-PY
│  ├─ normalization/         # limpeza e pontuação
│  └─ srt/                   # exportação + validação
├─ shared/
│  ├─ schemas/
│  └─ presets/
├─ tests/
│  ├─ engine/
│  └─ fixtures/
├─ references/
├─ docs/
├─ scripts/
└─ .github/
```

Leia [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/STATUS.md`](docs/STATUS.md) antes de continuar o desenvolvimento.

## Pré-requisitos

- Windows 11
- Node.js 22+
- npm
- Python 3.11+

O `faster-whisper` ainda não é obrigatório nesta fundação. Ele entra na próxima etapa.

## Rodar os testes do engine

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
```

## Health-check do engine

```powershell
python -m engine.cli health
```

Resposta esperada:

```json
{"ok": true, "engine": "srt-studio", "version": "0.1.0"}
```

## Rodar o desktop

```powershell
npm install
npm run dev
```

Na tela inicial, use **Verificar engine local**. O Electron chama o Python por IPC e mostra o resultado.

## Próximo passo

Implementar o pipeline `arquivo -> faster-whisper -> WordToken[]`, mantendo o engine independente da interface.
