# Decisões — SRT Studio

Este arquivo registra decisões que uma IA **não deve reinterpretar silenciosamente**. Mudanças aqui exigem justificativa e autorização explícita do usuário.

## D-001 — Produto standalone desktop

**Decisão:** SRT Studio é um aplicativo desktop Windows standalone em Electron.

**Não é:** plugin UXP/Premiere.

**Motivo:** manter o fluxo local, independente e simples; Premiere é o destino do SRT, não o host da aplicação.

## D-002 — Engine Python separado da UI

**Decisão:** transcrição, normalização, segmentação e SRT vivem no engine Python. React não replica essas regras.

**Motivo:** determinismo, testes, reuso e isolamento do Whisper da interface.

## D-003 — Local-first, sem API paga no MVP

**Decisão:** `faster-whisper` local é o motor inicial. Depois que o modelo estiver baixado, o fluxo deve funcionar prioritariamente offline.

**Fora do escopo atual:** backend, conta, assinatura e serviço pago de ASR.

## D-004 — Word timestamps são a base temporal

**Decisão:** `WordToken[]` com timestamps por palavra é a fonte de verdade do pipeline de captions.

**Consequência:** segmentação não inventa tempos arbitrários e não deve destruir timestamps originais sem necessidade.

## D-005 — SUPERADA: ~12 caracteres como preferência

**Status:** superada por D-011 em 17/08/2026.

A primeira versão usava aproximadamente 12 caracteres por caption como preferência. O teste real levou à mudança de produto para contagem explícita de palavras.

## D-006 — Regras ES-PY guiadas por regressão

**Decisão:** toda correção linguística importante deve nascer de um caso reproduzível e ganhar teste.

**Motivo:** impedir que uma nova heurística conserte um vídeo e quebre outros.

## D-007 — Premiere-safe é requisito estrutural

**Decisão:** nenhum SRT pode ser exportado com cue vazio, duração zero, overlap ou timestamp regressivo.

**Consequência:** validação final é obrigatória antes da gravação do arquivo.

## D-008 — Sem sobrescrita silenciosa

**Decisão:** o app nunca substitui automaticamente a mídia original ou um SRT existente sem confirmação explícita.

## D-009 — GitHub é a fonte de verdade técnica

**Decisão:** código, regras críticas, roadmap, status e decisões devem estar no repositório.

**Notion:** usado como painel visual de acompanhamento. Ele não pode ser a única fonte de uma regra necessária para outra IA continuar o projeto.

## D-010 — Mudanças de IA passam por branch/PR

**Decisão:** agentes devem trabalhar em branch dedicada e propor PR. A `main` representa o último estado aceito.

**Motivo:** permitir revisão, rollback e impedir que um agente destrua o estado estável enquanto experimenta.

## D-011 — Segmentação por quantidade de palavras

**Decisão:** o controle de segmentação exposto ao usuário passa a ser `1`, `2`, `3` ou `4` palavras por caption. Contagem por caracteres deixa de ser a abordagem principal.

**Opções independentes:**
- ignorar preposições na contagem;
- manter/remover pontuação;
- formatar valores monetários redondos no padrão `N mil`.

**Regra de precedência:** valores monetários reconhecidos são sempre captions isoladas. A regra monetária vence a contagem de palavras e a regra de preposições. Ex.: `con 50 mil` → `con` / `50 mil`.

**Regra de moeda:** quando a opção `N mil` estiver ligada, `guaraníes`/`guaranies`, `₲` e marcadores equivalentes servem para reconhecer a moeda, mas não aparecem depois do valor final. Ex.: `200 mil guaraníes` → `200 mil`.

**Segurança:** a transformação só deve ocorrer quando houver evidência de valor monetário. Números comuns não podem ser reinterpretados silenciosamente como dinheiro.
