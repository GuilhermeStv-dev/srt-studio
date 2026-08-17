# Continuidade com outra IA

Este documento existe para trocar de agente/modelo sem perder escopo nem permitir que a nova IA "reinvente" o projeto.

## O que a IA precisa acessar

A IA deve ter acesso à pasta clonada do repositório ou ao GitHub. Só estar dentro do VS Code não transmite contexto automaticamente; ela precisa conseguir **ler os arquivos do workspace** e executar comandos/testes.

O contexto crítico está versionado no próprio repositório.

## Prompt de entrada recomendado

Cole isto na primeira mensagem de qualquer novo agente:

```text
Você vai continuar o projeto SRT Studio existente. Não comece a programar ainda.

Antes de propor qualquer alteração:
1. leia AGENTS.md;
2. leia docs/PRODUCT_RULES.md;
3. leia docs/ARCHITECTURE.md;
4. leia docs/ROADMAP.md;
5. leia docs/STATUS.md;
6. leia docs/HANDOFF.md;
7. leia docs/DECISIONS.md;
8. veja os últimos commits com git log --oneline -10;
9. rode os testes do engine, npm run typecheck e npm run build.

Depois me responda somente com:
- sua compreensão do produto;
- fase atual;
- o que já está pronto;
- o que ainda falta;
- próxima tarefa permitida;
- quais arquivos pretende alterar;
- riscos da mudança.

Não mude stack, escopo, arquitetura ou regras de produto sem me pedir autorização.
Não faça commit/merge direto na main: trabalhe em branch ai/<nome-da-tarefa>.
Qualquer regra linguística nova precisa de teste de regressão.
Só comece a editar depois desse diagnóstico.
```

## Como verificar se a IA entendeu

Antes de deixá-la editar, a resposta deve reconhecer explicitamente pelo menos:

- app desktop Windows standalone, não plugin Premiere;
- Electron + React + TypeScript na UI;
- Python no engine;
- `faster-whisper` local;
- ES-PY como prioridade;
- `WordToken[] -> CaptionCue[] -> SRT`;
- ~12 caracteres como preferência, não limite rígido;
- sem API paga/backend no MVP;
- testes de regressão para regras linguísticas;
- transcrição real ainda precisa validação no Windows;
- segmentador v1 já existe;
- próxima macroentrega é terminar validação/calibração e depois exportação SRT.

Se ela contradizer algum desses pontos, **não deixe editar**. Mande reler os documentos.

## Fluxo seguro de trabalho

1. Atualize o repositório: `git pull`.
2. Crie uma branch dedicada: `git switch -c ai/<tarefa>`.
3. Deixe a IA trabalhar só nessa branch.
4. Exija testes antes/depois.
5. Revise o diff.
6. Abra PR para `main`.
7. Só faça merge quando CI + preview/teste manual necessário estiverem OK.

Isso reduz muito o risco porque uma IA pode errar dentro da branch sem destruir a versão estável.

## Comandos de qualidade obrigatórios

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
npm run typecheck
npm run build
```

Para interface:

```powershell
npm run dev
```

## Quando exigir confirmação humana

Não autorize automaticamente alterações que:

- mudem arquitetura/stack;
- adicionem cloud/API/backend;
- mudem regras de captions;
- removam testes;
- reescrevam módulos inteiros sem necessidade;
- mexam em várias fases ao mesmo tempo;
- alterem formato de exportação;
- tragam dependência grande;
- modifiquem `main` diretamente.

## VS Code, LM Studio, Cursor, Codex ou outro agente

A ferramenta específica pode mudar. O requisito é o mesmo: o agente deve ter acesso ao workspace/repositório e obedecer ao protocolo acima. Alguns agentes leem `AGENTS.md` automaticamente; outros não. Por isso o **prompt de entrada sempre manda ler os arquivos explicitamente**.

## Notion

O Notion é útil para você acompanhar visualmente o roadmap/Kanban, mas uma nova IA não precisa ter acesso ao Notion para desenvolver corretamente. Se tiver acesso, deve tratá-lo como espelho de status; o repositório continua sendo a fonte técnica principal.
