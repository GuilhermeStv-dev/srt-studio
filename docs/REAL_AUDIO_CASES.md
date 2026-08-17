# Casos reais de calibração

Este arquivo registra apenas casos anonimizados/curtos necessários para regressão e validação. Não armazenar mídia de cliente.

## 2026-08-17 — primeiro teste real ES-PY

Trecho transcrito pelo faster-whisper:

`Hola, ¿qué tal? ¿Quién quiere participar en un juego? ¿Quién se anima? Bueno, acá ya encontramos un voluntario. En uno de estos hay un regalito para vos...`

Problema confirmado:

- caracteres `¿`, `é`, `á` chegaram ao renderer como `�`, indicando encoding incorreto no pipe Python → Electron.

Segmentação validada neste teste:

- captions como `participar`, `para vos` e `Pero te voy` são aceitáveis para o fluxo do produto;
- não deve existir regra genérica obrigando toda caption a conter duas ou mais palavras;
- o alvo de ~12 caracteres continua sendo preferência, não uma regra semântica rígida;
- qualquer futura mudança de segmentação precisa partir de um exemplo real explicitamente considerado ruim e virar teste de regressão.

Regra derivada deste incidente:

- UTF-8 deve ser forçado no subprocesso Python do desktop para preservar espanhol, acentos e sinais invertidos (`¿`, `¡`).
