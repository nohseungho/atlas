import { inflateSync } from 'zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// This check covers PNG structure and compressed data. Other formats retain
// their existing review path; facial identity and scene quality are separate gates.
export function pngIntegrityIssue(bytes) {
  if (!bytes.subarray(0, 4).equals(signature.subarray(0, 4))) return '';
  const invalid = 'PNG 이미지 데이터가 손상되었습니다. 정상 원본을 연결하세요.';
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) return invalid;
  let offset = 8;
  let header = false;
  const data = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (offset + size + 12 > bytes.length) return invalid;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, offset + size + 8)) !== bytes.readUInt32BE(offset + size + 8)) return invalid;
    if (!header) {
      if (type !== 'IHDR' || size !== 13 || !bytes.readUInt32BE(offset + 8) || !bytes.readUInt32BE(offset + 12)) return invalid;
      header = true;
    } else if (type === 'IHDR') return invalid;
    if (type === 'IDAT') data.push(bytes.subarray(offset + 8, offset + size + 8));
    if (type === 'IEND') {
      if (size || !data.length) return invalid;
      try { if (!inflateSync(Buffer.concat(data), { maxOutputLength: 128 * 1024 * 1024 }).length) return invalid; }
      catch { return invalid; }
      return '';
    }
    offset += size + 12;
  }
  return invalid;
}
