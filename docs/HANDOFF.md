# Handoff para outro agente

## Estado

O SRT Studio tem a Fundação concluída. A **Fase 2 (transcrição)** já passou por teste real no Windows, incluindo fallback CPU e correção UTF-8. A **Fase 3 (segmentação ES-PY)** usa segmentação inteligente por alvo + cadência + coesão curta. A **Fase 4 (SRT Premiere-safe)** já exporta SRT no Windows e aguarda confirmação final de importação no Premiere. A **Fase 5 (desktop funcional)** já inclui drag-and-drop, preview completo, progresso/cancelamento, presets locais e retry; os últimos itens aguardam validação real no Windows.

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

### Progresso da transcrição

- `transcribe_file(..., progress_callback=...)` aceita callback opcional sem alterar o uso existente;
- estágios: `preparing`, `loading_model`, `transcribing`, `finalizing` e `completed`;
- preparação/carregamento/finalização usam progresso indeterminado porque não existe percentual confiável nesses trechos;
- durante inferência, `collect_word_tokens` calcula progresso por `segment.end / duração do áudio`;
- inferência é limitada a `0.99`; `1.0` só é emitido depois de normalização/segmentação concluídas pelo CLI;
- `engine.cli transcribe --progress-events` escreve eventos prefixados por `SRT_PROGRESS ` em stderr e preserva o JSON final em stdout;
- stderr normal continua reservado para erros.

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
- renderer assina `engine:transcription-progress` via preload;
- carregamento do modelo mostra barra indeterminada; inferência mostra percentual real;
- somente uma transcrição pode ficar ativa por vez no main process;
- `engine:cancel-transcription` marca o job como cancelado e encerra apenas o processo Python ativo;
- o resultado de cancelamento é `{ ok: false, cancelled: true }`, não um erro genérico;
- arquivo/configurações ficam bloqueados durante a execução para evitar estado ambíguo;
- não gerar/exportar resultado parcial após cancelamento.

### Presets e retry

- `apps/desktop/src/renderer/presets.ts` concentra apenas lógica de preferência de UI; não mover presets para o engine;
- presets padrão: `ES-PY · Dinâmico` (densidade 1) e `ES-PY · Equilibrado` (densidade 2);
- preset inclui modelo, idioma, densidade, `ignorePrepositions`, `preserveCommasPeriods` e `formatMonetaryThousands`;
- presets personalizados persistem somente em `localStorage` (`srt-studio.presets.v1`), mantendo o MVP offline;
- `Salvar atual` cria um preset ou atualiza outro personalizado com o mesmo nome;
- presets padrão não podem ser apagados; personalizados podem;
- ao alterar manualmente qualquer opção, a UI passa a mostrar `Configuração personalizada` se não houver correspondência exata;
- erro de transcrição preserva arquivo e configurações;
- após erro, a ação principal vira **Tentar novamente** e o painel explica que nada foi perdido;
- retry chama o mesmo pipeline normal; não criar um segundo fluxo especial no engine.

## Setup Windows

Preferir:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

## Próximo objetivo imediato

No Windows:

1. dar `git pull` e abrir `npm run dev`;
2. repetir o áudio ES-PY usado na calibração e validar as fronteiras inteligentes;
3. observar a barra e testar cancelamento durante inferência;
4. selecionar `ES-PY · Dinâmico`, alterar uma opção e confirmar que vira configuração personalizada;
5. salvar um preset próprio, fechar/reabrir o app e confirmar persistência;
6. provocar uma falha recuperável e confirmar que **Tentar novamente** preserva arquivo/configuração;
7. importar um SRT exportado no Adobe Premiere para fechar Fase 4;
8. novos cortes artificiais devem virar fixtures/testes antes de ajustar o segmentador.
