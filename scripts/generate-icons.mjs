import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const COLORS = {
  background: [246, 247, 244, 255],
  dark: [23, 34, 27, 255],
  green: [63, 125, 88, 255],
  greenSoft: [232, 242, 235, 255],
  border: [226, 230, 227, 255]
};

function ensureDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function drawRoundedRect(pixels, size, radius, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x < radius ? radius - x : x > size - radius ? x - (size - radius) : 0;
      const dy = y < radius ? radius - y : y > size - radius ? y - (size - radius) : 0;

      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function drawCircle(pixels, size, centerX, centerY, radius, color) {
  const radiusSquared = radius * radius;

  for (let y = Math.max(0, Math.floor(centerY - radius)); y < Math.min(size, Math.ceil(centerY + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(centerX - radius)); x < Math.min(size, Math.ceil(centerX + radius)); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function drawLeaf(pixels, size, centerX, centerY, width, height, angleDegrees, color) {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (let y = Math.floor(centerY - height); y <= Math.ceil(centerY + height); y += 1) {
    for (let x = Math.floor(centerX - width); x <= Math.ceil(centerX + width); x += 1) {
      const translatedX = x - centerX;
      const translatedY = y - centerY;
      const rotatedX = translatedX * cos + translatedY * sin;
      const rotatedY = -translatedX * sin + translatedY * cos;
      const value =
        (rotatedX * rotatedX) / (width * width) +
        (rotatedY * rotatedY) / (height * height);

      if (value <= 1 && rotatedX >= -width * 0.2) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function drawStem(pixels, size, centerX, centerY, length, color) {
  for (let i = 0; i < length; i += 1) {
    setPixel(pixels, size, Math.round(centerX + i * 0.3), Math.round(centerY + i * 0.9), color);
    setPixel(pixels, size, Math.round(centerX + i * 0.3), Math.round(centerY + i * 0.9) + 1, color);
  }
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const index = (y * size + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function crc32(buffer) {
  let crc = ~0;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return ~crc >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crcValue, 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const imageData = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    imageData[y * (stride + 1)] = 0;
    pixels.copy(imageData, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', deflateSync(imageData)),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  pixels.fill(0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      setPixel(pixels, size, x, y, COLORS.background);
    }
  }

  const radius = Math.round(size * 0.18);
  drawRoundedRect(pixels, size, radius, COLORS.background);
  drawCircle(pixels, size, size * 0.5, size * 0.53, size * 0.28, COLORS.green);
  drawCircle(pixels, size, size * 0.5, size * 0.53, size * 0.2, COLORS.greenSoft);
  drawCircle(pixels, size, size * 0.5, size * 0.53, size * 0.145, COLORS.background);
  drawCircle(pixels, size, size * 0.5, size * 0.53, size * 0.02, COLORS.border);
  drawLeaf(pixels, size, size * 0.67, size * 0.32, size * 0.11, size * 0.07, -40, COLORS.green);
  drawStem(pixels, size, size * 0.58, size * 0.31, Math.round(size * 0.08), COLORS.dark);

  return encodePng(size, pixels);
}

const outputs = [
  { path: resolve('public/icons/icon-192.png'), size: 192 },
  { path: resolve('public/icons/icon-512.png'), size: 512 },
  { path: resolve('public/icons/apple-touch-icon.png'), size: 180 }
];

for (const output of outputs) {
  ensureDirectory(output.path);
  writeFileSync(output.path, renderIcon(output.size));
}

const faviconPng = renderIcon(32);
const faviconPath = resolve('public/favicon.ico');
ensureDirectory(faviconPath);
writeFileSync(faviconPath, encodeIco(faviconPng, 32));
