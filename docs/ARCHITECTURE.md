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
- escolher destino de exportação;
- pedir confirmação de sobrescrita antes de autorizar o engine a substituir um SRT.

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
- grupos numéricos e monetários;
- futuras regras ES-PY que ocorram antes da segmentação.

### `engine/segmentation`
Responsável por transformar palavras temporizadas em cues:

- quantidade configurável de `1`, `2`, `3` ou `4` palavras por caption;
- preposições opcionalmente ignoradas na contagem;
- valores monetários reconhecidos com precedência e isolamento obrigatório;
- opção de preservar/remover somente vírgulas e pontos nas bordas;
- `¿`, `?`, `¡` e `!` sempre preservados;
- separadores internos como `50.000` e `1,5` protegidos;
- duração e integridade temporal;
- comportamento determinístico e coberto por regressão.

### `engine/srt`
Responsável por:

- validar cues;
- formatar timestamps;
- impedir overlap e regressão;
- renderizar SubRip em UTF-8;
- gravar `.srt` sem sobrescrever silenciosamente;
- aceitar overwrite somente quando explicitamente autorizado pela camada desktop/CLI.

## Contratos principais

`WordToken` é a unidade temporal retornada pela transcrição e a entrada do segmentador.

`CaptionCue` é a unidade de caption resultante da segmentação e validada antes de renderizar SRT.

Pipeline atual:

```text
media
  -> transcription
  -> WordToken[]
  -> normalization/segmentation
  -> CaptionCue[]
  -> srt validation/render
  -> UTF-8 .srt
```

A UI consome DTOs serializáveis e nunca objetos internos do Whisper.

## IPC Desktop ↔ Engine

Durante o desenvolvimento, Electron executa o Python como subprocesso e recebe JSON do CLI do engine.

O desktop expõe operações para:

- `health`;
- inspeção de `runtime`;
- seleção local de mídia;
- `transcribe`, retornando palavras e captions;
- `export-srt`, enviando `CaptionCue[]` serializável via stdin e recebendo o resultado da gravação.

Quando existe `.venv\Scripts\python.exe` no repositório, o Electron deve preferir esse Python ao Python global.

### Regras para evolução do protocolo

- manter stdout reservado para payload JSON;
- usar stderr para erros serializáveis;
- forçar UTF-8 no subprocesso;
- não acoplar componentes React ao formato interno do Whisper;
- validação SRT pertence ao engine, não à UI;
- a UI pode confirmar overwrite, mas o engine deve continuar recusando overwrite por padrão;
- tratar cancelamento e progresso explicitamente quando essas funções forem implementadas;
- definir versionamento se o contrato começar a persistir entre releases;
- decidir empacotamento do Python/modelo somente na fase de distribuição Windows.

## Mudanças arquiteturais

Qualquer proposta que mova responsabilidades entre camadas, introduza backend/cloud/API paga, troque a stack principal ou altere o produto standalone precisa de autorização explícita e registro em `docs/DECISIONS.md`.
