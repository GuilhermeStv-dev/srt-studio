# Handoff para outro agente

## Estado

O SRT Studio tem a Fundação concluída. A **Fase 2 (transcrição)** está implementada em código e aguarda validação real em Windows; a **Fase 3 (segmentação ES-PY)** já possui uma primeira versão determinística e testada.

Repositório: `GuilhermeStv-dev/srt-studio`, branch `main`.

## Verificação atual

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
```

Estado em 2026-08-17: **23 testes passando**.

## Transcrição

- `engine/transcription/faster_whisper_adapter.py`
- detecção de CUDA com CTranslate2;
- seleção de compute type;
- `faster-whisper` importado de forma lazy;
- `word_timestamps=True`;
- VAD por padrão;
- retorno serializável de palavras com `start/end/probability`;
- CLI `runtime` e `transcribe`;
- Electron usa `.venv` do repositório quando ela existe.

## Segmentação

- `engine/segmentation/segmenter.py`
- programação dinâmica em vez de corte guloso;
- alvo de caracteres configurável, padrão 12;
- limite de segurança configurável;
- penalidades para conectores isolados/pendurados;
- pausas e pontuação forte influenciam boundaries;
- normalização de ponto final no texto do cue;
- proteção contra cue sem duração e overlap;
- testes em `tests/engine/test_segmentation.py`.

A CLI `transcribe` agora devolve também `captions`, e o renderer mostra um preview das captions antes dos WordTokens brutos.

## Setup Windows

Preferir o script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

O script cria `.venv`, instala o extra `transcription`, executa testes, health-check e runtime-check.

## Próximo objetivo imediato

Usar um arquivo real ES-PY e registrar:

- device/compute type;
- tempo total;
- qualidade do texto;
- divisão de captions;
- casos em que artigo/preposição foi separado de forma ruim;
- captions longas/curtas demais;
- timestamps suspeitos.

Cada falha real de segmentação deve virar fixture/teste antes de mudar o algoritmo.
