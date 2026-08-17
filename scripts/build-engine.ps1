$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
$distRoot = Join-Path $repoRoot 'dist\engine'
$workRoot = Join-Path $repoRoot 'build\pyinstaller'
$specRoot = Join-Path $repoRoot 'build\pyinstaller-spec'
$entry = Join-Path $repoRoot 'scripts\engine_entry.py'

if (-not (Test-Path $python)) {
    throw "Ambiente Python do projeto não encontrado em $python. Rode scripts/bootstrap.ps1 primeiro."
}

Write-Host 'Instalando dependências de empacotamento do engine...'
& $python -m pip install -e "$repoRoot[transcription,packaging]"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências de empacotamento.' }

Remove-Item $distRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $workRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $specRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $distRoot, $workRoot, $specRoot | Out-Null

Write-Host 'Gerando runtime Python standalone...'
& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name srt-studio-engine `
    --distpath $distRoot `
    --workpath $workRoot `
    --specpath $specRoot `
    --paths $repoRoot `
    --collect-all faster_whisper `
    --collect-all ctranslate2 `
    --collect-all tokenizers `
    --collect-all av `
    --collect-all onnxruntime `
    $entry
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller não conseguiu gerar o engine standalone.' }

$engineExe = Join-Path $distRoot 'srt-studio-engine\srt-studio-engine.exe'
if (-not (Test-Path $engineExe)) {
    throw "Build terminou sem gerar $engineExe"
}

Write-Host 'Validando engine standalone...'
& $engineExe health
if ($LASTEXITCODE -ne 0) { throw 'Health-check do engine standalone falhou.' }

& $engineExe runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime-check do engine standalone falhou.' }

Write-Host ''
Write-Host "Engine standalone pronto em: $engineExe"
