# Handoff para outro agente

## Estado

O SRT Studio tem a Fundação concluída. A **Fase 2 (transcrição)** já passou por teste real no Windows, incluindo fallback CPU e correção UTF-8. A **Fase 3 (segmentação ES-PY)** usa quantidade explícita de palavras. A **Fase 4 (SRT Premiere-safe)** está implementada em código e aguarda validação real de exportação/importação no Premiere.

Repositório: `GuilhermeStv-dev/srt-studio`, branch estável `main`. Mudanças devem seguir branch + PR.

## Verificação obrigatória

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
npm run typecheck
npm run build
```

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
- opção `preserve_commas_periods` controla somente vírgulas e pontos nas bordas;
- `¿`, `?`, `¡` e `!` são sempre preservados;
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

## Exportação SRT

- `engine/srt/render.py`: renderiza SubRip e valida cues antes do texto final;
- `engine/srt/export.py`: grava UTF-8 sem BOM e não sobrescreve por padrão;
- `engine.cli export-srt`: recebe captions em JSON via stdin;
- Electron abre `Save As` com nome sugerido baseado na mídia;
- arquivo existente exige confirmação explícita antes de usar `--overwrite`;
- renderer mostra estado de exportação e caminho final;
- a exportação usa todas as captions, mesmo que o preview mostre apenas as primeiras 24.

## Setup Windows

Preferir:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

## Próximo objetivo imediato

No Windows:

1. dar `git pull` e abrir `npm run dev`;
2. repetir o áudio ES-PY real;
3. confirmar que desligar **Manter vírgulas e pontos** remove apenas `,`/`.` e mantém `¿ ? ¡ !`;
4. clicar **Exportar SRT**;
5. salvar o arquivo;
6. importar no Adobe Premiere;
7. validar acentos, timestamps, sincronia e todas as captions;
8. testar tentativa de salvar por cima de um SRT existente e confirmar que há aviso.

A Fase 4 só deve ser marcada concluída após importação bem-sucedida no Premiere.
