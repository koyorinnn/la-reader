import { Inflate, strFromU8 } from 'fflate';
import type { BookFormat } from '../types';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 300 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const imagePattern = /\.(?:jpe?g|png|webp|gif|avif)$/i;

export interface ArchiveEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compression: number;
  crc32: number;
  dataOffset: number;
  localOffset: number;
  isDirectory: boolean;
}

const fail = (message: string): never => { throw new Error(message); };
const corrupt = () => fail('Tệp nén bị hỏng hoặc chưa tải xong. Hãy chọn lại tệp EPUB/CBZ hợp lệ.');

function validArchivePath(name: string): boolean {
  return !!name && !name.includes('\0') && !name.includes('\\') &&
    !name.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(name) &&
    !name.split('/').some(part => part === '..' || part === '.');
}

/** Read the ZIP directory before allocating any decompressed entry. ZIP64 is intentionally unsupported. */
export function inspectArchive(data: ArrayBuffer): ArchiveEntry[] {
  if (data.byteLength > MAX_FILE_BYTES) fail('Tệp quá lớn. Vui lòng chọn EPUB/CBZ nhỏ hơn 100 MB.');
  if (data.byteLength < 22) return corrupt();
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
      end = i;
      break;
    }
  }
  if (end < 0) return corrupt();
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    fail('Tệp ZIP64 chưa được hỗ trợ. Hãy xuất lại sách dạng ZIP/EPUB/CBZ thông thường.');
  }
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) {
    fail('Tệp nén chia nhiều phần chưa được hỗ trợ.');
  }
  if (count > MAX_ENTRIES) fail('Sách có quá nhiều tệp (tối đa 5.000). Hãy chia thành các tập nhỏ hơn.');
  if (!count || directoryOffset + directorySize !== end) return corrupt();
  const names = new Set<string>();
  const entries: ArchiveEntry[] = [];
  let offset = directoryOffset;
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return corrupt();
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > end || !nameLength) return corrupt();
    if (flags & 0x41) fail('Tệp có mật khẩu hoặc mã hóa chưa được hỗ trợ.');
    if (![0, 8].includes(compression)) fail('Kiểu nén này chưa được hỗ trợ. Hãy dùng ZIP với Store hoặc Deflate.');
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) fail('Tệp ZIP64 chưa được hỗ trợ.');
    if (view.getUint16(offset + 34, true) !== 0) return corrupt();
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = strFromU8(rawName, !(flags & 0x800));
    if (!validArchivePath(name)) fail('Tệp chứa đường dẫn không hợp lệ. Hãy xuất lại sách.');
    if (names.has(name)) fail('Tệp chứa các mục trùng tên. Hãy xuất lại sách.');
    names.add(name);
    expanded += uncompressedSize;
    if (uncompressedSize > MAX_ENTRY_BYTES || expanded > MAX_EXPANDED_BYTES) {
      fail('Sách quá lớn sau khi giải nén (tối đa 40 MB mỗi tệp, 300 MB mỗi sách).');
    }
    if (uncompressedSize > Math.max(1024 * 1024, compressedSize * 1000)) {
      fail('Tỷ lệ nén của tệp quá cao. Hãy xuất lại sách với mức nén thấp hơn.');
    }
    if (localOffset + 30 > directoryOffset || view.getUint32(localOffset, true) !== 0x04034b50) return corrupt();
    const localFlags = view.getUint16(localOffset + 6, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localFlags !== flags || view.getUint16(localOffset + 8, true) !== compression || dataOffset + compressedSize > directoryOffset) return corrupt();
    if (localNameLength !== nameLength || rawName.some((byte, i) => byte !== bytes[localOffset + 30 + i])) return corrupt();
    const crc32 = view.getUint32(offset + 16, true);
    if (!(flags & 8) && (view.getUint32(localOffset + 14, true) !== crc32 || view.getUint32(localOffset + 18, true) !== compressedSize || view.getUint32(localOffset + 22, true) !== uncompressedSize)) return corrupt();
    if (compression === 0 && compressedSize !== uncompressedSize) return corrupt();
    entries.push({ name, compression, compressedSize, uncompressedSize, crc32, localOffset, dataOffset, isDirectory: name.endsWith('/') });
    offset = nextOffset;
  }
  if (offset !== end) return corrupt();
  const byOffset = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let i = 1; i < byOffset.length; i++) {
    const previous = byOffset[i - 1];
    if (previous.dataOffset + previous.compressedSize > byOffset[i].localOffset) return corrupt();
  }
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function checksum(bytes: Uint8Array): number {
  let result = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) result = crcTable[(result ^ bytes[i]) & 255] ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}

function readEntry(data: ArrayBuffer, entry: ArchiveEntry): Uint8Array {
  const compressed = new Uint8Array(data, entry.dataOffset, entry.compressedSize);
  let bytes: Uint8Array;
  try {
    if (entry.compression === 0) bytes = compressed.slice();
    else {
      bytes = new Uint8Array(entry.uncompressedSize);
      let written = 0;
      const inflater = new Inflate(chunk => {
        if (written + chunk.length > entry.uncompressedSize) return corrupt();
        bytes.set(chunk, written);
        written += chunk.length;
      });
      // Small compressed chunks also bound actual expansion when a hostile ZIP lies about its size.
      for (let offset = 0; offset < compressed.length; offset += 4096) {
        inflater.push(compressed.subarray(offset, offset + 4096), offset + 4096 >= compressed.length);
      }
      if (written !== entry.uncompressedSize) return corrupt();
    }
  } catch { return corrupt(); }
  if (bytes.length !== entry.uncompressedSize || checksum(bytes) !== entry.crc32) return corrupt();
  return bytes;
}

/** Decode only the requested entry, so CBZ pages do not all reside in memory. */
export function readArchiveEntry(data: ArrayBuffer, path: string): Uint8Array {
  const entry = inspectArchive(data).find(item => item.name === path && !item.isDirectory);
  if (!entry) fail('Không tìm thấy nội dung trong sách. Tệp có thể bị thiếu trang.');
  return readEntry(data, entry!);
}

/** Prove real expanded sizes and CRCs before handing a ZIP to another decompressor. */
export async function verifyArchivePayload(data: ArrayBuffer): Promise<void> {
  const entries = inspectArchive(data);
  let yieldedAt = Date.now();
  for (const entry of entries) {
    // Deliberately do not retain the returned buffer: at most one entry is expanded at once.
    readEntry(data, entry);
    if (Date.now() - yieldedAt >= 12) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      yieldedAt = Date.now();
    }
  }
}

function isComicPage(entry: ArchiveEntry): boolean {
  return !entry.isDirectory && imagePattern.test(entry.name) && !entry.name.split('/').some(part => part.startsWith('.') || part === '__MACOSX');
}

function comicPages(entries: ArchiveEntry[]): string[] {
  const pages = entries.filter(isComicPage).map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || a.localeCompare(b));
  if (!pages.length) fail('CBZ không có ảnh đọc được. Hỗ trợ JPG, PNG, WebP, GIF và AVIF.');
  return pages;
}

export function listComicPages(data: ArrayBuffer): string[] { return comicPages(inspectArchive(data)); }

function xml(data: ArrayBuffer, entries: ArchiveEntry[], path: string): Document {
  const entry = entries.find(item => item.name === path);
  if (!entry) fail(`EPUB thiếu tệp bắt buộc: ${path}.`);
  if (entry!.uncompressedSize > MAX_XML_BYTES) fail('Tệp thông tin EPUB quá lớn. Hãy xuất lại sách.');
  const text = strFromU8(readEntry(data, entry!));
  if (/<!DOCTYPE/i.test(text)) fail('Tệp thông tin EPUB chứa khai báo XML chưa được hỗ trợ.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.getElementsByTagNameNS('*', 'parsererror').length) fail('Thông tin EPUB không hợp lệ. Hãy kiểm tra hoặc xuất lại sách.');
  return document;
}

const elements = (root: Document | Element, name: string): Element[] => Array.from(root.getElementsByTagNameNS('*', name));

/** Resolve an EPUB relative resource path without allowing it to leave the archive. */
function resolvePath(base: string, href: string): string {
  let path: string;
  try { path = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { return fail('EPUB có đường dẫn tài nguyên không hợp lệ.'); }
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return fail('EPUB có tài nguyên ngoài tệp chưa được hỗ trợ.');
  const parts = base.split('/').slice(0, -1);
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return fail('EPUB có đường dẫn vượt khỏi thư mục sách.'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function imageDataUrl(data: ArrayBuffer, entry: ArchiveEntry | undefined): string | undefined {
  if (!entry || entry.uncompressedSize > 2 * 1024 * 1024 || !imagePattern.test(entry.name)) return undefined;
  const bytes = readEntry(data, entry);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const extension = entry.name.split('.').pop()!.toLowerCase();
  return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${btoa(binary)}`;
}

export async function extractMetadata(data: ArrayBuffer, format: BookFormat, filename: string): Promise<{ title: string; author: string; cover?: string }> {
  const entries = inspectArchive(data);
  const fallbackTitle = filename.replace(/\.(?:epub|cbz)$/i, '').replace(/[_]+/g, ' ').trim() || 'Sách chưa đặt tên';
  if (format === 'cbz') {
    const pages = comicPages(entries);
    return { title: fallbackTitle, author: 'Truyện tranh', cover: imageDataUrl(data, entries.find(entry => entry.name === pages[0])) };
  }
  if (format !== 'epub') fail('Chỉ hỗ trợ tệp EPUB và CBZ.');
  const container = xml(data, entries, 'META-INF/container.xml');
  const roots = elements(container, 'rootfile');
  const rootfile = roots.find(root => root.getAttribute('media-type') === 'application/oebps-package+xml') || roots[0];
  const packagePath = rootfile?.getAttribute('full-path');
  if (!packagePath || !validArchivePath(packagePath)) fail('EPUB không có thông tin gói sách hợp lệ.');
  const packageDocument = xml(data, entries, packagePath!);
  const items = elements(packageDocument, 'item');
  const itemMap = new Map(items.map(item => [item.getAttribute('id'), item]));
  const spine = elements(packageDocument, 'itemref');
  if (!spine.length) fail('EPUB không có chương để đọc.');
  for (const reference of spine) {
    const item = itemMap.get(reference.getAttribute('idref'));
    const href = item?.getAttribute('href');
    if (!href || !entries.some(entry => entry.name === resolvePath(packagePath!, href))) fail('EPUB thiếu một hoặc nhiều chương. Hãy chọn lại bản đầy đủ.');
  }
  if (entries.some(entry => entry.name === 'META-INF/encryption.xml')) {
    const encryption = xml(data, entries, 'META-INF/encryption.xml');
    const allowed = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);
    for (const encrypted of elements(encryption, 'EncryptedData')) {
      const algorithm = elements(encrypted, 'EncryptionMethod')[0]?.getAttribute('Algorithm');
      const uri = elements(encrypted, 'CipherReference')[0]?.getAttribute('URI');
      const item = uri && items.find(candidate => {
        const href = candidate.getAttribute('href');
        return href && resolvePath(packagePath!, href) === resolvePath('', uri);
      });
      const mediaType = item && item.getAttribute('media-type');
      if (!algorithm || !allowed.has(algorithm) || !mediaType || !/(?:font|opentype|truetype)/i.test(mediaType)) {
        fail('EPUB có DRM hoặc nội dung mã hóa. Vui lòng dùng tệp EPUB không có DRM.');
      }
    }
  }
  const coverId = elements(packageDocument, 'meta').find(meta => meta.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverItem = items.find(item => (item.getAttribute('properties') || '').split(/\s+/).includes('cover-image')) || (coverId ? itemMap.get(coverId) : undefined);
  const coverHref = coverItem?.getAttribute('href');
  const coverPath = coverHref ? resolvePath(packagePath!, coverHref) : undefined;
  const title = elements(packageDocument, 'title')[0]?.textContent?.trim() || fallbackTitle;
  const authors = elements(packageDocument, 'creator').map(creator => creator.textContent?.trim()).filter(Boolean);
  // epub.js uses its own ZIP decoder, so validate every actual payload first, including unreferenced images.
  await verifyArchivePayload(data);
  return { title, author: authors.join(', ') || 'Chưa rõ tác giả', cover: imageDataUrl(data, entries.find(entry => entry.name === coverPath)) };
}
