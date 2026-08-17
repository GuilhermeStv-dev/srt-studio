$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPath = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Write-Host "SRT Studio - setup de desenvolvimento" -ForegroundColor Cyan
Write-Host "Projeto: $repoRoot" -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js não encontrado. Instale Node 22+."
}

$python312Mode = $null

if (Get-Command py -ErrorAction SilentlyContinue) {
  try {
    & py -3.12 -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $python312Mode = "py"
    }
  } catch {
    $python312Mode = $null
  }
}

if (-not $python312Mode -and (Get-Command python -ErrorAction SilentlyContinue)) {
  try {
    $systemPythonVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ($LASTEXITCODE -eq 0 -and $systemPythonVersion.Trim() -eq "3.12") {
      $python312Mode = "python"
    }
  } catch {
    $python312Mode = $null
  }
}

if (-not $python312Mode) {
  Write-Host "Python 3.12 não foi encontrado." -ForegroundColor Red
  Write-Host "Instale com:" -ForegroundColor Yellow
  Write-Host "  winget install -e --id Python.Python.3.12" -ForegroundColor White
  throw "O ambiente de transcrição do SRT Studio exige Python 3.12 para manter dependências locais previsíveis."
}

if (Test-Path $venvPython) {
  $venvVersion = & $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível verificar a versão do Python da .venv existente."
  }

  if ($venvVersion.Trim() -ne "3.12") {
    Write-Host ".venv existente usa Python $venvVersion; recriando com Python 3.12..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $venvPath
  }
}

if (-not (Test-Path $venvPython)) {
  Write-Host "Criando .venv com Python 3.12..." -ForegroundColor Yellow
  if ($python312Mode -eq "py") {
    & py -3.12 -m venv $venvPath
  } else {
    & python -m venv $venvPath
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar .venv com Python 3.12."
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
