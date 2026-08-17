# SRT Studio

Aplicativo desktop Windows para transformar áudio/vídeo em **SRT pronto para edição no Premiere**, com operação prioritariamente local e offline.

## Estado atual

**Fase 2 — transcrição em validação real** e **Fase 3 — segmentação ES-PY iniciada**. A Fundação já está concluída.

Esta base já contém:

- monorepo com aplicativo desktop em Electron + React + TypeScript;
- engine Python isolado da interface;
- contratos iniciais de `WordToken` e `CaptionCue`;
- normalização básica de texto;
- geração e validação estrutural de SRT;
- health-check do engine via CLI;
- ponte IPC Electron → Python;
- 24 testes unitários do engine;
- CI inicial para engine Python e typecheck/build do desktop.

## Antes de desenvolver

Qualquer pessoa ou IA deve começar por [`AGENTS.md`](AGENTS.md).

Documentos de continuidade:

- [`docs/PRODUCT_RULES.md`](docs/PRODUCT_RULES.md) — regras inegociáveis do produto;
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura e responsabilidade das camadas;
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plano completo e critérios de cada fase;
- [`docs/STATUS.md`](docs/STATUS.md) — o que está pronto e pendente;
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — último checkpoint;
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões que não devem ser reinterpretadas silenciosamente;
- [`docs/AI_CONTINUITY.md`](docs/AI_CONTINUITY.md) — procedimento e prompt para trocar de IA com segurança.

O GitHub é a fonte de verdade técnica. O Notion funciona como painel visual de acompanhamento.

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

## Pré-requisitos

- Windows 11
- Node.js 22+
- npm
- Python 3.11+

O `faster-whisper` é uma dependência opcional do engine. Para desenvolvimento no Windows, Python 3.12 é o ambiente recomendado do projeto.

## Rodar os testes do engine

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
```

## Quality gates do desktop

```powershell
npm run typecheck
npm run build
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

O Electron abre o preview real do aplicativo. A tela permite selecionar mídia, escolher modelo/idioma e alvo de caracteres, verificar o runtime, transcrever e visualizar as captions geradas. Os WordTokens brutos continuam disponíveis em uma área expansível.

## Preparar ambiente completo no Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

O script cria uma `.venv`, instala `faster-whisper`, roda os testes e verifica o runtime local. O Electron usa automaticamente o Python dessa `.venv` quando ela existe.

## Próximo passo

Validar uma transcrição ES-PY real no Windows, revisar o preview de captions e transformar os casos ruins em testes de regressão para calibrar o segmentador. Depois, avançar para exportação SRT pela interface conforme `docs/ROADMAP.md`.
