#!/usr/bin/env bash
# Equivalente macOS/Linux de scripts/build-engine.ps1.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python="$repo_root/.venv/bin/python"
dist_root="$repo_root/dist/engine"
work_root="$repo_root/build/pyinstaller"
spec_root="$repo_root/build/pyinstaller-spec"
entry="$repo_root/scripts/engine_entry.py"

if [[ ! -x "$python" ]]; then
  echo "Ambiente Python do projeto não encontrado em $python. Crie com: python3 -m venv .venv" >&2
  exit 1
fi

echo 'Instalando dependências de empacotamento do engine...'
"$python" -m pip install -e "$repo_root[transcription,packaging]"

rm -rf "$dist_root" "$work_root" "$spec_root"
mkdir -p "$dist_root" "$work_root" "$spec_root"

echo 'Gerando runtime Python standalone...'
"$python" -m PyInstaller \
  --noconfirm \
  --clean \
  --onedir \
  --name srt-studio-engine \
  --distpath "$dist_root" \
  --workpath "$work_root" \
  --specpath "$spec_root" \
  --paths "$repo_root" \
  --collect-all faster_whisper \
  --collect-all ctranslate2 \
  --collect-all tokenizers \
  --collect-all av \
  --collect-all onnxruntime \
  "$entry"

engine_bin="$dist_root/srt-studio-engine/srt-studio-engine"
if [[ ! -x "$engine_bin" ]]; then
  echo "Build terminou sem gerar $engine_bin" >&2
  exit 1
fi

echo 'Validando engine standalone...'
"$engine_bin" health
"$engine_bin" runtime

echo ''
echo "Engine standalone pronto em: $engine_bin"
