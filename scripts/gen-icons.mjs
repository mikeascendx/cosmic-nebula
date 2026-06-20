import sharp from 'sharp';
import { readFileSync } from 'fs';
const icon = readFileSync('public/icon.svg');
const og = readFileSync('public/og.svg');
const jobs = [
  ['public/icon-192.png', icon, 192, 192],
  ['public/icon-512.png', icon, 512, 512],
  ['public/apple-icon.png', icon, 180, 180],
  ['public/favicon.png', icon, 48, 48],
  ['public/og.png', og, 1200, 630],
];
for (const [out, buf, w, h] of jobs) {
  await sharp(buf, { density: 384 }).resize(w, h).png().toFile(out);
  console.log('wrote', out, w + 'x' + h);
}
