# Distribuição Windows — SRT Studio

## Objetivo

Entregar o SRT Studio como aplicativo Windows instalável, sem exigir Node.js, Python, VS Code ou `.venv` na máquina final.

## Estratégia

A distribuição possui duas camadas:

1. **Engine standalone** — `engine/` + faster-whisper + dependências Python são empacotados com PyInstaller em modo `onedir`.
2. **Desktop Electron** — Electron Forge empacota a interface e inclui a pasta do engine standalone em `resources/srt-studio-engine`.

No desenvolvimento, o Electron continua usando `.venv/Scripts/python.exe` e `python -m engine.cli`. Quando `app.isPackaged === true`, o main process usa diretamente:

```text
resources/srt-studio-engine/srt-studio-engine.exe
```

Isso mantém desenvolvimento e distribuição separados sem duplicar lógica de transcrição.

## Build do engine standalone

Pré-requisito: bootstrap do projeto já executado e `.venv` Python 3.12 disponível.

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\build-engine.ps1
```

Saída esperada:

```text
dist/engine/srt-studio-engine/
├─ srt-studio-engine.exe
└─ _internal/...
```

O script executa `health` e `runtime` no executável após o build. A CI Windows também reproduz esse build em máquina limpa.

## Build do instalador

```powershell
npm install
npm run make:win
```

O Forge executa antes do empacotamento:

- `electron-vite build`;
- `scripts/build-engine.ps1`;
- validação da existência do engine standalone.

O maker Squirrel gera o instalador em `release/forge/make/squirrel.windows/x64/`.

Arquivo principal esperado:

```text
SRTX-Setup.exe
```

## Modelos Whisper

Os modelos Whisper **não devem ser incluídos no instalador**. O aplicativo mantém a operação offline depois que o modelo necessário é baixado, mas o primeiro uso de um modelo pode exigir internet.

O cache/download dos modelos deverá usar diretório persistente do usuário e não a pasta de instalação. A política final de cache ainda deve ser validada antes da versão 1.0.

## CUDA

CUDA/cuDNN não são empacotados pelo instalador neste estágio. Se o runtime CUDA necessário estiver disponível no Windows, o engine pode usar GPU; caso contrário, o fallback CPU continua funcional.

A distribuição não deve falhar apenas porque CUDA não está configurado.

## Assinatura digital

Os primeiros instaladores são builds internos de validação e podem acionar SmartScreen por não possuírem assinatura de código.

Antes de distribuição pública, avaliar certificado de code signing e configurar assinatura no Electron Forge. Assinatura não deve bloquear os testes funcionais do instalador.

## Validação obrigatória antes de considerar a Fase 8 concluída

- instalar `SRTX-Setup.exe` em Windows sem ambiente de desenvolvimento do projeto;
- abrir o aplicativo pelo atalho/menu iniciar;
- selecionar ou arrastar mídia;
- verificar runtime sem depender de Python do sistema;
- transcrever um arquivo real;
- revisar captions;
- exportar SRT;
- fechar e reabrir o aplicativo;
- validar persistência de presets;
- desinstalar sem deixar processo ativo;
- confirmar que o arquivo original e os SRTs do usuário não são removidos pela desinstalação.

## CI

`.github/workflows/windows-packaging.yml` constrói o instalador em `windows-latest`.

Em pushes para `main`, o workflow valida o instalador e tenta publicar um artifact temporário do GitHub Actions. Esse artifact é conveniente, mas pode falhar se a conta atingir a cota de armazenamento do Actions.

Em tags `v*`, o workflow também publica uma GitHub Release permanente com:

- `SRTX-Setup.exe`;
- `SRTX-*-full.nupkg`;
- `RELEASES`.

Para builds que precisam ficar disponíveis para download depois, a Release é a fonte preferida.

Release interna atual:

```text
https://github.com/GuilhermeStv-dev/srt-studio/releases/tag/v0.2.0-internal.1
```

Próxima release interna:

```text
https://github.com/GuilhermeStv-dev/srt-studio/releases/tag/v0.2.3-internal.1
```
