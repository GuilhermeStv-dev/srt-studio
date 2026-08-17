# Roadmap — SRT Studio

Este arquivo descreve o **plano completo do MVP** e serve como referência para qualquer agente continuar o projeto sem depender de conversas anteriores.

## Princípio de execução

Uma fase só é considerada concluída quando seus critérios de saída foram atendidos. Agentes não devem pular fases ou expandir escopo sem autorização do usuário.

## Fase 1 — Fundação ✅

Objetivo: criar uma base sustentável para desenvolvimento local.

Entregas:

- repositório GitHub;
- Electron + React + TypeScript;
- engine Python separado;
- modelos `WordToken` e `CaptionCue`;
- IPC Electron ↔ Python;
- testes e CI;
- documentação e bootstrap Windows.

Critério de saída: projeto roda em modo dev, engine responde ao health-check e CI valida engine + desktop.

## Fase 2 — Motor de transcrição 🟡

Objetivo: transformar áudio/vídeo em palavras temporizadas usando `faster-whisper`.

Entregas já implementadas:

- adapter `faster-whisper` isolado;
- detecção CUDA/CPU via CTranslate2;
- `word_timestamps=True`;
- VAD por padrão;
- CLI `runtime` e `transcribe`;
- UI para escolher mídia/modelo/idioma;
- retorno `WordToken[]` serializável.

Pendente para concluir:

- validar `.venv` e `faster-whisper` em Windows real;
- confirmar CUDA/compute type;
- transcrever arquivo ES-PY real;
- medir tempo, RAM/VRAM e erros relevantes;
- registrar pelo menos uma fixture/caso real de regressão.

Critério de saída: um arquivo ES-PY real é transcrito no Windows e produz `WordToken[]` coerente sem erro estrutural.

## Fase 3 — Segmentação ES-PY 🟡

Objetivo: transformar `WordToken[]` em captions legíveis e previsíveis.

Entregas já implementadas:

- segmentador determinístico com programação dinâmica;
- alvo padrão ~12 caracteres como preferência;
- hard limit separado;
- preferência por pausas e `?`/`!`;
- penalidade para conectores/preposições/artigos isolados ou pendurados;
- proteção contra cues inválidos e overlap;
- preview de captions na UI;
- testes sintéticos de regressão.

Pendente para concluir:

- calibrar com áudio ES-PY real;
- adicionar fixtures de cortes ruins reais;
- validar grupos numéricos/monetários e expressões frequentes;
- revisar duração, balanceamento final e pausas.

Critério de saída: conjunto de amostras reais gera captions aceitáveis sem regressões conhecidas, com cada regra importante coberta por teste.

## Fase 4 — SRT Premiere-safe ⬜

Objetivo: gerar e salvar SRT confiável para uso direto no Premiere.

Entregas:

- `CaptionCue[] -> SRT`;
- timestamps SRT válidos;
- UTF-8;
- validação final de cue vazio/duração zero/overlap/regressão;
- botão **Exportar SRT** no desktop;
- seletor de destino;
- nunca sobrescrever silenciosamente arquivo existente;
- mensagens de erro claras.

Critério de saída: SRT exportado abre/importa corretamente no Premiere e passa a validação automatizada.

## Fase 5 — Desktop funcional ⬜

Objetivo: transformar o spike técnico em fluxo completo de uso.

Entregas:

- drag-and-drop e seleção de mídia;
- progresso/cancelamento de transcrição;
- estados de erro e retry;
- preview completo de captions;
- ajuste básico de presets;
- histórico somente da sessão, se necessário;
- fluxo claro selecionar → transcrever → revisar → exportar.

Critério de saída: usuário consegue concluir o fluxo principal sem terminal após o ambiente estar instalado.

## Fase 6 — UX/UI ⬜

Objetivo: refinar experiência visual sem deslocar lógica do engine.

Direção:

- desktop limpo e rápido;
- inspiração em ferramentas modernas de transcrição, sem copiar identidade;
- foco em leitura de captions, progresso e configuração essencial;
- evitar interface sobrecarregada.

Critério de saída: fluxo principal é compreensível sem instrução técnica e não esconde estados importantes.

## Fase 7 — Calibração e regressão ⬜

Objetivo: tornar o produto confiável para o workflow real de edição.

Entregas:

- corpus/fixtures seguros e pequenos;
- casos ES-PY frequentes;
- números e moedas;
- perguntas/exclamações;
- pausas e fala rápida;
- vídeos reais curtos;
- métricas de tempo e uso de hardware;
- regressão para bugs corrigidos.

Critério de saída: nenhuma correção relevante depende apenas de heurística não testada.

## Fase 8 — Distribuição Windows ⬜

Objetivo: entregar uma aplicação instalável e sustentável.

Entregas:

- estratégia de empacotamento do Python/engine;
- estratégia de modelos locais e download inicial;
- instalador Windows;
- diretórios de cache/configuração;
- atualização/versionamento;
- documentação de instalação e troubleshooting.

Critério de saída: instalação limpa em outra máquina Windows sem depender do ambiente de desenvolvimento.

## Fora do MVP

Não implementar sem nova decisão explícita:

- plugin UXP para Premiere;
- backend/cloud;
- login/conta;
- assinatura/pagamento;
- API paga de transcrição;
- assistente de IA/chat;
- colaboração multiusuário;
- sync em nuvem.

## Checkpoint atual

1. Validar transcrição ES-PY real no Windows.
2. Revisar captions e transformar cortes ruins em regressão.
3. Concluir Fases 2 e 3.
4. Implementar Fase 4: exportação SRT pela interface.
