# Arquitetura do SRT Studio

## Princípios

1. **Engine independente da interface.** O React nunca implementa regras de transcrição, segmentação ou SRT.
2. **Local-first.** O MVP não exige servidor, conta, assinatura ou API paga.
3. **Determinismo.** Mesma entrada + mesmo preset devem produzir a mesma segmentação.
4. **Premiere-safe.** Nenhum SRT pode sair com cue vazio, duração zero, overlap ou tempo regressivo.
5. **Testes para regras de linguagem.** Toda correção importante de ES-PY deve ganhar fixture e regressão.
6. **Sem sobrescrita silenciosa.** Exportações devem gerar novo arquivo ou exigir confirmação explícita.

## Camadas

### `apps/desktop`
Responsável somente por experiência desktop:

- abrir arquivos;
- configurar transcrição e segmentação;
- mostrar progresso;
- solicitar operações ao engine;
- pré-visualizar resultado;
- escolher destino de exportação.

### `engine/transcription`
Responsável por:

- carregar modelo `faster-whisper`;
- detectar/receber idioma;
- produzir timestamps por palavra;
- normalizar a resposta para `WordToken`.

Nenhuma regra de caption deve morar aqui.

### `engine/normalization`
Responsável por limpeza textual conservadora:

- espaços;
- ponto final indesejado;
- pontuação configurável;
- grupos numéricos e monetários;
- futuras regras ES-PY.

### `engine/segmentation`
Responsável por transformar palavras temporizadas em cues:

- preferência de ~12 caracteres;
- limites flexíveis e hard limits separados;
- conectores ligados à palavra semanticamente relacionada;
- pausas da fala;
- duração mínima/máxima;
- balanceamento final.

### `engine/srt`
Responsável por:

- validar cues;
- formatar timestamps;
- impedir overlap e regressão;
- renderizar UTF-8;
- exportar sem sobrescrever silenciosamente.

## Contrato inicial

`WordToken` é a unidade de entrada do segmentador.

`CaptionCue` é a unidade validada antes de renderizar SRT.

A UI deve consumir DTOs serializáveis e não objetos internos do Whisper.

## IPC Desktop ↔ Engine

Durante o desenvolvimento, Electron executa o Python como subprocesso e troca JSON por stdout/stdin. A primeira implementação expõe apenas `health`.

Antes de expandir o protocolo:

- definir mensagens versionadas;
- tratar cancelamento;
- encaminhar progresso sem misturar logs com JSON;
- definir erros tipados;
- decidir empacotamento do Python/modelo para distribuição Windows.
