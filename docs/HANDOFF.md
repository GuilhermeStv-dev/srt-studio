# Handoff para outro agente

## Estado

O SRT Studio já possui fluxo funcional de ponta a ponta: mídia local → `faster-whisper` → `WordToken[]` → normalização/segmentação inteligente → `CaptionCue[]` → preview → exportação SRT.

Repositório: `GuilhermeStv-dev/srt-studio`. A `main` é o estado estável; mudanças devem usar branch + PR.

Checkpoint de 2026-08-26:

- erro real `Duração inválida em '¿Tenés': 59.44 -> 59.44` tratado como timestamp colapsado;
- `collect_word_tokens` mantém regressão para colapso causado por arredondamento em milissegundos;
- `engine.cli` força UTF-8 em stdin/stdout/stderr para evitar `¿Qué` virar `Â¿QuÃ©` em exportações via stdin;
- Electron usa `.ico` no Windows para janela/taskbar quando o asset existe;
- `npm run dev` gera `build/branding/srtx.ico` e `srtx.png` por script Node antes de abrir o app.
- `npm run make:win` gerou `SRTX-Setup.exe` localmente e validou o engine standalone;
- a CI Windows gerou e validou `SRTX-Setup.exe`, mas o upload como Actions artifact pode falhar quando a cota de artifacts do GitHub Actions estiver cheia;
- build interno `v0.2.0-internal.1` publicado em GitHub Release com `SRTX-Setup.exe`.

Checkpoint de 2026-08-28:

- regressão real de segmentação `CONFIANZUDO TAMBIÉN` reproduzida em fixture;
- adicionada trava visual universal de 17 caracteres para captions com mais de uma palavra física;
- a opção de ignorar preposições não pode mais anexar uma preposição se o texto renderizado passar de 17 caracteres;
- opções da UI trocadas de checkboxes para toggle buttons acessíveis;
- progresso da transcrição conectado à barra de tarefas do Windows por `BrowserWindow.setProgressBar`.

Checkpoint de 2026-08-28, segunda rodada:

- calibrado par curto `acá tenemos` para ficar junto quando o gap real é colado e o texto cabe na trava visual;
- dígitos simples de contagem/chamada (`5`, `4`, `3`, `2`, `1`) passam a ser captions isoladas;
- preview de captions agora permite editar texto, dividir com Enter/botão e excluir segmentos antes da exportação;
- coluna lateral do preview mostra quantidade de caracteres da caption, não índice;
- cards de opções ficaram compactos e mostram explicação clara somente ao clicar em `?`.

Checkpoint de 2026-08-29:

- removido estado verde dos cards de opção ativos;
- toggles compactos revisados para usar switch roxo, com foco acessível sem contorno amarelo nativo;
- explicações dos botões `?` agora aparecem como popovers flutuantes e fecham ao clicar fora ou pressionar Esc.

Checkpoint de 2026-09-23:

- adicionado build macOS Apple Silicon (D-015) com CI `macos-packaging.yml` e publicação de `SRTX-macOS-arm64.zip` nas Releases `v*`;
- a branch `codex/fix-settings-popover-toggles` (base do v0.2.3) foi integrada à `main`, para que Windows e macOS saiam do mesmo código.

Fases atuais:

- Fase 2 — transcrição: concluída funcionalmente;
- Fase 3 — segmentação ES-PY: D-012 em calibração real;
- Fase 4 — exportação SRT: funciona no Windows, falta confirmação final no Premiere;
- Fase 5 — desktop funcional: implementação principal pronta, validações reais pendentes;
- Fase 6 — UX/UI: em refinamento;
- Fase 7 — calibração/regressão: iniciada com fixtures JSON.

Checkpoint de 2026-10-26 — D-017, entrega 1:

- D-017 aprovada: fluxo Transcrição → Revisão do texto → Legendas; no MVP sem dividir/juntar palavras, sem dicionário ortográfico, e as opções de segmentação ficam na etapa 3;
- novo comando `python -m engine.cli segment`: lê `{"words": [...], "segmentation": {...}}` via stdin (aceita o próprio payload de `transcribe`) e devolve `{"ok", "captions", "segmentation"}`; erro → JSON em stderr e código 6;
- `engine/pipeline.py` concentra a cadeia reparo de números → moeda → segmentação, usada por `transcribe` e `segment`, para que os dois nunca divirjam;
- `segment` rejeita palavra vazia, palavra com espaço (dividir não é suportado), timestamp não finito, negativo, regressivo ou com duração negativa, e opções desconhecidas;
- a UI ainda não usa `segment` (isso é a entrega 2).

Checkpoint de 2026-10-26 — D-017, entrega 2:

- IPC `engine:segment` no main/preload envia `{words, segmentation}` ao engine via stdin, como `export-srt`;
- o estado de sucesso da transcrição guarda **todas** as `words` (antes guardava só 24 para a amostra), a `segmentation` que gerou as captions atuais e `captionsEdited`;
- se as opções de segmentação diferirem das usadas, aparecem aviso e o botão “Regerar legendas”; regerar com edição manual pede `window.confirm`;
- modelo/idioma continuam exigindo “Transcrever novamente”;
- pendente: validação visual do usuário no `npm run dev` (Windows).

## Verificação obrigatória

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
npm run typecheck
npm run build
```

## Segmentação — D-012

O controle exposto é alvo de `1`, `2`, `3` ou `4` palavras, tratado como preferência forte e não corte mecânico. O score considera cadência pelos gaps de `WordToken`, pontuação, coesão curta e preposições.

Regras estruturais:

- pausa forte vence coesão;
- alvo 1 pode formar pares curtos, mas não frases longas automaticamente;
- `¿`, `?`, `¡`, `!` sempre são preservados;
- opção de pontuação controla somente vírgulas e pontos;
- valores monetários reconhecidos são sempre captions isoladas;
- captions com mais de uma palavra física não podem passar de 17 caracteres renderizados;
- pares demonstrativos curtos como `acá tenemos` podem ficar juntos quando falados sem pausa relevante;
- dígitos simples de contagem/chamada são isolados em captions próprias;
- `N mil` é opcional e não pode reinterpretar números comuns;
- cues precisam ter duração positiva e nunca podem sobrepor/regredir.

Casos reais já esperados incluem:

- `Hola,` / `¿qué tal?`;
- `participar en` / `un juego?`;
- `¿Quién se` / `anima?`;
- `acá ya` quando falado colado;
- pausa forte separando até um par coeso;
- `con` / `50 mil` / `ahora` para moeda.

## Calibração — Fase 7

Leia `docs/CALIBRATION.md` antes de alterar pesos/heurísticas.

Fixtures ficam em:

```text
tests/fixtures/segmentation/*.json
```

Runner:

```text
tests/engine/test_segmentation_fixtures.py
```

Fluxo obrigatório para bug de segmentação:

1. reproduzir o trecho com `WordToken`s e timestamps reais;
2. criar fixture mínima que represente o corte desejado;
3. confirmar que ela falha antes da correção quando for um bug novo;
4. só então ajustar o segmentador;
5. rodar toda a suíte;
6. não commitar áudio/vídeo de cliente.

A fixture pode incluir `normalization.monetary_thousands` quando o caso precisar passar pelo normalizador monetário antes da segmentação.

## Transcrição e progresso

- `faster-whisper` local com `word_timestamps=True` e VAD;
- runtime via CTranslate2;
- Electron prefere `.venv\Scripts\python.exe`;
- UTF-8 forçado no subprocesso;
- progresso real durante inferência por posição temporal;
- carregamento do modelo é indeterminado;
- uma transcrição ativa por vez;
- Cancelar encerra somente o subprocesso Python ativo;
- fallback CPU funciona; CUDA/cuDNN completo ainda é desejável para desempenho.

## Desktop/UX

- seleção e drag-and-drop de mídia;
- presets locais e personalizados;
- retry preservando arquivo/configuração;
- preview completo de captions;
- exportação SRT com Save As e confirmação de sobrescrita;
- revisão manual de captions no preview antes da exportação;
- layout desktop refinado em duas colunas + preview em largura total;
- informações de engine/runtime saudável, WordTokens brutos e explicações técnicas foram removidas da experiência normal;
- detalhes técnicos devem aparecer somente quando houver erro que exija ação.

## Próximo objetivo imediato

0. validar a entrega 2 no `npm run dev`; depois, D-017 entrega 3: navegação em etapas (1 Transcrição · 2 Revisão · 3 Legendas) com as opções de segmentação na etapa 3 e confirmação antes de descartar edições.
1. reinstalar/rodar uma build que contenha o commit mais recente antes de retestar o arquivo do usuário;
2. adicionar novos trechos reais ao corpus de fixtures conforme o usuário apontar cortes ruins;
3. não ajustar D-012 sem regressão correspondente;
4. confirmar importação SRT no Premiere;
5. validar cancelamento/retry/presets em uso real;
6. concluir limpeza visual final;
7. concluir CUDA/cuDNN;
8. baixar o `SRTX-Setup.exe` da GitHub Release `v0.2.0-internal.1` e validar instalação limpa.
