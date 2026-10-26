# SRT Studio

Aplicativo desktop (Windows e macOS Apple Silicon) para transformar áudio/vídeo em **SRT pronto para edição no Premiere**, com operação prioritariamente local e offline.

## Estado atual

Build interno funcional para Windows disponível em GitHub Releases.

Download: [`SRTX-Setup.exe`](https://github.com/GuilhermeStv-dev/srt-studio/releases/download/v0.2.3-internal.1/SRTX-Setup.exe)

macOS Apple Silicon (M1/M2/M3…): `SRTX-macOS-arm64.zip` publicado nas Releases `v*` — veja instalação em [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md#macos-apple-silicon).

Status resumido:

- transcrição local com `faster-whisper` funcionando;
- segmentação ES-PY funcional, calibrada por regressões e com trava visual de 17 caracteres;
- editor manual no preview para ajustar texto, dividir e excluir captions antes da exportação;
- exportação SRT Premiere-safe funcionando no Windows;
- desktop Electron funcional com seleção de mídia, preview, retry, progresso, cancelamento, exportação e progresso na barra de tarefas;
- instalador Windows `SRTX-Setup.exe` gerado e validado por CI;
- pendente: validação final de instalação limpa, importação no Adobe Premiere e assinatura digital antes de distribuição pública.

Esta base já contém:

- monorepo com aplicativo desktop em Electron + React + TypeScript;
- engine Python isolado da interface;
- contratos de `WordToken` e `CaptionCue`;
- normalização de texto, pontuação e valores monetários;
- segmentação inteligente para espanhol paraguaio;
- geração e validação estrutural de SRT Premiere-safe;
- health-check do engine via CLI;
- ponte IPC Electron → Python;
- suíte de regressão do engine;
- CI para engine Python, typecheck/build do desktop e packaging Windows.

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

Instalar o `SRTX-Setup.exe` em um Windows limpo, rodar uma transcrição real fora do ambiente de desenvolvimento e importar o SRT exportado no Adobe Premiere.
