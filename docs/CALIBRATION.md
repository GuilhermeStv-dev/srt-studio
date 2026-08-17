# Calibração da segmentação

A Fase 7 usa fixtures pequenas e determinísticas para transformar feedback editorial real em regressão automatizada.

## Objetivo

Quando um corte for considerado ruim, o caso deve virar uma fixture antes de ajustar pesos ou heurísticas. A fixture registra somente os `WordToken`s necessários, seus timestamps, a configuração usada e as captions esperadas.

Não commitar áudio/vídeo de cliente para calibrar o engine.

## Local

Fixtures de segmentação ficam em:

```text
tests/fixtures/segmentation/*.json
```

O runner é:

```text
tests/engine/test_segmentation_fixtures.py
```

A suíte descobre automaticamente todos os arquivos `.json` da pasta.

## Estrutura mínima

```json
{
  "name": "nome legível do caso",
  "description": "por que essa fronteira é importante",
  "source": "user-feedback-derived",
  "config": {
    "target_words": 1,
    "ignore_prepositions": true,
    "preserve_commas_periods": true
  },
  "tokens": [
    {"text": "¿qué", "start": 0.00, "end": 0.20},
    {"text": "tal?", "start": 0.20, "end": 0.50}
  ],
  "expected_captions": ["¿qué tal?"]
}
```

## Normalização monetária

Quando o caso precisar passar pelo normalizador monetário antes da segmentação:

```json
"normalization": {
  "monetary_thousands": true
}
```

## Fluxo de calibração

1. Reproduzir o corte ruim com os timestamps reais das palavras.
2. Criar uma fixture mínima que falhe com o comportamento atual.
3. Ajustar o segmentador somente depois da regressão existir.
4. Rodar toda a suíte do engine, não apenas o caso novo.
5. Confirmar que nenhum caso anterior mudou sem intenção.
6. Se a mudança altera regra de produto, atualizar `PRODUCT_RULES.md` e `DECISIONS.md`.

## Regras

- Prefira fixtures curtas, focadas em uma decisão de fronteira.
- Preserve timestamps reais quando o problema depende de cadência.
- Não invente uma pausa diferente só para fazer o teste passar.
- Casos reais podem ser representados apenas pelos tokens/timestamps necessários; não salvar a mídia original.
- Valores monetários, `¿ ? ¡ !`, duração positiva e ausência de overlap continuam regras estruturais.

## Casos iniciais

A base começa com:

- trecho real ES-PY usado para D-012 (`Hola,` / `¿qué tal?`, `participar en`, `¿Quién se` / `anima?`, `acá ya`);
- pausa forte vencendo coesão;
- valor monetário isolado (`con` / `50 mil` / `ahora`).

A partir daqui, cada novo exemplo editorial aprovado deve aumentar esse corpus em vez de substituir os casos anteriores.
