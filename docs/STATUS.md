# Estado atual

Última atualização: 2026-08-17

## Fase

**2. Motor de transcrição — concluído funcionalmente**  
**3. Segmentação ES-PY — contagem por palavras em validação real**  
**4. SRT Premiere-safe — implementado em código, aguardando validação no Premiere**

## Fundação concluída

- [x] Repositório GitHub e estrutura inicial
- [x] Workspace Node para o desktop
- [x] Electron + React + TypeScript configurados
- [x] Preview Electron validado no Windows
- [x] Engine Python separado
- [x] Modelos `WordToken` e `CaptionCue`
- [x] Normalização textual básica
- [x] Validador e renderer SRT básicos
- [x] IPC Electron → Python
- [x] CI inicial
- [x] Documentação de arquitetura/handoff

## Transcrição implementada e validada

- [x] Adapter isolado para `faster-whisper`
- [x] Runtime CUDA/CPU selecionado via CTranslate2
- [x] Preferência CUDA `int8_float16`; fallback CPU `int8`
- [x] CLI `runtime`
- [x] CLI `transcribe`
- [x] `word_timestamps=True`
- [x] VAD habilitado por padrão
- [x] Conversão para `WordToken[]`
- [x] Rejeição de timestamps inválidos/regressivos
- [x] Electron prefere automaticamente `.venv\Scripts\python.exe`
- [x] Setup Windows idempotente em `scripts/bootstrap.ps1`
- [x] Pipeline completo testado com áudio ES-PY real no Windows
- [x] UTF-8 forçado no pipe Python → Electron para preservar `¿`, `¡` e acentos
- [x] fallback CPU validado quando CUDA/cuDNN não estão completos

## Segmentação ES-PY — abordagem atual

- [x] `WordToken[] -> CaptionCue[]`
- [x] controle explícito de `1`, `2`, `3` ou `4` palavras por caption
- [x] opção para ignorar preposições na contagem
- [x] captions de uma palavra permitidas
- [x] opção **Manter vírgulas e pontos** controla somente `,` e `.` nas bordas
- [x] `¿`, `?`, `¡` e `!` são sempre preservados
- [x] remoção de `,`/`.` não danifica `50.000` / `1,5`
- [x] normalização monetária conservadora
- [x] opção `Valores monetários no formato “mil”`
- [x] `200 mil guaraníes` → `200 mil` quando a opção está ligada
- [x] valores monetários reconhecidos são SEMPRE captions isoladas
- [x] `con 50 mil` → `con` / `50 mil`, independentemente da regra de preposição
- [x] números não monetários como `50.000 habitantes` permanecem intactos
- [x] cues com duração positiva e sem overlap
- [x] preview de captions conectado ao resultado da transcrição

## SRT Premiere-safe — implementação atual

- [x] renderer SRT com timestamps SubRip
- [x] validação final de cue vazio/duração zero/overlap/regressão
- [x] exportação UTF-8 sem BOM
- [x] quebra de linha CRLF
- [x] CLI `export-srt` recebendo captions via stdin
- [x] botão **Exportar SRT** no desktop
- [x] `Save As` sugerindo o nome da mídia com `.srt`
- [x] sobrescrita bloqueada por padrão
- [x] substituição exige confirmação explícita
- [x] preview pode mostrar só as primeiras captions, mas a exportação usa todas

## Validação automatizada

A branch atual adiciona regressões para:

- `?` / `!` preservados mesmo com vírgulas/pontos desligados;
- separadores numéricos protegidos;
- UTF-8 no SRT;
- CRLF;
- não sobrescrever arquivo existente sem autorização;
- validar antes de criar o arquivo;
- exportação pelo CLI.

## Ainda precisa de validação em máquina real

- [ ] repetir áudio ES-PY real com a configuração de palavras desejada
- [ ] confirmar `?` / `!` sempre preservados
- [ ] validar `,` / `.` ligado e desligado
- [ ] validar valores monetários em fala real
- [ ] exportar `.srt` pela interface
- [ ] importar o SRT no Adobe Premiere
- [ ] confirmar acentos, timestamps e sincronia no Premiere
- [ ] concluir CUDA/cuDNN para testar inferência GPU sem fallback

## Próximas entregas

1. validar exportação SRT no Windows/Premiere;
2. concluir Fase 3 com amostras reais;
3. completar runtime CUDA para desempenho;
4. avançar para fluxo desktop: drag-and-drop, progresso e cancelamento;
5. presets;
6. instalador Windows.

## Preview visual

```powershell
git pull
npm install
npm run dev
```

Para preparar o ambiente completo de transcrição no Windows:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```
