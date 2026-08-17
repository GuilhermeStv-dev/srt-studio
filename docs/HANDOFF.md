# Handoff para outro agente

## Onde estamos

A Fundação do SRT Studio foi criada em 2026-08-17.

A UI desktop e o engine Python já estão separados. O engine possui health-check, modelos básicos, normalização inicial e geração/validação SRT. O Electron possui uma chamada IPC de health-check para provar a integração entre processos.

## Verificação atual

Comando:

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
```

Estado na criação desta base: 8 testes passando e health-check retornando `ok: true`.

## Próximo objetivo técnico

Implementar transcrição real com faster-whisper como spike independente:

```text
arquivo de áudio
    ↓
faster-whisper
    ↓
palavras + start/end
    ↓
WordToken[]
    ↓
JSON serializável
```

### Critérios da entrega

- CLI reproduzível fora do Electron.
- Modelo configurável.
- CUDA quando disponível; CPU como fallback.
- `word_timestamps=True`.
- timestamps válidos e monotônicos.
- entradas vazias descartadas.
- falhas retornadas de forma explícita.
- nenhum código de segmentação misturado ao adapter Whisper.
- teste ou fixture pequena cobrindo o contrato.

## Depois

1. segmentação ES-PY guiada por testes;
2. presets;
3. preview na UI;
4. seleção de arquivo;
5. pipeline completo;
6. exportação SRT;
7. empacotamento Windows.
