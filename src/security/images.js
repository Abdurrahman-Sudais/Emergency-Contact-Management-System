const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
const WEBP_DROP = new Set(["EXIF", "XMP "]);
const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]);

function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function cleanJpeg(buf) {
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xda) {
      parts.push(buf.subarray(i));
      return Buffer.concat(parts);
    }
    if (marker === 0xd9) return null;
    if (i + 4 > buf.length) return null;
    const length = buf.readUInt16BE(i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > buf.length) return null;
    if (!JPEG_DROP.has(marker)) parts.push(buf.subarray(i, end));
    i = end;
  }
  return null;
}

function cleanPng(buf) {
  const parts = [PNG_SIGNATURE];
  let i = 8;
  let first = true;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) return null;
    if (first && type !== "IHDR") return null;
    first = false;
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end));
    if (type === "IEND") return Buffer.concat(parts);
    i = end;
  }
  return null;
}

function cleanWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > buf.length) return null;
    if (!WEBP_DROP.has(type)) {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    i = end;
  }
  if (!chunks.length) return null;
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

function cleanImage(buf, type) {
  if (type === "image/jpeg") return cleanJpeg(buf);
  if (type === "image/png") return cleanPng(buf);
  if (type === "image/webp") return cleanWebp(buf);
  return null;
}

module.exports = { detectImageType, cleanImage, IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"] };
