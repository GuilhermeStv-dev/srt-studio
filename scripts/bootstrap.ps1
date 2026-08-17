$ErrorActionPreference = "Stop"

Write-Host "SRT Studio - setup de desenvolvimento" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js não encontrado. Instale Node 22+."
}

$venvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    Write-Host "Criando .venv com Python 3.12..." -ForegroundColor Yellow
    & py -3.12 -m venv (Join-Path $PSScriptRoot "..\.venv")
  } elseif (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Criando .venv com o Python disponível..." -ForegroundColor Yellow
    & python -m venv (Join-Path $PSScriptRoot "..\.venv")
  } else {
    throw "Python não encontrado. Instale Python 3.12 e execute novamente."
  }
}

Write-Host "Instalando dependências Node..." -ForegroundColor Yellow
npm install

Write-Host "Instalando engine de transcrição no .venv..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -e ".[transcription]"

Write-Host "Executando testes do engine..." -ForegroundColor Yellow
& $venvPython -m unittest discover -s tests/engine -p "test_*.py" -v
& $venvPython -m engine.cli health
& $venvPython -m engine.cli runtime

Write-Host "Setup concluído. Rode: npm run dev" -ForegroundColor Green
