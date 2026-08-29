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
