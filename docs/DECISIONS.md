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

## D-005 — SUPERADA: ~12 caracteres como preferência

**Status:** superada por D-011 em 17/08/2026.

A primeira versão usava aproximadamente 12 caracteres por caption como preferência. O teste real levou à mudança de produto para contagem explícita de palavras.

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

## D-011 — Segmentação por quantidade de palavras

**Status:** refinada por D-012 em 17/08/2026.

**Decisão original:** o controle exposto ao usuário passou a ser `1`, `2`, `3` ou `4` palavras por caption. Contagem por caracteres deixou de ser a abordagem principal.

**Opções independentes:**
- ignorar preposições na contagem;
- manter/remover somente vírgulas e pontos (`preserve_commas_periods`);
- formatar valores monetários redondos no padrão `N mil`.

**Pontuação obrigatória:** `¿`, `?`, `¡` e `!` são sempre preservados e não podem ser removidos pela opção de vírgulas/pontos. Separadores internos de números como `50.000` e `1,5` também são protegidos.

**Regra de precedência:** valores monetários reconhecidos são sempre captions isoladas. A regra monetária vence a contagem de palavras e a regra de preposições. Ex.: `con 50 mil` → `con` / `50 mil`.

**Regra de moeda:** quando a opção `N mil` estiver ligada, `guaraníes`/`guaranies`, `₲` e marcadores equivalentes servem para reconhecer a moeda, mas não aparecem depois do valor final. Ex.: `200 mil guaraníes` → `200 mil`.

**Segurança:** a transformação só deve ocorrer quando houver evidência de valor monetário. Números comuns não podem ser reinterpretados silenciosamente como dinheiro.

## D-012 — Segmentação inteligente: alvo + cadência + coesão curta

**Decisão:** `1`, `2`, `3` ou `4` palavras deixam de funcionar como corte mecânico e passam a ser um **alvo forte de densidade**. A fronteira final deve considerar também a pausa real entre `WordToken`s, pontuação e coesão lexical curta.

**Objetivo:** acompanhar o ritmo da fala sem destruir expressões que perdem naturalidade quando cortadas apenas por contagem.

**Exemplos com alvo de 1 palavra:**
- `Hola,` / `¿qué tal?` é preferível a `Hola,` / `¿qué` / `tal?` quando `qué tal` foi falado sem pausa relevante;
- `participar en` pode ser preferível a `participar` / `en un`;
- `un juego?` pode permanecer junto;
- `¿Quién se` / `anima?` é preferível a preservar `¿Quién se anima?` inteiro, pois a expansão inteligente deve continuar curta;
- `acá ya` pode permanecer junto quando pronunciado como bloco curto.

**Limite:** a inteligência pode deslocar a fronteira em aproximadamente uma palavra física além do alvo, mas não deve usar “frase semanticamente completa” como justificativa para gerar captions longas.

**Cadência:** pausas fortes vencem coesão. Se uma expressão normalmente ligada for pronunciada com pausa perceptível, a quebra deve ocorrer.

**Implementação MVP:** usar os gaps reais derivados de `start/end` dos `WordToken`s como sinal de cadência, com limiares adaptados ao próprio trecho. Não adicionar LLM/agente ao pipeline para essa decisão.

**Otimização:** escolher fronteiras globalmente por score/ programação dinâmica, em vez de greedy rígido por contagem.

**Regras estruturais preservadas:** moeda continua sempre isolada; `¿ ? ¡ !` continuam obrigatórios; SRT continua sem overlap/duração zero/timestamp regressivo.

## D-013 — Trava visual universal de 17 caracteres

**Decisão:** captions com mais de uma palavra física não podem ultrapassar 17 caracteres depois da renderização, contando o espaço entre palavras e a pontuação preservada.

**Motivo:** impedir casos visualmente largos demais em legendas dinâmicas, como `CONFIANZUDO TAMBIÉN`, mesmo quando a contagem de palavras, a cadência ou a coesão curta permitiriam manter o par junto.

**Interação com preposições:** ignorar preposições na contagem continua válido, mas não pode furar a parede visual. Se `palavra + espaço + preposição` passar de 17 caracteres, o segmentador deve separar.

**Exceção:** uma palavra única acima de 17 caracteres permanece permitida, porque o engine não deve alterar ou quebrar internamente uma palavra reconhecida apenas para caber no limite.

## D-014 — Preview vira editor de revisão

**Decisão:** depois da transcrição, o preview de captions deixa de ser somente leitura e passa a permitir edição manual antes da exportação.

**Motivo:** a segmentação automática deve chegar perto do ideal, mas o workflow real precisa da liberdade de revisar, dividir e excluir segmentos como em editores modernos de legenda.

**Limite:** a UI pode editar `CaptionCue[]` já gerados, mas não implementa regras linguísticas novas. A lógica automática de transcrição, normalização, segmentação e validação continua no engine Python.

**Ajuste de UX:** a coluna lateral do preview mostra a contagem exata de caracteres da caption, não o índice do segmento. Índice/timestamps são auxiliares; leitura e largura visual são o foco.

**Calibração associada:** pares curtos como `acá tenemos` podem ficar juntos quando os timestamps indicam fala colada; dígitos simples de contagem/chamada, como `5 4 3 2 1`, ficam isolados em captions próprias.

## D-015 — Build macOS Apple Silicon

**Decisão:** além do instalador Windows, o SRTX é distribuído como `SRTX.app` para macOS arm64 (M1/M2/M3…), gerado pela CI `macos-packaging.yml` em `macos-14`.

**Motivo:** permitir uso num MacBook sem transformar o produto em site/serviço e sem abrir mão do fluxo local-first (D-003).

**Como:** mesmo Electron e mesmo engine Python; o engine é empacotado com PyInstaller via `scripts/build-engine.sh`. No Mac não há CUDA: o runtime cai automaticamente para CPU `int8`.

**Limites:** app assinado apenas ad-hoc (sem Apple Developer ID/notarização). Windows continua sendo a plataforma principal de validação.

## D-016 — PROPOSTA: fase Voz/Dublagem local (pós-MVP)

**Status:** proposta, **pendente de aprovação explícita do usuário**. Enquanto este status não mudar, nenhum agente deve implementar código de TTS, clonagem ou dublagem.

**Contexto:** avaliamos o projeto open-source VoiceStudio (`debpalash/VoiceStudio`), um app local estilo ElevenLabs com Electron + backend Python, motores de voz plugáveis em subprocesso e pipeline de dublagem (transcrever → traduzir → TTS por segmento → mixar). A arquitetura é próxima da nossa, e o pipeline de dublagem reaproveita quase tudo o que o SRT Studio já faz até `CaptionCue[]`.

**Proposta:** adicionar, **depois de concluídas as fases do MVP** (no mínimo a Fase 4 validada no Premiere), uma fase de voz local cujo primeiro recurso é **locução/dublagem sincronizada a partir dos cues já gerados**, e não um gerador de voz genérico.

Pipeline proposto:

```
mídia → faster-whisper → WordToken[] → CaptionCue[]
      → [tradução opcional — a decidir]
      → TTS por cue → ajuste à duração do cue → mix → WAV/áudio + SRT
```

**Arquitetura proposta (sem mudar a stack de D-001/D-002/D-003):**
- novo módulo `engine/tts/` no engine Python, seguindo o padrão de adapter isolado de `engine/transcription/faster_whisper_adapter.py`;
- cada motor TTS roda em **subprocesso com ambiente Python próprio**, para não conflitar torch/CUDA com o `faster-whisper` (lição tirada do VoiceStudio);
- a UI React apenas configura, dispara e reproduz resultados; regras de tempo, ajuste de duração e mix pertencem ao engine;
- 100% local após download do modelo; sem API paga, conta ou backend.

**Licença — regras obrigatórias:**
- **Não copiar código do VoiceStudio.** Ele é AGPL-3.0; copiar qualquer trecho obrigaria o SRT Studio inteiro a adotar AGPL. Ele serve apenas como referência de arquitetura (reimplementação própria).
- Integração com um VoiceStudio instalado separadamente, via API HTTP local, é aceitável apenas como experimento pessoal, não como dependência do produto.
- Só adotar modelos cujo **código e pesos** permitam o uso pretendido. Pesos com licença não comercial (ex.: CC-BY-NC — caso do OmniVoice padrão do VoiceStudio) ficam fora.
- Candidatos a avaliar no spike, com licença conferida na data da decisão: Chatterbox (clonagem, multilíngue com espanhol) e Kokoro (leve, sem clonagem).
- Registrar no repositório a licença de cada modelo adotado.

**Regras de produto propostas:**
- clonagem de voz só com áudio de referência fornecido pelo usuário e confirmação explícita de consentimento do dono da voz;
- áudio gerado nunca sobrescreve mídia ou arquivos existentes sem confirmação (D-008);
- o áudio de cada cue deve caber na janela do cue ou ter regra explícita de ajuste (time-stretch limitado ou relatório de excesso); nunca gerar overlap silencioso entre falas;
- o SRT continua obedecendo D-007; a fase de voz não altera a semântica de exportação SRT.

**Questões em aberto para o usuário:**
1. Aprovar ou não a fase e sua posição no roadmap (após Fase 4, após Fase 8 ou outra).
2. Uso pretendido: pessoal/interno ou comercial (define quais modelos são aceitáveis).
3. Tradução entra no escopo? Se sim, deve ser local (ex.: modelo de tradução offline), mantendo D-003.
4. Formato de saída: só áudio dublado, áudio por cue para o Premiere, ou vídeo mixado.

## D-017 — Fluxo em 3 etapas (transcrição → revisão do texto → editor de legendas)

**Status:** aprovada pelo usuário em 26/10/2026, com as respostas registradas em **Respostas do usuário** ao final desta decisão.

**Contexto:** hoje o SRTX funciona em uma tela única. O comando `transcribe` transcreve **e** segmenta na mesma chamada e devolve `words` + `captions`. Erros de reconhecimento só podem ser corrigidos depois da segmentação, legenda por legenda, no editor de D-014. Mudar uma opção de segmentação exige transcrever de novo. O fluxo desejado é inspirado em editores modernos de transcrição/legenda (ex.: ElevenLabs): primeiro o texto, depois as legendas.

**Proposta de fluxo:**

```
1. Transcrição      mídia → WordToken[] (texto corrido com tempos por palavra)
2. Revisão do texto o usuário corrige o texto das palavras; os tempos não mudam
3. Legendas         engine segmenta o texto JÁ REVISADO → CaptionCue[]
                    → editor de legendas (D-014) + player sincronizado → Exportar SRT
```

**Engine (D-002 continua valendo):**
- novo comando CLI `segment`: recebe `WordToken[]` revisados + opções de segmentação via stdin e devolve `CaptionCue[]`, aplicando a mesma cadeia de hoje (reparo de números fragmentados, normalização monetária, segmentação e validação);
- a normalização monetária e todas as regras de D-011/D-012/D-013 rodam **sobre o texto revisado**;
- `transcribe` continua devolvendo `captions` durante a transição, para manter compatibilidade e reversibilidade; a remoção dessa saída exige nova decisão;
- para as mesmas palavras e opções, `segment` precisa produzir exatamente as mesmas captions que `transcribe` produz hoje (teste de contrato).

**Regras da revisão (etapa 2):**
- MVP: só **substituir o texto de uma palavra** (1 palavra → 1 palavra) e **excluir palavra**. `start`/`end` de cada `WordToken` nunca são alterados pela UI;
- dividir uma palavra em várias ou juntar palavras exige redistribuir tempo; isso é regra de timing e, se aprovado, será implementado no engine, não no React;
- palavras com `probability` baixa (já devolvida pelo faster-whisper) são destacadas para revisão. Sugestões nunca são aplicadas automaticamente;
- verificação ortográfica por dicionário é opcional e posterior; precisa ser local, ou com dicionário baixado uma única vez, compatível com D-003.

**Regras do editor (etapa 3):**
- continua sendo o editor de D-014 (editar, dividir, excluir cues), acrescido de player de mídia: clicar numa legenda posiciona o vídeo, e a legenda corrente fica destacada durante a reprodução;
- regerar legendas, seja ao voltar para a etapa 2 ou ao trocar opções, **descarta edições manuais de cues** e exige confirmação explícita;
- exportação continua obedecendo D-007 e D-008; a semântica do SRT não muda.

**Fora desta proposta:** identidade visual copiada do ElevenLabs (vale só o fluxo), persistência de projetos entre sessões, waveform/timeline arrastável (entrega posterior opcional), identificação de falantes.

**Respostas do usuário (aprovação de 26/10/2026):**
1. Fluxo e ordem das entregas da Fase 5: **aprovados**.
2. Dividir/juntar palavras na revisão: **fora do MVP**. A revisão só substitui (1 → 1) ou exclui palavras.
3. Verificação ortográfica por dicionário: **fora do MVP**. Basta o destaque de palavras com `probability` baixa.
4. Opções de segmentação: ficam **na etapa 3 (Legendas)**, para regerar sem retranscrever.

## D-018 — Identidade visual clara, inspirada no ElevenLabs

**Decisão:** a interface do SRTX adota a linguagem visual de editores modernos de voz/transcrição como o ElevenLabs, a pedido do usuário em 26/10/2026:
- fundo off-white quente (`#FDFCFC`/`#F5F3F1`), preto como ação primária e cinzas quentes para texto secundário;
- botões em pílula e cards com contorno de 0,5px;
- layout de app: barra lateral com etapas, barra superior com ações e painel de configurações à direita.

**Limites:**
- não usar logo, nome, ícones, imagens nem fontes proprietárias do ElevenLabs;
- títulos em Inter peso 300 com tracking negativo substituem a Waldenburg (comercial);
- Inter e Geist Mono (OFL) são empacotadas localmente via `@fontsource`, sem CDN em runtime (D-003).

**Marca SRTX preservada:** nome, ícone e o roxo `#6C3BFF` continuam; o roxo vira acento único (marca, etapa concluída, foco). As verificações de branding da CI (`SRTX`, `Guilherme Estevão Editor`, `#6C3BFF`) continuam válidas.

**Substitui:** o tema escuro roxo de `brand.css`/`brand-overrides.css`, que foram removidos.

## D-019 — Transcrição e legendas separadas; tempos por alinhamento forçado

**Status:** aprovada pelo usuário em 13/11/2026 ("a transcrição precisa acontecer separada da legenda… um raio-x do áudio para perceber o momento em que a pessoa fala a palavra").

**Problema:** as legendas chegavam ao Premiere dessincronizadas e exigiam ajuste manual. A causa é o tempo por palavra do Whisper (`word_timestamps=True`), estimado pela atenção do modelo: em medição com fala real em espanhol, o início das frases saía em média **144 ms** adiantado (máx. 390 ms), quase sempre antes da fala.

**Decisão:** o fluxo passa a ter duas etapas de engine independentes:

```
1. Transcrição   mídia → faster-whisper (sem word_timestamps) → parágrafos de texto
                 (comando `transcribe-text`)
2. Legendas      texto revisado + áudio → alinhamento forçado CTC (wav2vec2)
                 → WordToken[] com tempo medido no áudio → build_captions → CaptionCue[]
                 (comando `caption`)
```

- O alinhamento usa um modelo acústico wav2vec2 CTC por idioma, rodando no `onnxruntime` (já empacotado pelo faster-whisper), com Viterbi próprio em numpy (`engine/alignment/`). Não adiciona torch.
- Cada parágrafo é alinhado dentro da sua janela aproximada do Whisper, com margem de 0,6 s; erros ficam locais.
- Resultado medido no mesmo áudio: erro médio no início das frases de **20 ms** (máx. 52 ms), resolução de 20 ms por frame.
- Palavras sem som alinhável no vocabulário (dígitos como `50`, símbolos como `₲`) recebem tempo interpolado entre as vizinhas e `probability = null`.
- Toda a cadeia de D-011/D-012/D-013 (moeda, preposições, trava de 17 caracteres) continua rodando sobre as palavras alinhadas, sem mudança.

**Revisão do texto (substitui a regra de D-017):** como os tempos são medidos no áudio depois da revisão, o texto pode ser editado livremente (trocar, incluir ou remover palavras, mudar pontuação). A restrição "1 palavra → 1 palavra, tempos nunca mudam" de D-017 deixa de valer.

**Modelos (baixados uma vez, no primeiro "Gerar legendas", para o cache do Hugging Face; depois funcionam offline — D-003):**

| Idioma | Repositório | Arquivo | Licença |
|---|---|---|---|
| es | `XDcobra/wav2vec2-large-xlsr-53-spanish-ONNX` | `onnx/model_int8.onnx` (355 MB) | Apache-2.0 (base `jonatasgrosman/wav2vec2-large-xlsr-53-spanish`) |
| pt | `onnx-community/wav2vec2-large-xlsr-53-portuguese-ONNX` | `onnx/model_q4.onnx` (241 MB) | Apache-2.0 (base `jonatasgrosman/wav2vec2-large-xlsr-53-portuguese`) |
| en | `Xenova/wav2vec2-large-xlsr-53-english` | `onnx/model_int8.onnx` (318 MB) | Apache-2.0 (base `jonatasgrosman/wav2vec2-large-xlsr-53-english`) |

Idioma detectado fora dessa lista gera erro explícito na etapa 2; a etapa 1 continua funcionando.

**Compatibilidade:** `transcribe` (texto + legendas em uma chamada, com tempos do Whisper) e `segment` continuam disponíveis. `segment` é usado para regerar legendas com outras opções sem sincronizar de novo.

## D-020 — Troca de fala, sincronização robusta e interface mínima

**Status:** aprovada pelo usuário em 14/11/2026, a partir do retorno do primeiro uso real de D-019: legenda ~80% sincronizada; "¿verdad? Sí" (apresentadora + entrevistado quase juntos) saía numa legenda só; pedido de interface mais minimalista.

**Troca de fala / fim de frase (segmentação):**
- uma caption nunca contém o fim de uma frase e o início da seguinte: palavra terminada em `?`, `!`, `…` ou `.` (exceto abreviações como `Sr.`, `Dr.`, `etc.`; separadores numéricos como `50.000` não contam) é fronteira obrigatória;
- `WordToken.break_after` marca fronteira obrigatória. O alinhador marca a última palavra de cada parágrafo (o Whisper costuma quebrar parágrafo na troca de falante); reparo de números e normalização monetária preservam a marca;
- na etapa Texto, **Enter** divide o parágrafo no cursor (força a quebra onde o Whisper juntou dois falantes) e **Backspace** no início junta com o anterior;
- todas as captions continuam com a mesma aparência; não há identificação de falante. Diarização automática fica para depois, se ainda houver casos sem pontuação.

**Sincronização mais robusta (alinhamento):**
- a janela do Whisper sem tempo por palavra pode errar o parágrafo em mais de 1 s. A margem subiu de 0,6 s para 1,5 s, com estados "lixo" nas pontas do Viterbi que absorvem a fala vizinha (penalidade 2,0);
- medição com as janelas do Whisper deslocadas aleatoriamente até ±1,5 s: pior erro de início de frase caiu de 589 ms para 57 ms; frases com erro > 100 ms caíram de 11% para 0%.

**Exibição das captions:** o fim de palavra medido pelo alinhamento é curto (33% das palavras < 120 ms), o que fazia a legenda piscar. Se a próxima caption começa em até 0,6 s, a atual fica na tela até ela; senão, fica mais 0,3 s depois do fim da palavra. Nunca há overlap (D-007 continua valendo).

**Interface mínima (complementa D-018):** sem caminho do arquivo, versão do engine nem status de runtime (só aparece se houver erro); sem cartão de arquivo duplicado ("Trocar" ao lado do nome); sem amostra de palavras brutas; sem linha estática da trava de 17 caracteres; avisos só quando há novidade (exportação concluída/erro, texto alterado); subtítulo da barra superior reduzido a idioma e duração.

## D-021 — Painel SRTX dentro do Premiere (CEP), complementar ao desktop

**Status:** aprovada pelo usuário em 19/11/2026 ("começa o painel"), depois do estudo de painéis CEP instalados (Frame Speed, Afterflix). Revisa D-001: o produto continua desktop standalone, e ganha um painel do Premiere como segunda interface do mesmo engine.

**Por quê:** hoje é preciso exportar o áudio do Premiere, transcrever no SRTX e importar o SRT de volta. O painel faz isso dentro do Premiere: renderiza o áudio da sequência, chama o engine e insere as legendas numa trilha de captions.

**Como:**
- painel **CEP** (HTML/CSS/JS + ExtendScript) em `apps/premiere-panel/`, com Node ativado (`--enable-nodejs --mixed-context`). UXP ainda não permite iniciar processos, que é como o engine roda;
- o engine Python continua sendo a fonte de verdade: o painel usa os mesmos comandos e o mesmo contrato JSON do desktop (`transcribe-text`, `caption`, `segment`, `export-srt`). Nenhuma regra de transcrição, segmentação ou SRT vai para o painel (D-002);
- áudio: `Sequence.exportAsMediaDirect` com o preset WAV mono 16 kHz que vem com o Premiere (`Settings/EncoderPresets/WAV_Mono_16bit_16kHz.epr`), da sequência inteira ou entre In/Out;
- legendas: o engine grava o SRT (nunca sobrescreve; nome com data/hora) em `<pasta do projeto>/SRTX Legendas/`, o painel importa com `importFiles` e cria a trilha com `createCaptionTrack`;
- engine usado pelo painel: `SRT_STUDIO_ENGINE`, senão o `.venv` do repositório (desenvolvimento), senão o engine do SRTX instalado (`%LOCALAPPDATA%\SRTX\app-*`);
- local-first, sem conta, login, nuvem ou telemetria (D-003). Sem assinatura `.zxp` por enquanto: desenvolvimento com `PlayerDebugMode=1`;
- visual: tema escuro "SRTX Graphite" que acompanha a cor do Premiere, roxo só em foco/progresso/seleção, ícone `Sx`. Estrutura inspirada em painéis CEP (abas numeradas progressivas, cards, botão principal fixo), sem copiar marca, código ou assets de terceiros.

## D-022 — Ritmo pelo mapa de fala do áudio

**Status:** aprovada pelo usuário em 19/11/2026, depois do primeiro teste do painel no Premiere: "El día de" / "hoy estamos por" quando o áudio mostra "El día de hoy" / silêncio / "estamos". O usuário pediu que o app resolva isso sozinho, sempre, e não só nesse trecho.

**Diagnóstico (áudio real de 80 s, 98 legendas):** o alinhamento CTC acerta a ordem das palavras, mas erra as bordas. Perto das pausas, 65% dos inícios e 57% dos fins de palavra estavam mais de 80 ms fora da voz real, e o intervalo entre palavras não distinguia respiro de fala contínua. A segmentação decidia o ritmo sobre essa grade errada.

**Regra:**
- depois do alinhamento, o engine mede a energia do áudio em quadros de 10 ms e encontra os silêncios reais (≥ 60 ms, limiar adaptado ao nível de fala e de fundo). Sem contraste suficiente (música/ruído alto), nada muda;
- cada silêncio é ligado à fronteira de palavras mais próxima (até 250 ms): o fim da palavra da esquerda vai para o início do silêncio e o início da palavra da direita para o fim dele. A legenda passa a entrar quando a voz começa;
- `WordToken.pause_after` guarda o silêncio real depois de cada palavra (0.0 = fala contínua; `None` = não medido). Ele viaja pela normalização e pelo comando `segment`, então "Regerar legendas" mantém o ritmo;
- com pausas medidas, um silêncio a partir de 80 ms separa **blocos de fala**: nenhuma legenda atravessa um bloco. Dentro do bloco valem as regras de sempre (alvo de palavras, preposições, 17 caracteres, moeda, fim de frase). Se o bloco cabe na regra, fica junto ("El día de hoy" no alvo 3); se não cabe, divide dentro dele ("El día" / "de hoy" no alvo 2), nunca puxando palavra de outro bloco;
- terminar uma legenda em preposição custa mais com pausas medidas ("El día de" / "hoy" perde para "El día" / "de hoy").

**Resultado no mesmo áudio:** erro mediano de início/fim de palavra nas pausas caiu de 34 ms / −67 ms para 0 ms / 0 ms; palavras com erro > 80 ms caíram de 65%/57% para 37%/26%; legendas atravessando uma pausa real caíram de 3 para 1.

**Testes:** `tests/engine/test_speech_map.py` (mapa sintético, encaixe, blocos para alvos 1–4, payload `segment`) e as fixtures reais `es_py_speech_runs_target_2/3.json`.

## D-023 — Alinhamento global do texto inteiro

**Status:** aprovada pelo usuário em 19/11/2026 ("o que precisa mudar? a abordagem?"), depois do segundo teste no Premiere: "Jessica" longa, "Tengo" atrasado, "¿Están" esticado por mais de 1 s e atrapalhando todo o resto.

**Causa:** o alinhamento de D-019/D-020 encaixava cada parágrafo numa janela própria e obrigava a janela seguinte a começar depois do fim do anterior. Uma fala curta ("Jessica.", "¿Están listos?") dentro de uma janela cheia de fala alheia esticava, e o atraso se propagava em cascata para todos os parágrafos seguintes (até ~1 s).

**Abordagem nova:**
- o modelo wav2vec2 roda no áudio inteiro em blocos de 20 s com 1 s de contexto, gerando uma grade única de frames de 20 ms;
- um único Viterbi encaixa todas as palavras do texto de uma vez. Os parágrafos do Whisper só limitam a busca (±3 s) e nunca empurram uns aos outros; a busca fica numa faixa, então tempo e memória crescem linearmente com a duração;
- entre quaisquer duas palavras existe um estado "lixo" opcional, que absorve fala não transcrita ("eh", risos, outra pessoa) sem esticar palavras vizinhas;
- se o alinhamento global falhar, o parágrafo a parágrafo continua como reserva;
- o mapa de fala de D-022 continua por cima, encostando as bordas nos silêncios reais.

**Resultado no mesmo áudio:** "Edgar" 9,27 → 8,66 s (Whisper: 8,64), "Tengo" 9,55 → 9,27 s (Whisper: 9,30), "¿Están" 23,32–24,45 → 23,04–23,22 s.

**Testes:** `AlignTranscriptTest` em `tests/engine/test_alignment.py` (lixo entre palavras, janela escolhendo a repetição certa, parágrafo curto não empurra os seguintes).

## D-024 — Tempo híbrido: alinhamento acústico + Whisper como reserva

**Status:** aprovada pelo usuário em 19/11/2026, junto com D-023 ("fazer o máximo para melhorar").

**Por quê:** mesmo com o alinhamento global, o modelo de sincronização (wav2vec2 espanhol) perde a confiança em trechos que não conhece bem: inglês ("Latin Girl World Club"), fala rápida/sobreposta ("Gracias a mí. Yo no tengo loco"), números ditos ("100, 200"). Ali a confiança cai para perto de zero e a palavra vai parar a segundos do lugar. O Whisper raramente erra feio (erro típico 100–200 ms, sem cascata), mas é menos preciso que o alinhamento onde este reconhece a fala.

**Regra:**
- `transcribe-text` passa a pedir `word_timestamps` ao Whisper e devolve, em cada parágrafo, `words` com o tempo de cada palavra. O desktop e o painel mandam essa lista de volta no `caption` (dividir/juntar parágrafo divide/junta a lista);
- depois do alinhamento global (D-023), cada palavra com confiança < 0,5 que esteja a mais de 350 ms do Whisper recebe o tempo do Whisper. Palavras confiáveis ficam com o tempo acústico. O casamento é por sequência (difflib), então texto editado continua funcionando;
- o encaixe nos silêncios (D-022) vem por último e nunca move uma borda mais de 250 ms (só acabamento).

**Resultado no áudio de teste:** 28 palavras perdidas voltaram ao lugar ("Gracias a mí" 46,0 → 47,4 s; "Latin Girl" 71,1 → 72,2 s; "Sí." 24,1 → 23,7 s), sem mexer nas confiáveis.

**Testes:** `tests/engine/test_reference_timing.py` e o caso "Latin" em `test_speech_map.py`.

## D-025 — Números pela forma falada, duração mínima e conjunções

**Status:** aprovada pelo usuário em 19/11/2026 (terceiro teste no Premiere: "100, 200" fora do lugar; "Y" sozinho com 2 frames, "o preset de animação leva no mínimo 3 frames").

- **Números:** o modelo de sincronização só conhece letras; algarismos ficavam sem som e a fala deles era engolida pelas palavras vizinhas. Para alinhar, cada número vira a forma falada (`engine/alignment/spoken.py`, es/pt/en: "100" → "cien", "200.000" → "doscientos mil", "50%" → "cincuenta por ciento"). O texto da legenda não muda.
- **Duração mínima:** nenhuma legenda fica menos de `MIN_DISPLAY_SECONDS` = 0,125 s na tela (3 frames a 24 fps). Na segmentação é uma penalidade grande; se uma regra estrutural isolar algo curto (contagem, moeda), a legenda ganha o tempo mínimo e a seguinte começa um pouco depois, sem overlap.
- **Conjunções** ("y", "o", "que", "pero"...) puxam a palavra seguinte e custam mais no fim de uma legenda.
- **Medição geral:** `scripts/benchmark_sync.py` mede o vídeo inteiro (início de fala x início de legenda, legendas curtas, legendas cruzando silêncio, palavras esticadas, confiança baixa) sem depender de casos escolhidos a dedo.

## D-024 — REVOGADA: Whisper como reserva de tempo

Revogada em 19/11/2026 pela medição do vídeo inteiro (`scripts/benchmark_sync.py`, 20 retomadas de fala): trocar palavras de baixa confiança pelo tempo do Whisper piorava o resultado com qualquer limite testado (mediana 40 ms → 170–235 ms com o MMS; também piorava com o modelo antigo). O tempo do Whisper é aproximado demais para servir de reserva. O código foi removido e `transcribe-text` voltou a não pedir `word_timestamps`.

## D-026 — Sincronização com o MMS da Meta (fp32)

**Status:** aprovada pelo usuário em 19/11/2026 ("quero esse… o fp32, o melhor que possa ser").

**Por quê:** o wav2vec2 espanhol comprimido (int8) dava confiança quase zero em palavras claras ("Edgar" 0,0001, "Tengo" 0,005). O MMS_FA da Meta é um wav2vec2 de 300M parâmetros treinado especificamente para alinhamento forçado (31 mil horas, 1.100+ idiomas).

**Como:**
- `scripts/export_mms_onnx.py` baixa os pesos oficiais (torchaudio `MMS_FA`), exporta para ONNX fp32 sem compressão (1,2 GB) e confere contra o PyTorch (diferença < 3e-4). O PyTorch fica só no ambiente de desenvolvimento; o app continua rodando ONNX no onnxruntime, então o instalador não cresce com o PyTorch;
- o modelo fica em `%LOCALAPPDATA%\SRTX\models\mms-fa` (ou `SRTX_MMS_MODEL_DIR`). Quando existe, `load_alignment_model` usa o MMS; senão, o wav2vec2 por idioma como antes;
- o texto é romanizado para o alfabeto do MMS (sem acentos: "¿Están" → "estan"), depois de os números virarem forma falada (D-025);
- regra nova no mapa de fala: uma palavra nunca atravessa um silêncio ≥ 0,2 s (fica do lado onde está a maior parte da voz dela).

**Resultado (vídeo de teste inteiro, 20 retomadas de fala, alvo 2):**
- antes (modelo antigo, parágrafo a parágrafo — o que o usuário testou no Premiere): erro mediano 272 ms, 15/20 acima de 150 ms;
- agora (MMS fp32, alinhamento global, números falados, silêncio dentro da palavra): erro mediano 0 ms, p90 237 ms, 5/20 acima de 150 ms. Os 5 restantes são plateia gritando, fala sobreposta e inglês.

**Pendente para distribuição:** hospedar o `model.onnx` (1,2 GB) para download no primeiro uso em outros computadores; hoje ele existe só na máquina do usuário.

## D-027 — EXPERIMENTO: legendas com estilo via TTML

**Status:** em teste pelo usuário (19/11/2026). Pedido: inserir legendas já no estilo dele (tamanho 122, texto centralizado, alinhado embaixo, zona do meio da tela).

**Limite do Premiere:** nem ExtendScript nem a API UXP do Premiere 2027 têm comando para estilizar legendas nativas (tamanho, alinhamento, zona, estilo de trilha). Conferido em `json/api_config.json` da instalação: `CaptionTrack` não expõe métodos de estilo.

**Experimento:** `export-ttml` grava as legendas em TTML (`.xml`) com `tts:fontSize=122px`, `textAlign=center`, `displayAlign=after` e uma região na faixa do meio da tela, calculada pelo tamanho de quadro da sequência. O painel grava o SRT de sempre e o TTML, tenta criar a trilha pelo TTML e, se o Premiere recusar, cria pelo SRT, sem estilo, e avisa.

**Se o Premiere ignorar o estilo do TTML:** caminho garantido é um "Track Style" salvo no Premiere e aplicado em 1 clique na trilha inteira.

**Atualização D-027 (19/11/2026):** o usuário confirmou no Premiere que o TTML entra com tamanho 122 e na posição certa. O estilo virou **opcional** na aba Legendas ("Estilo ao inserir"): *Sem estilo* (SRT, padrão do Premiere), *SRTX* (122, centro, embaixo, meio da tela) ou um dos estilos salvos em `Documents\Adobe\Common\Assets\Text Styles`. Do `.prtextstyle` só é possível ler a fonte (bloco binário da Adobe; cores não estão no arquivo), então para estilo salvo o painel manda a fonte + cor do texto + contorno escolhidos no painel (`tts:fontFamily`, `tts:color`, `tts:textOutline`). Se fonte/cores não forem respeitadas pelo Premiere, os campos são ignorados e o resto continua valendo.

## D-028 — Legendas como clipes de texto (MOGRT), tudo automático

**Status:** aprovada pelo usuário em 19/11/2026 ("quero tudo automático"), depois de D-027 mostrar o limite: o TTML traz tamanho, zona, cor e contorno, mas não o alinhamento vertical nem o vínculo com o Track Style, e nenhuma API do Premiere estiliza legendas nativas.

**Como:** o usuário exporta uma vez, do próprio Premiere, um modelo `.mogrt` com uma legenda no estilo dele (Export As Motion Graphics Template → Local Templates Folder). O painel lista os `.mogrt` de `%APPDATA%\Adobe\Common\Motion Graphics Templates` (mais recentes primeiro) e, em "Clipes de texto", insere cada legenda como um clipe desse modelo (`Sequence.importMGT`), troca o texto (`textEditValue` no parâmetro de texto do Essential Graphics, ou a string direto em modelos do After Effects) e ajusta o fim do clipe ao fim da legenda. A trilha é a de vídeo mais alta livre em todo o trecho; se nenhuma estiver livre, uma nova é criada (QE `addTracks`). Inserção em lotes de 12 para mostrar progresso. O SRT continua sendo gravado em `SRTX Legendas` como arquivo de referência. "Legenda nativa" (D-027) continua disponível como opção.

**Segurança:** ExtendScript não tem `JSON.parse`; `srtx_parse` valida o texto com a regra do json2.js (só JSON) antes de avaliar.
