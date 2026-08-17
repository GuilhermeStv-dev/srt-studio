# Estado atual

Última atualização: 2026-08-17

## Fase

**2. Motor de transcrição — validação real pendente**  
**3. Segmentação ES-PY — primeira versão implementada em paralelo**

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

## Transcrição implementada

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

## Segmentação ES-PY — v0

- [x] `WordToken[] -> CaptionCue[]`
- [x] alvo padrão de 12 caracteres como preferência, não corte rígido
- [x] limite de segurança configurável
- [x] preferência por pausas fortes e `?` / `!`
- [x] evita artigo/preposição/conjunção curta isolada
- [x] evita conector pendurado no fim de cue quando há alternativa
- [x] prefere captions com 2+ palavras quando cabem de forma razoável
- [x] remove ponto final sem remover `?` / `!`
- [x] programação dinâmica para reduzir último cue ruim
- [x] cues com duração positiva e sem overlap
- [x] preview de captions conectado ao resultado da transcrição

## Validação atual

**24 testes unitários passando** sem exigir download do modelo.

## Ainda precisa de validação em máquina real

- [ ] executar `scripts/bootstrap.ps1` para criar `.venv` e instalar `faster-whisper`
- [ ] validar CUDA no PC Windows
- [ ] baixar/carregar um modelo Whisper
- [ ] transcrever um arquivo real ES-PY
- [ ] revisar captions geradas contra áudio real
- [ ] medir tempo, VRAM/RAM e qualidade
- [ ] transformar casos problemáticos reais em fixtures/testes de regressão

## Próximas entregas

1. validação real de transcrição + captions no Windows;
2. calibrar regras ES-PY com exemplos reais;
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
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
npm run dev
```
