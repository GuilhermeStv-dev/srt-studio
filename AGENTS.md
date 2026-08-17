# AGENTS.md — SRT Studio

Leia este arquivo antes de alterar o projeto.

## Missão

Construir um aplicativo desktop Windows local para transformar áudio/vídeo em SRT confiável para edição rápida no Adobe Premiere.

## Stack

- Electron + React + TypeScript: interface desktop
- Python: engine
- faster-whisper: transcrição local (próxima etapa)

## Regras inegociáveis

- Não mover lógica de transcrição/segmentação/SRT para React.
- Não adicionar backend, conta, assinatura ou API paga ao MVP.
- Não sobrescrever mídia ou SRT original silenciosamente.
- Não gerar cue vazio, duração zero, overlap ou tempo regressivo.
- Aproximadamente 12 caracteres é preferência de segmentação, não limite cego.
- Preservar a naturalidade de ES-PY e não isolar conectores quando evitável.
- Toda correção linguística importante deve incluir teste de regressão.
- Não adicionar dependência pesada sem justificativa.
- Não commitar modelos, mídia de cliente, outputs, segredos ou ambientes virtuais.

## Ordem de desenvolvimento

1. Leia `docs/STATUS.md`.
2. Leia `docs/ARCHITECTURE.md` e `docs/PRODUCT_RULES.md`.
3. Rode `python -m unittest discover -s tests/engine -p "test_*.py" -v`.
4. Faça mudanças pequenas e testáveis.
5. Atualize `docs/STATUS.md` quando uma entrega for concluída.

## Próxima tarefa

Implementar o adapter `faster-whisper` isolado em `engine/transcription`, aceitando arquivo e devolvendo `WordToken[]` serializável, sem depender do Electron.
