# Estado atual

Última atualização: 2026-08-17

## Fase

**1. Fundação**

## Concluído nesta base

- [x] Estrutura inicial do repositório
- [x] Workspace Node para o desktop
- [x] Electron + React + TypeScript configurados
- [x] Engine Python separado
- [x] Modelos iniciais `WordToken` e `CaptionCue`
- [x] Normalização textual básica
- [x] Validador e renderer SRT básicos
- [x] CLI de health-check
- [x] IPC de health-check Electron → Python
- [x] Testes unitários iniciais
- [x] CI inicial
- [x] Documentação de arquitetura

## Ainda não implementado

- [ ] `faster-whisper`
- [ ] download/seleção de modelo
- [ ] extração de áudio de vídeo
- [ ] timestamps reais por palavra
- [ ] segmentador ES-PY completo
- [ ] presets editáveis
- [ ] preview de captions
- [ ] exportação pela interface
- [ ] instalador Windows

## Próxima entrega recomendada

Criar um spike do motor de transcrição que aceite um arquivo de áudio e devolva JSON no contrato abaixo:

```json
{
  "language": "es",
  "duration": 12.34,
  "words": [
    {"text": "Hola", "start": 0.2, "end": 0.55}
  ]
}
```

O spike deve:

1. usar `faster-whisper`;
2. permitir modelo configurável;
3. usar CUDA quando disponível e fallback CPU;
4. nunca depender do Electron;
5. possuir comando CLI reproduzível;
6. ter fixture pequena para regressão.
