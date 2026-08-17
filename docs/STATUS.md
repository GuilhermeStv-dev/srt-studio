# Estado atual

Última atualização: 2026-08-17

## Fase

**2. Motor de transcrição — em andamento**

## Fundação concluída

- [x] Repositório GitHub e estrutura inicial
- [x] Workspace Node para o desktop
- [x] Electron + React + TypeScript configurados
- [x] Engine Python separado
- [x] Modelos iniciais `WordToken` e `CaptionCue`
- [x] Normalização textual básica
- [x] Validador e renderer SRT básicos
- [x] IPC Electron → Python
- [x] CI inicial
- [x] Documentação de arquitetura/handoff

## Transcrição implementada nesta etapa

- [x] Adapter isolado para `faster-whisper`
- [x] Runtime CUDA/CPU selecionado via CTranslate2
- [x] Preferência CUDA `int8_float16`; fallback CPU `int8`
- [x] CLI `runtime`
- [x] CLI `transcribe`
- [x] `word_timestamps=True`
- [x] VAD habilitado por padrão
- [x] Conversão para `WordToken[]`
- [x] Rejeição de timestamps inválidos/regressivos
- [x] 15 testes unitários passando sem exigir download do modelo
- [x] UI desktop com seleção de arquivo, modelo, idioma e preview das primeiras palavras

## Ainda precisa de validação em máquina real

- [ ] instalar `faster-whisper` no ambiente de desenvolvimento
- [ ] baixar/carregar `large-v3`
- [ ] validar CUDA na RTX local
- [ ] transcrever um arquivo real ES-PY
- [ ] medir tempo, VRAM/RAM e qualidade
- [ ] criar fixture de áudio pequena para regressão

## Depois da validação real

1. construir segmentação ES-PY guiada por testes;
2. ligar palavras → captions;
3. preview de captions na UI;
4. exportação SRT pela interface;
5. presets;
6. instalador Windows.

## Preview visual

O preview é o próprio aplicativo Electron, não um deploy Vercel.

```powershell
git clone https://github.com/GuilhermeStv-dev/srt-studio.git
cd srt-studio
npm install
npm run dev
```

Para habilitar a transcrição local:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[transcription]"
npm run dev
```
