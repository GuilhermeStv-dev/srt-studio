import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'build', 'branding')
const pngPath = resolve(outputDir, 'srtx.png')
const icoPath = resolve(outputDir, 'srtx.ico')
const icnsPath = resolve(outputDir, 'srtx.icns')
const size = 256

const colors = {
  background: [67, 33, 128, 255],
  border: [139, 92, 255, 255],
  mark: [244, 240, 232, 255]
}

const glyphs = {
  S: ['111', '100', '100', '111', '001', '001', '111'],
  R: ['110', '101', '101', '110', '101', '101', '101'],
  T: ['111', '010', '010', '010', '010', '010', '010'],
  X: ['101', '101', '101', '010', '101', '101', '101']
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  const crc = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function pngFromRgba(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1)
    raw[rowOffset] = 0
    pixels.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const offset = (y * size + x) * 4
  pixels[offset] = color[0]
  pixels[offset + 1] = color[1]
  pixels[offset + 2] = color[2]
  pixels[offset + 3] = color[3]
}

function rect(pixels, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) setPixel(pixels, xx, yy, color)
  }
}

function drawGlyph(pixels, glyph, x, y, scale) {
  const rows = glyphs[glyph]
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row].length; col += 1) {
      if (rows[row][col] === '1') {
        rect(pixels, x + col * scale, y + row * scale, scale - 2, scale - 2, colors.mark)
      }
    }
  }
}

function buildImage() {
  const pixels = Buffer.alloc(size * size * 4)
  for (let index = 0; index < size * size; index += 1) {
    pixels[index * 4] = colors.background[0]
    pixels[index * 4 + 1] = colors.background[1]
    pixels[index * 4 + 2] = colors.background[2]
    pixels[index * 4 + 3] = colors.background[3]
  }

  rect(pixels, 7, 7, size - 14, 4, colors.border)
  rect(pixels, 7, size - 11, size - 14, 4, colors.border)
  rect(pixels, 7, 7, 4, size - 14, colors.border)
  rect(pixels, size - 11, 7, 4, size - 14, colors.border)

  const scale = 18
  const gap = 10
  const glyphWidth = 3 * scale
  const totalWidth = glyphWidth * 4 + gap * 3
  let x = Math.floor((size - totalWidth) / 2)
  const y = Math.floor((size - 7 * scale) / 2)
  for (const glyph of ['S', 'R', 'T', 'X']) {
    drawGlyph(pixels, glyph, x, y, scale)
    x += glyphWidth + gap
  }

  return pngFromRgba(size, size, pixels)
}

function icoFromPng(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, png])
}

// ICNS aceita PNG embutido; `ic08` é a entrada 256x256 usada pelo macOS.
function icnsFromPng(png) {
  const entryHeader = Buffer.alloc(8)
  entryHeader.write('ic08', 0, 'ascii')
  entryHeader.writeUInt32BE(png.length + 8, 4)

  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + 8 + png.length, 4)

  return Buffer.concat([header, entryHeader, png])
}

mkdirSync(outputDir, { recursive: true })
const png = buildImage()
writeFileSync(pngPath, png)
writeFileSync(icoPath, icoFromPng(png))
writeFileSync(icnsPath, icnsFromPng(png))
console.log(`Brand icon: ${icoPath}`)
