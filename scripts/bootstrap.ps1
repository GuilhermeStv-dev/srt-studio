$ErrorActionPreference = "Stop"

Write-Host "SRT Studio - bootstrap" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js não encontrado. Instale Node 22+."
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python não encontrado. Instale Python 3.11+."
}

npm install
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health

Write-Host "Fundação pronta." -ForegroundColor Green
