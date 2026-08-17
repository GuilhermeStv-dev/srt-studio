# Handoff para outro agente

## Estado

O SRT Studio está na **Fase 2 — Motor de transcrição**.

A Fundação está publicada em `GuilhermeStv-dev/srt-studio`. UI e engine permanecem separados, com IPC apenas como ponte.

## Verificação atual

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
```

Estado em 2026-08-17: **15 testes passando** e health-check `ok: true`.

## O que foi implementado na transcrição

- `engine/transcription/faster_whisper_adapter.py`
- detecção de CUDA com CTranslate2;
- seleção de compute type;
- `faster-whisper` importado de forma lazy;
- `word_timestamps=True`;
- VAD por padrão;
- retorno serializável de palavras com `start/end/probability`;
- CLI `runtime` e `transcribe`;
- UI com seletor de mídia + modelo + idioma + preview de palavras.

A suíte não depende de `faster-whisper` instalado. O ambiente de CI testa a lógica pura; a inferência real precisa ser validada em uma máquina Windows com o extra `transcription` instalado.

## Próximo objetivo imediato

Validar um arquivo real ES-PY no Windows:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[transcription]"
python -m engine.cli runtime
python -m engine.cli transcribe "C:\arquivo.mp3" --model large-v3 --language es
```

Registrar:

- device/compute type escolhidos;
- tempo total;
- quantidade de palavras;
- erros de reconhecimento relevantes;
- comportamento de timestamps.

Depois iniciar `engine/segmentation` usando fixtures e testes antes de adicionar regras à UI.
