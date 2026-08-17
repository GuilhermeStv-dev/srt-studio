# Segmentação ES-PY

O algoritmo completo será guiado por testes/fixtures e deve separar **preferências** de **restrições rígidas**.

Preferências iniciais:

- cerca de 12 caracteres;
- não deixar conectores isolados;
- respeitar pausas;
- balancear o último cue.

Restrições rígidas:

- cue não vazio;
- duração > 0;
- timestamps crescentes;
- sem overlap.
