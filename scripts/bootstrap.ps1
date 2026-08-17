$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPath = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Write-Host "SRT Studio - setup de desenvolvimento" -ForegroundColor Cyan
Write-Host "Projeto: $repoRoot" -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js não encontrado. Instale Node 22+."
}

if (-not (Test-Path $venvPython)) {
  $hasPython312 = $false
  if (Get-Command py -ErrorAction SilentlyContinue) {
    try {
      & py -3.12 -c "import sys" 2>$null
      $hasPython312 = ($LASTEXITCODE -eq 0)
    } catch {
      $hasPython312 = $false
    }
  }

  if ($hasPython312) {
    Write-Host "Criando .venv com Python 3.12..." -ForegroundColor Yellow
    & py -3.12 -m venv $venvPath
  } elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $availableVersion = & python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
    Write-Host "Python 3.12 não encontrado; criando .venv com Python $availableVersion..." -ForegroundColor Yellow
    & python -m venv $venvPath
  } else {
    throw "Python não encontrado. Instale Python 3.12+ e execute novamente."
  }
}

if (-not (Test-Path $venvPython)) {
  throw "Falha ao criar .venv: $venvPython não foi encontrado."
}

Push-Location $repoRoot
try {
  Write-Host "Instalando dependências Node..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou." }

  Write-Host "Instalando engine de transcrição no .venv..." -ForegroundColor Yellow
  & $venvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar pip." }

  & $venvPython -m pip install -e ".[transcription]"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar faster-whisper." }

  Write-Host "Executando testes do engine..." -ForegroundColor Yellow
  & $venvPython -m unittest discover -s tests/engine -p "test_*.py" -v
  if ($LASTEXITCODE -ne 0) { throw "Testes do engine falharam." }

  Write-Host "Verificando engine..." -ForegroundColor Yellow
  & $venvPython -m engine.cli health
  if ($LASTEXITCODE -ne 0) { throw "Health-check do engine falhou." }

  Write-Host "Verificando runtime de transcrição..." -ForegroundColor Yellow
  & $venvPython -m engine.cli runtime
  if ($LASTEXITCODE -ne 0) { throw "Runtime de transcrição não ficou disponível." }

  Write-Host "Setup concluído. Rode: npm run dev" -ForegroundColor Green
} finally {
  Pop-Location
}
