# Regras de produto — MVP

- Windows local.
- Offline após o modelo necessário estar baixado.
- Sem API paga.
- Idioma prioritário: espanhol paraguaio (ES-PY).
- Timestamps por palavra como fonte de verdade temporal.
- Aproximadamente 12 caracteres por caption é **preferência**, não corte obrigatório.
- Evitar preposições, artigos e conectores isolados.
- Preservar `?`, `!` e vírgulas contextualmente úteis.
- Remover ponto final quando o preset solicitar.
- Proteger números e unidades semanticamente ligadas.
- Nunca produzir duração zero.
- Nunca produzir overlap.
- Nunca produzir timestamp regressivo.
- Nunca exportar cue vazio.
- Nunca sobrescrever automaticamente o arquivo original.
- Toda regra linguística importante deve ter teste automatizado.
