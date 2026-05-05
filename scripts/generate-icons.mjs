// Generates simple solid-color PNG icons — pure Node.js, zero dependencies
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

function createPNG(size, rgb) {
  const [r, g, b] = rgb

  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    crcTable[i] = c
  }

  function crc32(buf) {
    let crc = 0xffffffff
    for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii')
    const lenBuf = Buffer.allocUnsafe(4)
    lenBuf.writeUInt32BE(data.length, 0)
    const crcBuf = Buffer.allocUnsafe(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }

  // IHDR
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0

  // Raw pixel data: one filter byte (0 = None) + RGB per row
  const row = Buffer.alloc(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', createPNG(192, [124, 58, 237]))   // #7c3aed
writeFileSync('public/icon-512.png', createPNG(512, [124, 58, 237]))
console.log('✓ Icons generated')
