## Objetivo

Descreva a mudança em 2–5 linhas.

## Escopo

- [ ] A mudança corresponde a uma tarefa/checkpoint existente em `docs/ROADMAP.md` ou foi autorizada explicitamente.
- [ ] Não alterei stack, arquitetura ou regras de produto sem autorização.
- [ ] Não incluí mídia de cliente, modelos, segredos, outputs, `.venv` ou caches.

## Segurança de regressão

- [ ] Li `AGENTS.md`, `docs/PRODUCT_RULES.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/STATUS.md` e `docs/HANDOFF.md`.
- [ ] Bugs/regras linguísticas corrigidos possuem teste de regressão quando aplicável.
- [ ] Não removi/desabilitei testes para fazer a mudança passar.

## Validação

- [ ] `python -m unittest discover -s tests/engine -p "test_*.py" -v`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run dev` validado no Windows quando houve mudança visual/desktop.

## Documentação

- [ ] `docs/STATUS.md` atualizado.
- [ ] `docs/HANDOFF.md` atualizado.
- [ ] `docs/ROADMAP.md` atualizado somente se um critério de fase foi atingido.
- [ ] `docs/DECISIONS.md` atualizado se houve decisão arquitetural/produto autorizada.

## Riscos / observações

Liste comportamento que ainda precisa de validação manual ou casos não cobertos.
