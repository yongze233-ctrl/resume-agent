import { createHash } from 'node:crypto';

/** Original embedded bitmap, never a generated face or a screenshot of the page. */
export interface DocumentImage {
  id: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  dataUrl: string;
  page?: number;
}

export function documentImage(
  bytes: Buffer,
  page?: number,
): DocumentImage | undefined {
  if (bytes.length < 24 || bytes.length > 4 * 1024 * 1024) return;
  let width = 0,
    height = 0;
  let mimeType: DocumentImage['mimeType'];
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    mimeType = 'image/png';
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mimeType = 'image/jpeg';
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) return;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 8) return;
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else return;
  if (
    width < 80 ||
    height < 80 ||
    width > 6000 ||
    height > 6000 ||
    width * height > 20_000_000
  )
    return;
  return {
    id: createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    width,
    height,
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    ...(page ? { page } : {}),
  };
}

export function uniqueDocumentImages(images: DocumentImage[]): DocumentImage[] {
  return [...new Map(images.map((image) => [image.id, image])).values()].slice(
    0,
    6,
  );
}

/** Geometry only narrows candidates; multiple candidates require an explicit choice. */
export function selectDocumentPortrait(images: DocumentImage[] = []) {
  const candidates = uniqueDocumentImages(images).filter(
    (image) =>
      image.width / image.height >= 0.5 &&
      image.width / image.height <= 1.25 &&
      image.height >= 100,
  );
  return {
    status:
      candidates.length === 1
        ? ('available' as const)
        : candidates.length
          ? ('ambiguous' as const)
          : ('none' as const),
    candidates,
    image: candidates.length === 1 ? candidates[0] : undefined,
  };
}
