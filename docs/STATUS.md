# Estado atual

Última atualização: 2026-08-17

## Fase

**2. Motor de transcrição — primeiro teste real concluído**  
**3. Segmentação ES-PY — migração para contagem por palavras em validação**

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
- [x] opção para manter/remover pontuação
- [x] remoção de pontuação não danifica separadores internos como `50.000` / `1,5`
- [x] normalização monetária conservadora
- [x] opção `Valores monetários no formato “mil”`
- [x] `200 mil guaraníes` → `200 mil` quando a opção está ligada
- [x] valores monetários reconhecidos são SEMPRE captions isoladas
- [x] `con 50 mil` → `con` / `50 mil`, independentemente da regra de preposição
- [x] números não monetários como `50.000 habitantes` permanecem intactos
- [x] cues com duração positiva e sem overlap
- [x] preview de captions conectado ao resultado da transcrição

A abordagem anterior baseada em aproximadamente 12 caracteres foi superada pela decisão D-011.

## Validação atual

**37 testes do engine passando na CI** na branch da migração por palavras.  
Typecheck e build desktop são checks obrigatórios do PR.

## Ainda precisa de validação em máquina real

- [ ] validar visualmente os novos controles de 1–4 palavras
- [ ] repetir áudio ES-PY real com 1, 2, 3 e 4 palavras
- [ ] validar `Ignorar preposições na contagem`
- [ ] validar `Manter pontuação` ligado/desligado
- [ ] validar valores monetários `50 mil`, `100 mil`, `200 mil` em fala real
- [ ] confirmar que o valor monetário fica sozinho na caption
- [ ] concluir CUDA/cuDNN para testar inferência GPU sem fallback
- [ ] medir tempo, VRAM/RAM e qualidade em CUDA

## Próximas entregas

1. validar no Windows a segmentação por palavras e opções novas;
2. concluir/validar runtime CUDA;
3. exportar SRT pela interface;
4. histórico/preview completo da transcrição;
5. presets;
6. instalador Windows.

## Preview visual

O preview é o próprio aplicativo Electron:

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
