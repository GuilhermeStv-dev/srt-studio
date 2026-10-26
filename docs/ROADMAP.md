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

## Fase 2 — Motor de transcrição ✅

Objetivo: transformar áudio/vídeo em palavras temporizadas usando `faster-whisper`.

Entregas concluídas:

- adapter `faster-whisper` isolado;
- detecção CUDA/CPU via CTranslate2;
- `word_timestamps=True`;
- VAD por padrão;
- CLI `runtime` e `transcribe`;
- UI para escolher mídia/modelo/idioma;
- retorno `WordToken[]` serializável;
- `.venv` Python 3.12 validada no Windows;
- primeiro arquivo ES-PY real transcrito com sucesso;
- fallback CPU validado quando CUDA/cuDNN não estão completos;
- correção UTF-8 após caso real.

Observação: concluir o runtime NVIDIA/CUDA continua desejável para desempenho, mas não bloqueia o critério funcional da Fase 2 porque o pipeline local já transcreve de ponta a ponta.

Critério de saída atingido: arquivo ES-PY real transcrito no Windows produzindo `WordToken[]` coerente sem erro estrutural.

## Fase 3 — Segmentação ES-PY 🟡

Objetivo: transformar `WordToken[]` em captions legíveis e previsíveis para o workflow real.

Abordagem atual:

- controle explícito de `1`, `2`, `3` ou `4` palavras por caption;
- opção para ignorar preposições na contagem;
- captions de uma palavra são válidas;
- opção controla somente vírgulas e pontos nas bordas;
- `¿`, `?`, `¡` e `!` são sempre preservados;
- separadores internos como `50.000` e `1,5` são protegidos;
- valores monetários reconhecidos viram blocos semânticos;
- valor monetário é sempre caption isolada;
- opção para normalizar moeda em `N mil` sem sufixo `guaraníes`;
- números não monetários não devem ser alterados;
- proteção contra cues inválidos e overlap;
- preview de captions na UI;
- testes de regressão.

A antiga estratégia baseada em aproximadamente 12 caracteres foi superada pela decisão D-011.

Pendente para concluir:

- validar os controles com áudio ES-PY real;
- testar 1, 2, 3 e 4 palavras no workflow real;
- validar preposições e vírgulas/pontos em exemplos reais;
- confirmar `?`/`!` sempre preservados;
- validar `50 mil`, `100 mil`, `200 mil` e outras moedas em fala real;
- transformar qualquer comportamento considerado ruim em fixture/teste.

Critério de saída: conjunto de amostras reais gera captions aceitáveis nas configurações principais, sem regressões conhecidas e com cada regra importante coberta por teste.

## Fase 4 — SRT Premiere-safe 🟡

Objetivo: gerar e salvar SRT confiável para uso direto no Premiere.

Implementado em código:

- `CaptionCue[] -> SRT`;
- timestamps SRT válidos;
- UTF-8 sem BOM;
- CRLF no arquivo SRT;
- validação final de cue vazio/duração zero/overlap/regressão;
- comando CLI `export-srt`;
- botão **Exportar SRT** no desktop;
- seletor de destino;
- confirmação explícita antes de substituir arquivo existente;
- mensagens de sucesso/erro/cancelamento na interface.

Pendente para concluir:

- validar o fluxo no Windows real;
- abrir/importar o SRT exportado no Adobe Premiere;
- conferir acentos, `¿ ? ¡ !`, timestamps e quantidade total de captions;
- confirmar comportamento de sobrescrita no fluxo real.

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

## Fase 9 — Voz e dublagem local 💡 (proposta, pós-MVP)

**Status:** proposta registrada em `docs/DECISIONS.md` (D-016), **pendente de aprovação do usuário**. Não implementar enquanto D-016 estiver como proposta.

Objetivo: gerar locução/dublagem local sincronizada a partir dos `CaptionCue[]` que o SRT Studio já produz.

Pré-requisito: Fase 4 validada no Premiere (posição exata no roadmap a decidir na aprovação).

Etapas propostas, uma entrega pequena por vez:

1. **Spike de modelo:** comparar candidatos com licença de código e pesos compatível (ex.: Chatterbox, Kokoro) em espanhol ES-PY, medindo qualidade, velocidade em CPU/CUDA e tamanho; registrar a escolha e a licença.
2. **Adapter TTS:** `engine/tts/` em subprocesso com ambiente Python próprio; CLI `tts` que gera WAV a partir de texto; testes de contrato.
3. **Locução a partir do SRT/cues:** TTS por cue, ajuste à duração do cue (time-stretch limitado ou relatório de excesso), mix em uma faixa de áudio; nunca gerar overlap silencioso.
4. **UI:** escolher voz, gerar, ouvir e exportar áudio; lógica permanece no engine.
5. **Clonagem com consentimento:** referência fornecida pelo usuário + confirmação explícita de consentimento.
6. **Tradução (opcional, a decidir):** somente local/offline.

Fora desta fase: copiar código do VoiceStudio (AGPL-3.0), modelos com pesos não comerciais, APIs pagas/cloud.

Critério de saída (proposto): a partir de um vídeo ES-PY real, o app gera localmente uma faixa de áudio sincronizada com os cues, sem overlap, importável no Premiere, com modelo de licença registrada.

## Fora do MVP

Não implementar sem nova decisão explícita:

- plugin UXP para Premiere;
- backend/cloud;
- login/conta;
- assinatura/pagamento;
- API paga de transcrição;
- assistente de IA/chat;
- colaboração multiusuário;
- sync em nuvem;
- voz/TTS/clonagem/dublagem (proposta em D-016 / Fase 9, aguardando aprovação).

## Checkpoint atual

1. Validar no Windows a regra de vírgulas/pontos e `?`/`!` obrigatórios.
2. Transcrever o mesmo áudio ES-PY real com a configuração desejada.
3. Exportar o SRT pela interface.
4. Importar o SRT no Premiere e validar a Fase 4.
