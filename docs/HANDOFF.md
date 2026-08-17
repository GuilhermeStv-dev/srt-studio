# Handoff para outro agente

## Estado

O SRT Studio tem a Fundação concluída. A **Fase 2 (transcrição)** já passou por teste real no Windows, incluindo fallback CPU e correção UTF-8. A **Fase 3 (segmentação ES-PY)** migrou da abordagem por caracteres para uma abordagem explícita por quantidade de palavras.

Repositório: `GuilhermeStv-dev/srt-studio`, branch estável `main`. Mudanças devem seguir branch + PR.

## Verificação atual

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
npm run typecheck
npm run build
```

Estado da migração por palavras em 2026-08-17: **37 testes do engine passando na CI**.

## Transcrição

- `engine/transcription/faster_whisper_adapter.py`
- detecção de CUDA com CTranslate2;
- seleção de compute type;
- `faster-whisper` importado de forma lazy;
- `word_timestamps=True`;
- VAD por padrão;
- retorno serializável de palavras com `start/end/probability`;
- CLI `runtime` e `transcribe`;
- Electron usa `.venv` do repositório quando ela existe;
- UTF-8 é forçado no subprocesso Python;
- pipeline real ES-PY já foi executado com sucesso via CPU fallback.

## Segmentação atual

- `engine/segmentation/segmenter.py`
- controle principal: `1`, `2`, `3` ou `4` palavras por caption;
- opção `ignore_prepositions`: preposições não consomem vaga quando ativa;
- captions de uma palavra são válidas;
- opção `preserve_punctuation` controla pontuação;
- separadores internos de números não devem ser destruídos;
- cues continuam com duração positiva e sem overlap;
- preview do desktop expõe os controles e mostra as captions.

### Valores monetários

- `engine/normalization/monetary.py`
- reconhecimento monetário acontece antes da segmentação;
- spans monetários viram um `WordToken` semântico com `kind="monetary"`;
- token monetário tem precedência absoluta e deve ocupar uma caption isolada;
- `con 50 mil` deve virar `con` / `50 mil`;
- a regra vale mesmo se `ignore_prepositions=True`;
- opção `monetary_thousands` normaliza milhares redondos para `N mil`;
- `₲200.000`, `200.000 guaraníes`, `200 mil guaraníes` ou `doscientos mil guaraníes` podem virar `200 mil`;
- nunca gerar `200 mil guaraníes` quando essa opção estiver ligada;
- números sem evidência monetária não devem ser alterados.

## Setup Windows

Preferir:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

O script cria `.venv`, instala o extra `transcription`, executa testes, health-check e runtime-check.

## Próximo objetivo imediato

No Windows, repetir o mesmo áudio real ES-PY e validar visualmente:

- 1, 2, 3 e 4 palavras por caption;
- preposições ignoradas/contadas;
- pontuação ligada/desligada;
- valores monetários em `N mil`;
- valor monetário sempre isolado;
- ausência de regressão UTF-8.

Depois dessa validação, avançar para **exportação SRT pela interface**. Cada comportamento considerado ruim deve virar caso de regressão antes de alterar o engine.
