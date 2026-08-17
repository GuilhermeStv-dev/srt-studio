# Casos reais de calibração

Este arquivo registra apenas casos anonimizados/curtos necessários para regressão do segmentador. Não armazenar mídia de cliente.

## 2026-08-17 — primeiro teste real ES-PY

Trecho transcrito pelo faster-whisper:

`Hola, ¿qué tal? ¿Quién quiere participar en un juego? ¿Quién se anima? Bueno, acá ya encontramos un voluntario. En uno de estos hay un regalito para vos...`

Problemas observados:

- caracteres `¿`, `é`, `á` chegaram ao renderer como `�`, indicando encoding incorreto no pipe Python → Electron;
- o segmentador criou uma caption de uma palavra (`participar`) mesmo havendo uma alternativa válida dentro do hard limit;
- o alvo de ~12 caracteres não pode vencer a legibilidade semântica nem a preferência por captions de pelo menos duas palavras.

Regra derivada:

- uma caption de uma única palavra deve ser fortemente desencorajada quando não houver pausa forte ao redor e for possível produzir segmentação de duas ou mais palavras dentro do hard max;
- palavras longas isoladas e palavras separadas por pausas fortes continuam válidas;
- UTF-8 deve ser forçado no subprocesso Python do desktop.
