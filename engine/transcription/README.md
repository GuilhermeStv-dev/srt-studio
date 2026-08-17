# Transcription adapter

A camada de transcrição fica isolada do Electron e da segmentação.

## Dependência opcional

Para habilitar transcrição real:

```powershell
pip install -e ".[transcription]"
```

Para desenvolvimento no Windows, prefira um ambiente virtual com Python 3.12.

## Runtime

```powershell
python -m engine.cli runtime
```

O engine consulta o CTranslate2 e escolhe:

- CUDA quando existe GPU CUDA visível;
- `int8_float16` como primeira opção de compute na GPU;
- CPU com `int8` quando CUDA não está disponível.

É possível forçar `--device cpu` ou `--device cuda`.

## Transcrição

```powershell
python -m engine.cli transcribe "C:\caminho\audio.mp3" --model large-v3 --language es
```

Saída JSON resumida:

```json
{
  "ok": true,
  "language": "es",
  "duration": 12.3,
  "model": "large-v3",
  "device": "cuda",
  "compute_type": "int8_float16",
  "words": [
    {"text": "Hola", "start": 0.2, "end": 0.5, "probability": 0.94}
  ]
}
```

O adapter usa `word_timestamps=True` e VAD. Ele rejeita palavras vazias, timestamps negativos, duração zero e timestamps regressivos antes de entregar `WordToken[]` para as próximas camadas.
