import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Empacota o ícone "Sx" (assets/branding/srtx-<tamanho>.png, renderizados por
// scripts/render-brand-icons.py com a fonte de verdade) em .png/.ico/.icns.
// Sem dependências: só lê os PNGs versionados e monta os contêineres.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(root, 'assets', 'branding')
const outputDir = resolve(root, 'build', 'branding')

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

function source(size) {
  const file = resolve(sourceDir, `srtx-${size}.png`)
  if (!existsSync(file)) {
    throw new Error(`Falta ${file}. Rode scripts/render-brand-icons.py para gerar os PNGs da marca.`)
  }
  return readFileSync(file)
}

// ICO com vários tamanhos: a barra de tarefas usa 16/24/32/48 e fica nítida.
function icoFromPngs(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = header.length + 16 * entries.length
  const directory = []
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    directory.push(entry)
  }
  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.png)])
}

// ICNS aceita PNG embutido: `ic08` = 256x256, `ic09` = 512x512.
function icnsFromPngs(entries) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

mkdirSync(outputDir, { recursive: true })
const icoPath = resolve(outputDir, 'srtx.ico')
writeFileSync(resolve(outputDir, 'srtx.png'), source(256))
writeFileSync(icoPath, icoFromPngs(ICO_SIZES.map((size) => ({ size, png: source(size) }))))
writeFileSync(
  resolve(outputDir, 'srtx.icns'),
  icnsFromPngs([{ type: 'ic08', png: source(256) }, { type: 'ic09', png: source(512) }])
)
console.log(`Brand icon: ${icoPath}`)
