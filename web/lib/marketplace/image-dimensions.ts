/**
 * Server-side image dimension + MIME sniffing for deal media uploads (Chunk 14).
 * Reads real width/height from jpeg / png / webp buffers — no native deps.
 */

import {
  DEAL_MEDIA_LIMITS,
  type AllowedImageMimeType,
} from "./deal-media";

export type ImageDimensions = {
  width: number;
  height: number;
  mimeType: AllowedImageMimeType;
};

export class ImageProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProbeError";
  }
}

function u16be(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

function u32be(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

function u16le(buf: Uint8Array, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8);
}

function u24le(buf: Uint8Array, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16);
}

function ascii(buf: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...buf.subarray(offset, offset + len));
}

export function sniffImageMime(
  bytes: Uint8Array
): AllowedImageMimeType | null {
  if (bytes.length < 12) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP (RIFF....WEBP)
  if (
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  // IHDR starts at byte 8; width/height at 16/20
  if (bytes.length < 24) {
    throw new ImageProbeError("png file too short");
  }
  if (ascii(bytes, 12, 4) !== "IHDR") {
    throw new ImageProbeError("png missing IHDR");
  }
  return {
    width: u32be(bytes, 16),
    height: u32be(bytes, 20),
  };
}

function readJpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new ImageProbeError("invalid jpeg marker");
    }
    const marker = bytes[offset + 1]!;
    // Soft markers / padding
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers without length
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) {
      throw new ImageProbeError("invalid jpeg segment length");
    }
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 (not DHT/DAC)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        height: u16be(bytes, offset + 5),
        width: u16be(bytes, offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new ImageProbeError("jpeg dimensions not found");
}

function readWebpDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (bytes.length < 30) {
    throw new ImageProbeError("webp file too short");
  }
  const fourCC = ascii(bytes, 12, 4);
  if (fourCC === "VP8X") {
    // Extended: canvas size at offset 24–29 (24-bit little-endian, minus 1)
    const width = u24le(bytes, 24) + 1;
    const height = u24le(bytes, 27) + 1;
    return { width, height };
  }
  if (fourCC === "VP8 ") {
    // Lossy: frame header after chunk size
    // Signature bytes at 23: 0x9d 0x01 0x2a then 16-bit width/height
    if (bytes.length < 30) throw new ImageProbeError("webp vp8 too short");
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new ImageProbeError("webp vp8 frame signature missing");
    }
    const width = u16le(bytes, 26) & 0x3fff;
    const height = u16le(bytes, 28) & 0x3fff;
    return { width, height };
  }
  if (fourCC === "VP8L") {
    // Lossless: signature 0x2f then 14-bit width-1 / height-1
    if (bytes.length < 25) throw new ImageProbeError("webp vp8l too short");
    if (bytes[20] !== 0x2f) {
      throw new ImageProbeError("webp vp8l signature missing");
    }
    const bits =
      bytes[21]! |
      (bytes[22]! << 8) |
      (bytes[23]! << 16) |
      (bytes[24]! << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  throw new ImageProbeError(`unsupported webp chunk ${fourCC}`);
}

/** Probe width/height and MIME from raw image bytes. */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions {
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    throw new ImageProbeError("unsupported or unrecognised image format");
  }
  let size: { width: number; height: number };
  if (mimeType === "image/png") size = readPngDimensions(bytes);
  else if (mimeType === "image/jpeg") size = readJpegDimensions(bytes);
  else size = readWebpDimensions(bytes);

  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new ImageProbeError("invalid image dimensions");
  }
  return { ...size, mimeType };
}

export function assertUploadDimensions(dims: {
  width: number;
  height: number;
}): void {
  const { minWidthPx, minHeightPx } = DEAL_MEDIA_LIMITS;
  if (dims.width < minWidthPx || dims.height < minHeightPx) {
    throw new ImageProbeError(
      `image must be at least ${minWidthPx}×${minHeightPx} px (got ${dims.width}×${dims.height})`
    );
  }
}

/**
 * Build a minimal valid solid-colour PNG (RGB, no compression extras) for tests.
 * Uses uncompressed IDAT with filter byte 0 per scanline via zlib STORE blocks.
 */
export function buildSolidPng(
  width: number,
  height: number,
  rgb: [number, number, number] = [40, 120, 200]
): Uint8Array {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(buf: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const len = data.length;
    const out = new Uint8Array(4 + 4 + len + 4);
    out[0] = (len >>> 24) & 0xff;
    out[1] = (len >>> 16) & 0xff;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    out.set(typeBytes, 4);
    out.set(data, 8);
    const crcBuf = new Uint8Array(4 + len);
    crcBuf.set(typeBytes, 0);
    crcBuf.set(data, 4);
    const crc = crc32(crcBuf);
    const crcOff = 8 + len;
    out[crcOff] = (crc >>> 24) & 0xff;
    out[crcOff + 1] = (crc >>> 16) & 0xff;
    out[crcOff + 2] = (crc >>> 8) & 0xff;
    out[crcOff + 3] = crc & 0xff;
    return out;
  }

  // Raw scanlines: each starts with filter byte 0
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }

  // zlib wrap with stored (uncompressed) blocks (max 65535 per block)
  const blocks: Uint8Array[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const slice = raw.subarray(offset, Math.min(offset + 65535, raw.length));
    const isLast = offset + slice.length >= raw.length;
    const block = new Uint8Array(5 + slice.length);
    block[0] = isLast ? 0x01 : 0x00;
    block[1] = slice.length & 0xff;
    block[2] = (slice.length >>> 8) & 0xff;
    const nlen = ~slice.length & 0xffff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(slice, 5);
    blocks.push(block);
    offset += slice.length;
  }
  const deflatedLen = blocks.reduce((n, b) => n + b.length, 0);
  const zlib = new Uint8Array(2 + deflatedLen + 4);
  zlib[0] = 0x78; // CMF
  zlib[1] = 0x01; // FLG (no dict, check bits ok for 0x7801)
  let zOff = 2;
  for (const b of blocks) {
    zlib.set(b, zOff);
    zOff += b.length;
  }
  // Adler-32 of raw
  let a = 1;
  let bSum = 0;
  for (let i = 0; i < raw.length; i++) {
    a = (a + raw[i]!) % 65521;
    bSum = (bSum + a) % 65521;
  }
  const adler = ((bSum << 16) | a) >>> 0;
  zlib[zOff] = (adler >>> 24) & 0xff;
  zlib[zOff + 1] = (adler >>> 16) & 0xff;
  zlib[zOff + 2] = (adler >>> 8) & 0xff;
  zlib[zOff + 3] = adler & 0xff;

  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = new Uint8Array(13);
  ihdr[0] = (width >>> 24) & 0xff;
  ihdr[1] = (width >>> 16) & 0xff;
  ihdr[2] = (width >>> 8) & 0xff;
  ihdr[3] = width & 0xff;
  ihdr[4] = (height >>> 24) & 0xff;
  ihdr[5] = (height >>> 16) & 0xff;
  ihdr[6] = (height >>> 8) & 0xff;
  ihdr[7] = height & 0xff;
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
