# Handoff para outro agente

## Estado

O SRT Studio tem a Fundação concluída. A **Fase 2 (transcrição)** já passou por teste real no Windows, incluindo fallback CPU e correção UTF-8. A **Fase 3 (segmentação ES-PY)** está migrando de contagem rígida para segmentação inteligente por alvo + cadência + coesão curta. A **Fase 4 (SRT Premiere-safe)** já exporta SRT no Windows e aguarda confirmação final de importação no Premiere. A **Fase 5 (desktop funcional)** começou com drag-and-drop e preview completo de captions.

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

## Segmentação atual — D-012

- `engine/segmentation/segmenter.py`
- controle exposto: alvo de `1`, `2`, `3` ou `4` palavras por caption;
- **o alvo é uma preferência forte, não um corte mecânico**;
- algoritmo escolhe fronteiras globalmente por programação dinâmica;
- gaps entre `WordToken.start/end` são usados como sinal de cadência;
- limiares de pausa são adaptados ao ritmo do próprio trecho;
- pontuação terminal e vírgula/ponto influenciam a qualidade da fronteira;
- pares curtos recebem score de coesão para evitar cortes artificiais;
- no alvo 1, a expansão inteligente pode formar um par, mas não uma frase longa;
- pausa forte sempre vence coesão;
- opção `ignore_prepositions`: preposições não consomem vaga quando ativa e podem se ligar ao lado mais natural;
- captions de uma palavra continuam válidas;
- opção `preserve_commas_periods` controla somente vírgulas e pontos nas bordas;
- `¿`, `?`, `¡` e `!` são sempre preservados;
- separadores internos de números não devem ser destruídos;
- cues continuam com duração positiva e sem overlap.

### Regressões do áudio real

Com alvo 1 e preposições ignoradas, o trecho usado na calibração deve favorecer:

- `Hola,` / `¿qué tal?`;
- `¿Quién` / `quiere`;
- `participar en` / `un juego?`;
- `¿Quién se` / `anima?` — não preservar as três palavras juntas;
- `Bueno,` / `acá ya` / `encontramos`;
- se houver pausa forte dentro de um par normalmente coeso, separar.

Esses exemplos vieram de validação real do usuário e estão cobertos por teste. Novos cortes ruins devem virar regressões antes de ajustar pesos/heurísticas.

### Valores monetários

- `engine/normalization/monetary.py`
- reconhecimento monetário acontece antes da segmentação;
- spans monetários viram um `WordToken` semântico com `kind="monetary"`;
- token monetário tem precedência absoluta e deve ocupar uma caption isolada;
- `con 50 mil` deve virar `con` / `50 mil`;
- a regra vale mesmo com segmentação inteligente e `ignore_prepositions=True`;
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
- a exportação usa todas as captions;
- exportação real no Windows já foi confirmada pelo usuário;
- importação final no Premiere ainda precisa ser confirmada antes de fechar Fase 4.

## Desktop funcional

- seleção de mídia continua disponível pelo diálogo nativo;
- o cartão de origem aceita drag-and-drop de áudio/vídeo;
- em Electron 32+, não usar `File.path`; o preload usa `webUtils.getPathForFile(file)` e expõe `filePathFor` via `contextBridge`;
- a janela previne a abertura/navegação acidental ao soltar um arquivo;
- o cartão dá feedback visual enquanto um arquivo está sobre a área de drop;
- o preview renderiza todas as captions dentro de uma área rolável;
- WordTokens brutos continuam como amostra técnica, não como preview principal;
- progresso/cancelamento ainda não foram implementados e devem ser um PR separado.

## Setup Windows

Preferir:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

## Próximo objetivo imediato

No Windows:

1. dar `git pull` e abrir `npm run dev`;
2. repetir exatamente o áudio ES-PY usado na calibração com alvo 1;
3. validar `¿qué tal?`, `participar en`, `un juego?`, `¿Quién se` / `anima?` e `acá ya`;
4. anotar qualquer fronteira que ainda pareça artificial e transformá-la em fixture/teste antes de mudar o algoritmo;
5. importar um SRT exportado no Adobe Premiere para fechar Fase 4;
6. depois estabilizar a Fase 3, seguir para progresso/cancelamento da transcrição.
