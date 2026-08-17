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
- mostrar progresso/estado;
- solicitar operações ao engine;
- pré-visualizar palavras e captions;
- escolher destino de exportação.

A UI **não** decide como o texto é segmentado nem valida SRT por conta própria.

### `engine/transcription`
Responsável por:

- carregar modelo `faster-whisper`;
- detectar/receber idioma;
- produzir timestamps por palavra;
- normalizar a resposta para `WordToken`;
- selecionar runtime CPU/CUDA via CTranslate2.

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
- duração e integridade temporal;
- balanceamento final;
- comportamento determinístico e coberto por regressão.

### `engine/srt`
Responsável por:

- validar cues;
- formatar timestamps;
- impedir overlap e regressão;
- renderizar UTF-8;
- exportar sem sobrescrever silenciosamente.

## Contratos principais

`WordToken` é a unidade temporal retornada pela transcrição e a entrada do segmentador.

`CaptionCue` é a unidade de caption resultante da segmentação e validada antes de renderizar SRT.

Pipeline pretendido:

```text
media
  -> transcription
  -> WordToken[]
  -> normalization/segmentation
  -> CaptionCue[]
  -> srt validation/render
  -> .srt
```

A UI consome DTOs serializáveis e nunca objetos internos do Whisper.

## IPC Desktop ↔ Engine

Durante o desenvolvimento, Electron executa o Python como subprocesso e recebe JSON do CLI do engine.

O desktop já expõe operações para:

- `health`;
- inspeção de `runtime`;
- seleção local de mídia;
- `transcribe`, retornando palavras e captions.

Quando existe `.venv\Scripts\python.exe` no repositório, o Electron deve preferir esse Python ao Python global.

### Regras para evolução do protocolo

Antes de tornar o fluxo mais complexo:

- manter stdout reservado para payload JSON quando necessário;
- enviar logs/erros por canal separado ou stderr;
- tratar cancelamento e progresso explicitamente;
- não acoplar componentes React ao formato interno do Whisper;
- manter erros serializáveis/tipados;
- definir versionamento se o contrato começar a persistir entre releases;
- decidir empacotamento do Python/modelo somente na fase de distribuição Windows.

## Mudanças arquiteturais

Qualquer proposta que mova responsabilidades entre camadas, introduza backend/cloud/API paga, troque a stack principal ou altere o produto standalone precisa de autorização explícita e registro em `docs/DECISIONS.md`.
