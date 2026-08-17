# AGENTS.md — SRT Studio

> **Este arquivo é obrigatório para qualquer IA/agente antes de alterar o projeto.**

## Missão

Construir um aplicativo desktop Windows local para transformar áudio/vídeo em **SRT confiável e rápido para edição no Adobe Premiere**, com transcrição local, segmentação previsível ES-PY e exportação Premiere-safe.

## Fonte de verdade e ordem obrigatória de leitura

Antes de editar qualquer arquivo, leia nesta ordem:

1. `AGENTS.md` — regras operacionais do agente.
2. `docs/PRODUCT_RULES.md` — comportamento inegociável do produto.
3. `docs/ARCHITECTURE.md` — limites entre UI, engine e exportação.
4. `docs/ROADMAP.md` — plano completo, fases e critérios de saída.
5. `docs/STATUS.md` — estado técnico atual.
6. `docs/HANDOFF.md` — último checkpoint e próxima tarefa.
7. `docs/DECISIONS.md` — decisões arquiteturais já tomadas.
8. testes relacionados à área que será alterada.

O **GitHub é a fonte de verdade técnica**. O Notion é um painel visual/espelho de acompanhamento; uma IA não deve depender do Notion para descobrir regras essenciais.

## Estado atual resumido

- Fundação: concluída.
- Fase 2 — transcrição: pipeline real já validado no Windows; CUDA ainda pode usar fallback CPU enquanto o runtime NVIDIA não estiver completo.
- Fase 3 — segmentação ES-PY: abordagem atual usa quantidade explícita de palavras e opções de preposição/pontuação/moeda.
- Preview Electron: validado no Windows.
- O fluxo atual chega a `WordToken[] -> normalização -> CaptionCue[]` e mostra captions no desktop.

**Não reimplemente etapas já concluídas.** Consulte `docs/STATUS.md` antes de assumir que algo falta.

## Stack e limites

- Electron + React + TypeScript: interface desktop.
- Python: engine.
- faster-whisper + CTranslate2: transcrição local.
- IPC/subprocesso: ponte desktop ↔ engine.

A UI configura, dispara operações e exibe resultados. **Regras de transcrição, normalização, segmentação e SRT pertencem ao engine Python.**

## Regras inegociáveis

- Não mover lógica de transcrição/segmentação/SRT para React.
- Não transformar o projeto em plugin UXP/Premiere; o produto atual é desktop standalone.
- Não adicionar backend, conta, assinatura, telemetria ou API paga ao MVP.
- Não sobrescrever mídia ou SRT original silenciosamente.
- Não gerar cue vazio, duração zero, overlap ou timestamp regressivo.
- O controle principal de segmentação é **1, 2, 3 ou 4 palavras por caption**; a antiga abordagem de ~12 caracteres foi superada.
- A opção **ignorar preposições na contagem** permite que a preposição permaneça com outra palavra sem consumir uma vaga, exceto quando a regra monetária exigir separação.
- Captions de uma única palavra são válidas.
- O usuário pode manter ou remover pontuação; a remoção não pode destruir separadores internos de números.
- **Valores monetários reconhecidos são sempre captions isoladas.** Ex.: `con 50 mil` deve virar `con` / `50 mil`, independentemente do alvo e da opção de preposição.
- Quando a opção monetária `N mil` estiver ligada, `₲200.000`, `200.000 guaraníes`, `200 mil guaraníes` ou `doscientos mil guaraníes` podem virar `200 mil`; nunca `200 mil guaraníes`.
- Normalização monetária não pode alterar números comuns sem evidência de moeda/contexto financeiro.
- Toda correção linguística importante deve incluir teste de regressão.
- Não adicionar dependência pesada sem justificativa explícita.
- Não commitar modelos, mídia de cliente, outputs, segredos, `.venv` ou caches.
- Não mudar stack, escopo do MVP ou arquitetura sem autorização explícita do usuário e registro em `docs/DECISIONS.md`.

## Fluxo obrigatório para agentes

### Antes de codar

1. Execute `git status` e confirme que entende mudanças locais existentes.
2. Leia os documentos da seção **Fonte de verdade**.
3. Execute os testes atuais:
   - `python -m unittest discover -s tests/engine -p "test_*.py" -v`
   - `npm run typecheck`
   - `npm run build`
4. Resuma em poucas linhas: estado atual, tarefa escolhida e arquivos que pretende alterar.
5. Trabalhe em branch dedicada, por exemplo `ai/export-srt` ou `ai/calibrate-segmentation`.

### Durante a implementação

- Faça **uma entrega pequena por vez**; não avance várias fases por iniciativa própria.
- Prefira mudanças reversíveis e contratos explícitos.
- Antes de corrigir um bug de segmentação, crie um teste que reproduza o caso.
- Não desabilite, apague ou afrouxe testes para fazer a CI passar.
- Não altere comportamento fora do escopo da tarefa sem registrar e justificar.

### Antes de considerar concluído

Obrigatório:

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
npm run typecheck
npm run build
```

Se a UI mudou, o preview `npm run dev` precisa ser validado no Windows pelo usuário quando o agente não puder inspecioná-lo diretamente.

Atualize:

- `docs/STATUS.md` com o que efetivamente mudou;
- `docs/HANDOFF.md` com o próximo checkpoint;
- `docs/ROADMAP.md` somente se um critério de fase foi atingido;
- `docs/DECISIONS.md` somente para decisão arquitetural/produto relevante.

Abra PR e descreva testes e riscos. **Não faça merge automático na `main`.**

## Regra de parada

Pare e peça decisão do usuário se a tarefa exigir qualquer uma destas mudanças:

- trocar Electron/React/Python/faster-whisper;
- introduzir API/cloud/backend/autenticação;
- mudar a política de captions ou regras ES-PY de produto;
- alterar formato/semântica de exportação;
- remover compatibilidade Windows/local-first;
- reestruturar módulos principais;
- aceitar regressão para “resolver depois”.

## Próximo checkpoint autorizado

Validar no Windows a nova segmentação por palavras usando o mesmo áudio real ES-PY, incluindo preposições, pontuação e valores monetários. Depois, implementar **exportação SRT pela interface** conforme `docs/ROADMAP.md`.
