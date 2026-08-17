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

## D-005 — ~12 caracteres é preferência

**Decisão:** o alvo de aproximadamente 12 caracteres por caption é uma função de custo/preferência, não uma regra rígida.

**Consequência:** integridade linguística, números, palavras longas, pausas e conectores podem justificar captions maiores/menores.

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
