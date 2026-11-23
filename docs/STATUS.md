# Estado atual

Última atualização: 2026-08-28

## Fase

**2. Motor de transcrição — concluído funcionalmente**  
**3. Segmentação ES-PY — concluída funcionalmente; calibração contínua por regressão**  
**4. SRT Premiere-safe — exportação validada no Windows, aguardando importação no Premiere**  
**5. Desktop funcional — implementação principal concluída, validações reais pendentes**  
**6. UX/UI — refinamento final**  
**7. Calibração e regressão — infraestrutura ativa**  
**8. Distribuição Windows — em andamento**

## Fundação concluída

- [x] Repositório GitHub e estrutura inicial
- [x] Electron + React + TypeScript
- [x] Engine Python separado
- [x] IPC Electron ↔ Python
- [x] CI engine + desktop
- [x] Bootstrap Windows
- [x] Documentação de arquitetura/handoff

## Transcrição

- [x] `faster-whisper` local
- [x] `word_timestamps=True`
- [x] VAD por padrão
- [x] runtime CUDA/CPU via CTranslate2
- [x] fallback CPU validado no Windows
- [x] UTF-8 preservando `¿`, `¡` e acentos
- [x] progresso real durante inferência
- [x] cancelamento do subprocesso ativo
- [x] reparo de timestamps colapsados por arredondamento, incluindo caso `¿Tenés` com duração zero
- [x] `av>=11,<19` fixado: PyAV 19 removeu `metadata_errors`, que o faster-whisper 1.2.x passa a `av.open`; builds novos (macOS e Windows) não conseguiam decodificar áudio. Regressão em `tests/engine/test_audio_decode.py` (roda onde o extra `transcription` está instalado)
- [ ] smoke de transcrição no pacote Windows (hoje só o macOS transcreve na CI)
- [ ] concluir CUDA/cuDNN para inferência GPU na RTX

## Segmentação ES-PY — D-012

- [x] alvo configurável de `1`, `2`, `3` ou `4` palavras
- [x] alvo é preferência forte, não corte mecânico
- [x] fronteiras escolhidas por programação dinâmica
- [x] cadência baseada em gaps de timestamps
- [x] coesão curta para pares como `¿qué tal?`
- [x] pausa forte vence coesão
- [x] preposições podem ser ignoradas na contagem
- [x] `¿`, `?`, `¡`, `!` sempre preservados
- [x] opção controla somente vírgulas e pontos
- [x] valores monetários reconhecidos são sempre isolados
- [x] normalização opcional `N mil`
- [x] trava visual universal de 17 caracteres para captions com mais de uma palavra física
- [x] cues positivos, sem overlap e sem regressão
- [x] preset `ES-PY · Dinâmico` validado pelo usuário como adequado ao workflow real
- [x] coesão curta calibrada para `acá tenemos` quando falado colado
- [x] dígitos simples de contagem/chamada isolados em captions próprias

A Fase 3 está funcionalmente concluída. Cortes ruins reais como `CONFIANZUDO TAMBIÉN`, `Acá` / `tenemos` e contagens `5 4 3 2 1` viraram regressões.

## Calibração e regressão

- [x] runner genérico em `tests/engine/test_segmentation_fixtures.py`
- [x] fixtures JSON em `tests/fixtures/segmentation/`
- [x] trecho real usado na D-012 convertido em fixture
- [x] pausa forte vencendo coesão como fixture
- [x] isolamento monetário como fixture
- [x] fluxo documentado em `docs/CALIBRATION.md`
- [ ] ampliar corpus somente quando surgirem novos casos reais relevantes
- [ ] adicionar métricas de tempo/hardware em etapa posterior

Cada novo corte considerado ruim deve virar uma fixture mínima antes de alterar pesos ou heurísticas. Não commitar mídia de cliente; usar apenas os `WordToken`s/timestamps necessários.

## SRT Premiere-safe

- [x] renderer e validação final
- [x] UTF-8 sem BOM
- [x] CRLF
- [x] stdin/stdout/stderr do CLI forçados em UTF-8
- [x] exportação pela interface
- [x] `Save As`
- [x] confirmação explícita de sobrescrita
- [x] exportação real validada no Windows
- [ ] importar SRT no Adobe Premiere e confirmar acentos, timestamps, sincronia e quantidade de captions

## Desktop funcional

- [x] seleção e drag-and-drop de mídia
- [x] preview completo e rolável
- [x] progresso e cancelamento
- [x] retry sem perder arquivo/configuração
- [x] presets padrão e personalizados persistidos localmente
- [x] fluxo selecionar → transcrever → revisar → exportar
- [ ] validar cancelamento, retry e persistência dos presets em uso prolongado no Windows

### Fluxo em 3 etapas — D-017 (aprovada)

- [x] entrega 1: comando `segment` no engine (`WordToken[]` revisados + opções via stdin → `CaptionCue[]`), com cadeia compartilhada em `engine/pipeline.py`; `transcribe` usa a mesma cadeia e continua devolvendo `captions`
- [x] entrega 2: UI guarda todas as `words` e as opções que geraram as legendas; ao mudar densidade/preposições/pontuação/moeda aparece “Regerar legendas”, que chama `segment` via IPC `engine:segment` sem retranscrever (confirmação se houver edição manual)
- [ ] validar a entrega 2 no `npm run dev` do Windows

### Troca de fala, sincronização robusta e interface mínima — D-020

- fim de frase (`? ! … .`) e fim de parágrafo são fronteiras obrigatórias de caption ("¿verdad?" / "Sí");
- etapa Texto: Enter divide parágrafo (separa falas), Backspace no início junta;
- alinhamento com margem de 1,5 s + estados "lixo": pior erro com janelas do Whisper deslocadas caiu de 589 ms para 57 ms;
- caption fica na tela até a próxima quando a fala segue (≤ 0,6 s) ou +0,3 s numa pausa, sem overlap;
- interface sem textos técnicos/redundantes.

### Transcrição e legendas separadas — D-019

- `transcribe-text`: faster-whisper sem `word_timestamps`, devolve só parágrafos de texto;
- `caption`: alinhamento forçado CTC (wav2vec2 ONNX + Viterbi em numpy) do texto revisado com o áudio, depois a segmentação de sempre;
- medição em fala real ES: erro no início das frases caiu de 144 ms (máx. 390 ms) para 20 ms (máx. 52 ms);
- desktop: Transcrever → **Texto** (parágrafos editáveis livremente) → **Gerar legendas** → editor de legendas; editar o texto depois marca as legendas como desatualizadas;
- CI macOS executa `transcribe-text` + `caption` no engine empacotado; CI engine roda a suíte `test_alignment.py` com numpy.

### Sincronização MMS fp32 — D-026 (D-024 revogada)

- [x] MMS_FA da Meta exportado para ONNX fp32 (`scripts/export_mms_onnx.py`), usado quando está em `%LOCALAPPDATA%\SRTX\models\mms-fa`
- [x] números pela forma falada, legendas com no mínimo 3 frames, conjunções puxam a palavra seguinte (D-025)
- [x] palavra nunca atravessa silêncio ≥ 0,2 s; encaixe nos silêncios limitado a 250 ms
- [x] medição do vídeo inteiro (`scripts/benchmark_sync.py`): erro mediano 272 → 0 ms; retomadas fora 15/20 → 5/20
- [x] reserva do Whisper (D-024) removida: piorava a medição
- [ ] usuário validar no Premiere
- [ ] hospedar o modelo para download no primeiro uso (outros computadores / instalador)

### Alinhamento global — D-023

- [x] modelo de sincronização roda no áudio inteiro; um único Viterbi encaixa o texto todo (sem cascata entre parágrafos)
- [x] estado "lixo" entre palavras absorve fala não transcrita
- [x] áudio real: "Edgar"/"Tengo"/"¿Están" voltaram ao lugar (erros de até ~1 s eliminados)
- [ ] usuário validar no Premiere

### Ritmo pelo mapa de fala — D-022

- [x] silêncios reais medidos no áudio (`engine/alignment/speech.py`) depois do alinhamento
- [x] bordas das palavras encostadas nos silêncios; `WordToken.pause_after` com a pausa medida
- [x] segmentação corta por blocos de fala: nenhuma legenda atravessa um silêncio ≥ 80 ms
- [x] áudio real: erro mediano nas pausas 0 ms (antes 34/−67 ms); legendas cruzando pausa 3 → 1
- [ ] usuário validar no Premiere com o painel em vídeos com ritmos diferentes (fala rápida, música de fundo)
- [ ] "Mercado 4" ainda isola o "4" pela regra de contagem regressiva; avaliar nome/lugar + número

### Painel do Premiere — D-021

- [x] painel CEP em `apps/premiere-panel` (manifest, `host.jsx`, interface Áudio → Texto → Legendas, tema escuro que acompanha o Premiere)
- [x] renderiza o áudio da sequência (inteira ou In/Out) com o preset WAV 16 kHz do Premiere e chama `transcribe-text` / `caption` / `segment` / `export-srt` do mesmo engine
- [x] grava o SRT em `<projeto>/SRTX Legendas/` (nome novo a cada vez) e cria a trilha de legendas com `createCaptionTrack`
- [x] `scripts/install-premiere-panel.ps1` liga o painel do repositório ao Premiere (junction + `PlayerDebugMode`)
- [x] interface validada em navegador no modo demonstração (fora do Premiere)
- [x] validado dentro do Premiere pelo usuário (fluxo de legendas)
- [x] aba **Som**: biblioteca de efeitos e músicas (`js/library.js`) com busca, categorias, prévia e inserção na agulha (`srtx_insertSound`, overwrite na trilha escolhida ou na primeira livre). Pasta da biblioteca: localStorage, senão `%APPDATA%\SRTX\sound-library.json`
- [ ] validar a aba Som dentro do Premiere
- [ ] empacotar `.zxp` assinado e instalar junto com o SRTX

### Ícone "Sx"

- [x] quadrado roxo profundo com `Sx` em Adobe Clean ExtraBold (`assets/branding`), usado no `.ico`/`.icns`, na barra lateral e no painel
- [ ] gerar novo instalador para o ícone aparecer no SRTX instalado

### Identidade visual — D-018

- [x] tema claro inspirado no ElevenLabs: barra lateral com etapas, barra superior com ações, painel de configurações, área de soltar arquivo, editor de legendas em linhas com tempo `mm:ss.cc` e contagem de caracteres (destaque acima de 17 com mais de uma palavra)
- [x] Inter + Geist Mono locais (`@fontsource`); `brand.css`/`brand-overrides.css` removidos
- [ ] validar o visual no `npm run dev` do Windows
- [ ] entrega 3: navegação em etapas com confirmação antes de descartar edições de cues
- [ ] entrega 4: tela de revisão do texto (substituir/excluir palavra, destaque de `probability` baixa)
- [ ] entrega 5: player sincronizado no editor de legendas

## UX/UI

- [x] layout desktop em duas colunas para origem + configuração
- [x] preview em largura total
- [x] redução de ruído visual
- [x] detalhes de runtime/engine ocultos quando saudáveis
- [x] WordTokens/timestamps brutos removidos da experiência normal
- [x] explicações técnicas de progresso removidas da experiência normal
- [x] checkboxes de opções trocados por toggle buttons acessíveis
- [x] progresso percentual da transcrição refletido na barra de tarefas do Windows
- [x] cards de opções compactos com explicação sob demanda via `?`
- [x] toggles revisados sem estado verde de seleção e com ajuda em popover flutuante
- [x] preview de captions editável antes da exportação
- [x] coluna lateral do preview mostra caracteres da caption em vez de índice
- [ ] remover os últimos sinais de build/dev da versão final
- [ ] revisar estados vazios, erro e sucesso antes da distribuição pública

## Distribuição Windows

- [x] estratégia documentada em `docs/DISTRIBUTION.md`
- [x] engine Python standalone via PyInstaller `onedir`
- [x] build standalone validado em CI `windows-latest`
- [x] health-check executado no `srt-studio-engine.exe` gerado pela CI
- [x] Electron usa engine standalone quando `app.isPackaged`
- [x] configuração Electron Forge + Squirrel criada
- [x] comando `npm run make:win`
- [x] CI preparada para gerar e publicar artefato do instalador
- [x] janela/taskbar do Windows apontam para o `.ico` do SRTX quando disponível
- [x] `npm run dev` gera assets de ícone SRTX antes de abrir o Electron
- [x] primeiro `SRTX-Setup.exe` gerado localmente em Windows
- [x] engine standalone validado dentro do pacote local
- [x] `SRTX-Setup.exe` passou pela CI Windows
- [x] `SRTX-Setup.exe` publicado em GitHub Release permanente: `v0.2.0-internal.1`
- [x] `SRTX-Setup.exe` 0.2.1 gerado localmente com trava visual/toggle/progresso taskbar
- [x] `SRTX-Setup.exe` 0.2.2 gerado localmente com editor de captions, contagem visual e calibração de ritmo/contagem
- [x] `SRTX-Setup.exe` 0.2.3 gerado localmente com correção visual dos toggles/popovers
- [x] `SRTX-macOS-arm64.zip` gerado e validado pela CI macOS (arm64)
- [ ] instalar e validar o Setup em Windows real
- [ ] validar transcrição/exportação sem Python/Node instalados
- [ ] definir política final de cache/download de modelos
- [ ] avaliar code signing antes de distribuição pública

CUDA/cuDNN não bloqueiam o instalador: em ausência do runtime GPU correto, o fallback CPU deve continuar funcionando.

## Validação automatizada

A CI principal executa:

```powershell
python -m unittest discover -s tests/engine -p "test_*.py" -v
python -m engine.cli health
npm run typecheck
npm run build
```

A CI Windows de distribuição também constrói o engine standalone e o instalador.

As regressões cobrem transcrição, segmentação inteligente, pontuação, moeda, progresso, exportação SRT e o contrato do comando `segment` (fixtures de calibração, igualdade `transcribe` × `segment`, payloads inválidos).

## Próximos checkpoints

1. instalar o Setup e executar o fluxo completo fora de `npm run dev`;
2. importar um SRT no Premiere e fechar Fase 4;
3. validar cancelamento/retry/presets no aplicativo instalado;
4. concluir os últimos sinais de build/dev da Fase 6;
5. concluir CUDA/cuDNN como melhoria de desempenho;
6. decidir assinatura digital e política de atualização antes da distribuição pública.

## Preview local

```powershell
git pull
npm install
npm run dev
```

Setup completo de desenvolvimento:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```

Build do instalador Windows:

```powershell
npm run make:win
```
