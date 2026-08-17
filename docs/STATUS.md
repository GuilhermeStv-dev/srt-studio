# Estado atual

Última atualização: 2026-08-17

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
- [x] cues positivos, sem overlap e sem regressão
- [x] preset `ES-PY · Dinâmico` validado pelo usuário como adequado ao workflow real

A Fase 3 está funcionalmente concluída. Novos cortes ruins continuam sendo tratados como regressões, mas não há ajuste pendente conhecido no segmentador.

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

## UX/UI

- [x] layout desktop em duas colunas para origem + configuração
- [x] preview em largura total
- [x] redução de ruído visual
- [x] detalhes de runtime/engine ocultos quando saudáveis
- [x] WordTokens/timestamps brutos removidos da experiência normal
- [x] explicações técnicas de progresso removidas da experiência normal
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
- [ ] primeiro `SRT-Studio-Setup.exe` precisa passar pela CI
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

As regressões cobrem transcrição, segmentação inteligente, pontuação, moeda, progresso e exportação SRT.

## Próximos checkpoints

1. gerar o primeiro `SRT-Studio-Setup.exe` pela CI Windows;
2. instalar o Setup e executar o fluxo completo fora de `npm run dev`;
3. importar um SRT no Premiere e fechar Fase 4;
4. validar cancelamento/retry/presets no aplicativo instalado;
5. concluir os últimos sinais de build/dev da Fase 6;
6. concluir CUDA/cuDNN como melhoria de desempenho;
7. decidir assinatura digital e política de atualização antes da distribuição pública.

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
