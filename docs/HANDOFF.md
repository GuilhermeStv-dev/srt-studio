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
- `npm run make:win` gerou `SRTX-Setup.exe` localmente e validou o engine standalone; falta validar o artefato da CI e instalação limpa.

Fases atuais:

- Fase 2 — transcrição: concluída funcionalmente;
- Fase 3 — segmentação ES-PY: D-012 em calibração real;
- Fase 4 — exportação SRT: funciona no Windows, falta confirmação final no Premiere;
- Fase 5 — desktop funcional: implementação principal pronta, validações reais pendentes;
- Fase 6 — UX/UI: em refinamento;
- Fase 7 — calibração/regressão: iniciada com fixtures JSON.

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
- layout desktop refinado em duas colunas + preview em largura total;
- informações de engine/runtime saudável, WordTokens brutos e explicações técnicas foram removidas da experiência normal;
- detalhes técnicos devem aparecer somente quando houver erro que exija ação.

## Próximo objetivo imediato

1. reinstalar/rodar uma build que contenha o commit mais recente antes de retestar o arquivo do usuário;
2. adicionar novos trechos reais ao corpus de fixtures conforme o usuário apontar cortes ruins;
3. não ajustar D-012 sem regressão correspondente;
4. confirmar importação SRT no Premiere;
5. validar cancelamento/retry/presets em uso real;
6. concluir limpeza visual final;
7. concluir CUDA/cuDNN;
8. baixar o artefato `srtx-windows-installer` da CI após merge e validar instalação limpa.
