# CUDA no Windows — SRT Studio

O `faster-whisper` usa CTranslate2 para inferência. No Windows, a execução em GPU requer que as bibliotecas CUDA necessárias estejam carregáveis pelo processo.

## Requisitos do projeto

- NVIDIA GPU compatível;
- CUDA Toolkit 12.x (inclui cuBLAS 12, como `cublas64_12.dll`);
- cuDNN 9 para CUDA 12;
- diretórios `bin` correspondentes disponíveis no `PATH` do processo.

## Comportamento do SRT Studio

Em `device=auto`, o engine verifica as DLLs essenciais no Windows antes de escolher CUDA.

- GPU + DLLs disponíveis → CUDA.
- GPU visível + DLLs ausentes → fallback para CPU, com aviso no runtime.
- `device=cuda` explícito + DLLs ausentes → erro legível, sem traceback bruto.

Depois de instalar/alterar CUDA ou cuDNN, feche e reabra o terminal/VS Code para que o processo receba o `PATH` atualizado e use **Reverificar runtime** no aplicativo.
