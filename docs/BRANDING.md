# SRTX — Identidade Visual

## Marca
- Nome do produto: **SRTX**
- Assinatura: **Guilherme Estevão Editor**
- O antigo `0.7 DEV` não faz parte da experiência final.

## Paleta
- Roxo principal: `#6C3BFF`
- Roxo destaque: `#8B5CFF`
- Roxo profundo: `#26104D`
- Fundo principal: `#0F0B17`
- Fundo dos cards: `#17131F`
- Card ativo/hover: `#21182F`
- Borda: `#332747`
- Off-white: `#F4F0E8`
- Texto secundário: `#AAA2B8`
- Texto discreto: `#746C80`
- Erro: `#FF5D6C`

## Direção
A interface deve parecer uma ferramenta profissional de edição: fundo quase preto com viés violeta, roxo reservado para foco/ação/seleção/progresso, off-white para marca e conteúdo principal. Verde não faz parte da identidade padrão.

## Ícone "Sx"
- Quadrado arredondado roxo profundo `#1E0854`, sem borda, com `Sx` em `#A488FF` na fonte Adobe Clean ExtraBold, na linguagem dos ícones da Adobe (Pr, Ae).
- `scripts/render-brand-icons.py` renderiza os PNGs versionados em `assets/branding/srtx-<tamanho>.png` (16–512 px) a partir da fonte instalada localmente pelo Creative Cloud; a fonte não é copiada para o repositório.
- `scripts/build-brand-icon.mjs` só empacota esses PNGs em `build/branding/srtx.{png,ico,icns}`; o `.ico` tem 16–256 px para a barra de tarefas ficar nítida.
- A marca da barra lateral do desktop e o cabeçalho do painel do Premiere usam os mesmos PNGs.

## Uso da marca
- `SRTX` é o wordmark principal, em estilo bold/condensed.
- `Guilherme Estevão Editor` funciona como assinatura editorial.
- O cover oficial usa `SRTX` off-white sobre fundo roxo profundo.
