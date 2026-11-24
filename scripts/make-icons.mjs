// Writes simple PNG app icons (no dependencies): a navy rounded square with a gold dot and two strands.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      let [r, g, b] = [0x0b, 0x0b, 0x0c];
      // two arcs (approximate strands) and a centre dot
      const d1 = Math.abs(Math.hypot(X - 256, Y - 400) - 150);
      const d2 = Math.abs(Math.hypot(X - 256, Y - 112) - 150);
      if (Y > 150 && Y < 362 && X > 140 && X < 372) {
        if (d1 < 17 && Y < 330) [r, g, b] = [0xf9, 0x73, 0x16];
        if (d2 < 17 && Y > 182) [r, g, b] = [255, 255, 255];
      }
      if (Math.hypot(X - 256, Y - 256) < 26) [r, g, b] = [0xfb, 0xbf, 0x24];
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const n of [192, 512]) writeFileSync(new URL(`../public/icon-${n}.png`, import.meta.url), png(n));
console.log('icons written');
