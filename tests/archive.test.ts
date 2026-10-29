import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractMetadata, inspectArchive, listComicPages, readArchiveEntry, verifyArchivePayload } from '../src/lib/archive';

function archive(files: Record<string, string | Uint8Array>, level: 0 | 6 = 6): ArrayBuffer {
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, typeof content === 'string' ? strToU8(content) : content])), { level });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const container = '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Books/Text/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const opf = '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Một ngày bình yên</dc:title><dc:creator>Tác giả Việt</dc:creator></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="../Images/b%C3%ACa.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="c1"/></spine></package>';
const epubFiles = {
  mimetype: 'application/epub+zip',
  'META-INF/container.xml': container,
  'Books/Text/package.opf': opf,
  'Books/Text/chapter.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Xin chào</h1></body></html>',
  'Books/Images/bìa.png': new Uint8Array([137, 80, 78, 71]),
};

describe('ZIP validation and bounded extraction', () => {
  it('reads both stored and deflated UTF-8 entries', () => {
    for (const level of [0, 6] as const) {
      const data = archive({ 'Nội dung/chương.txt': 'Một góc đọc yên tĩnh' }, level);
      expect(inspectArchive(data)[0].name).toBe('Nội dung/chương.txt');
      expect(new TextDecoder().decode(readArchiveEntry(data, 'Nội dung/chương.txt'))).toBe('Một góc đọc yên tĩnh');
    }
  });

  it('rejects a non-ZIP file and truncated archive', () => {
    expect(() => inspectArchive(new ArrayBuffer(10))).toThrow(/bị hỏng/);
    const data = archive({ 'page.png': 'image' });
    expect(() => inspectArchive(data.slice(0, -2))).toThrow(/bị hỏng/);
  });

  it.each(['../secret.png', '/page.png', 'C:/page.png', 'pages\\page.png', 'pages/../page.png'])('rejects unsafe entry path %s', path => {
    expect(() => inspectArchive(archive({ [path]: 'image' }))).toThrow(/đường dẫn/);
  });

  it('rejects oversized expanded entries before allocating them', () => {
    const data = archive({ 'page.png': 'x' });
    const view = new DataView(data);
    const directoryOffset = view.getUint32(data.byteLength - 22 + 16, true);
    view.setUint32(directoryOffset + 24, 41 * 1024 * 1024, true);
    expect(() => inspectArchive(data)).toThrow(/quá lớn sau khi giải nén/);
  });

  it('rejects ZIP encryption and unsupported compression', () => {
    const encrypted = archive({ 'page.png': 'x' });
    const encryptedView = new DataView(encrypted);
    const directory = encryptedView.getUint32(encrypted.byteLength - 6, true);
    encryptedView.setUint16(directory + 8, 1, true);
    expect(() => inspectArchive(encrypted)).toThrow(/mật khẩu/);
    const compression = archive({ 'page.png': 'x' });
    const compressionView = new DataView(compression);
    compressionView.setUint16(compressionView.getUint32(compression.byteLength - 6, true) + 10, 99, true);
    expect(() => inspectArchive(compression)).toThrow(/Kiểu nén/);
  });

  it('rejects central-directory offsets that point outside the file', () => {
    const data = archive({ 'page.png': 'x' });
    new DataView(data).setUint32(data.byteLength - 6, data.byteLength + 1000, true);
    expect(() => inspectArchive(data)).toThrow(/bị hỏng/);
  });

  it('verifies local header consistency and entry checksum', () => {
    const data = archive({ 'page.png': 'image bytes' }, 0);
    const entry = inspectArchive(data)[0];
    new Uint8Array(data)[entry.dataOffset] ^= 1;
    expect(() => readArchiveEntry(data, 'page.png')).toThrow(/bị hỏng/);
    const badHeader = archive({ 'page.png': 'image bytes' }, 0);
    new DataView(badHeader).setUint32(18, 3000, true);
    expect(() => inspectArchive(badHeader)).toThrow(/bị hỏng/);
  });

  it('reports a missing requested entry', () => {
    expect(() => readArchiveEntry(archive({ 'page.png': 'image' }), 'missing.png')).toThrow(/Không tìm thấy/);
  });

  it('rejects payloads whose real expansion exceeds the claimed central and local sizes', async () => {
    const data = archive({ 'large.txt': 'A'.repeat(8000) });
    const view = new DataView(data);
    const directory = view.getUint32(data.byteLength - 6, true);
    view.setUint32(directory + 24, 1, true);
    view.setUint32(22, 1, true);
    expect(inspectArchive(data)[0].uncompressedSize).toBe(1);
    await expect(verifyArchivePayload(data)).rejects.toThrow(/bị hỏng/);
  });

  it('checks every valid archive payload without retaining them', async () => {
    await expect(verifyArchivePayload(archive({ 'one.txt': 'one', 'two.txt': 'two'.repeat(20000), 'empty/': '' }))).resolves.toBeUndefined();
  });
});

describe('CBZ pages', () => {
  it('sorts naturally and ignores macOS sidecars, folders and non-image files', () => {
    const data = archive({
      'pages/10.jpg': 'ten', 'pages/2.png': 'two', 'pages/1.webp': 'one',
      '__MACOSX/._cover.jpg': 'junk', 'pages/.hidden.png': 'junk', 'ComicInfo.xml': '<ComicInfo/>', 'pages/readme.txt': 'readme',
    });
    expect(listComicPages(data)).toEqual(['pages/1.webp', 'pages/2.png', 'pages/10.jpg']);
  });

  it('rejects CBZs with no supported raster pages', () => {
    expect(() => listComicPages(archive({ 'cover.svg': '<svg/>' }))).toThrow(/không có ảnh/);
  });

  it('creates a title and a small first-page cover', async () => {
    const result = await extractMetadata(archive({ '01.png': new Uint8Array([137, 80, 78, 71]) }), 'cbz', 'Chuyến_đi.cbz');
    expect(result.title).toBe('Chuyến đi');
    expect(result.cover).toBe('data:image/png;base64,iVBORw==');
  });
});

describe('EPUB metadata', () => {
  it('resolves nested OPF resources, XML namespaces and percent-encoded cover paths', async () => {
    const metadata = await extractMetadata(archive(epubFiles), 'epub', 'fallback.epub');
    expect(metadata.title).toBe('Một ngày bình yên');
    expect(metadata.author).toBe('Tác giả Việt');
    expect(metadata.cover).toBe('data:image/png;base64,iVBORw==');
  });

  it('supports EPUB 2 cover metadata', async () => {
    const epub2 = opf.replace('version="3.0"', 'version="2.0"').replace('</metadata>', '<meta name="cover" content="cover"/></metadata>').replace(' properties="cover-image"', '');
    const metadata = await extractMetadata(archive({ ...epubFiles, 'Books/Text/package.opf': epub2 }), 'epub', 'fallback.epub');
    expect(metadata.cover).toContain('data:image/png;');
  });

  it('rejects a ZIP masquerading as an EPUB', async () => {
    await expect(extractMetadata(archive({ '1.png': 'image' }), 'epub', 'fake.epub')).rejects.toThrow(/thiếu tệp bắt buộc/);
  });

  it('rejects missing chapters and malformed metadata', async () => {
    const incomplete = { ...epubFiles };
    delete (incomplete as Record<string, unknown>)['Books/Text/chapter.xhtml'];
    await expect(extractMetadata(archive(incomplete), 'epub', 'bad.epub')).rejects.toThrow(/thiếu một hoặc nhiều chương/);
    await expect(extractMetadata(archive({ ...epubFiles, 'Books/Text/package.opf': '<package>' }), 'epub', 'bad.epub')).rejects.toThrow(/không hợp lệ/);
  });

  it('rejects DRM but allows known font obfuscation', async () => {
    const encryption = '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="Books/Text/chapter.xhtml"/></CipherData></EncryptedData></encryption>';
    await expect(extractMetadata(archive({ ...epubFiles, 'META-INF/encryption.xml': encryption }), 'epub', 'drm.epub')).rejects.toThrow(/DRM/);
    const fontOpf = opf.replace('</manifest>', '<item id="font" href="../fonts/font.ttf" media-type="font/ttf"/></manifest>');
    const fontEncryption = encryption.replace('http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'http://www.idpf.org/2008/embedding').replace('Books/Text/chapter.xhtml', 'Books/fonts/font.ttf');
    await expect(extractMetadata(archive({ ...epubFiles, 'Books/Text/package.opf': fontOpf, 'Books/fonts/font.ttf': 'font', 'META-INF/encryption.xml': fontEncryption }), 'epub', 'font.epub')).resolves.toHaveProperty('title', 'Một ngày bình yên');
  });

  it('rejects chapter paths escaping the archive or using remote URLs', async () => {
    for (const href of ['../../../private.xhtml', 'https://example.com/chapter.xhtml']) {
      await expect(extractMetadata(archive({ ...epubFiles, 'Books/Text/package.opf': opf.replace('href="chapter.xhtml"', `href="${href}"`) }), 'epub', 'bad.epub')).rejects.toThrow(/đường dẫn|tài nguyên ngoài/);
    }
  });

  it('validates unreferenced EPUB assets before passing the book to epub.js', async () => {
    const data = archive({ ...epubFiles, 'unused/image.png': 'image payload' }, 0);
    const entry = inspectArchive(data).find(item => item.name === 'unused/image.png')!;
    new Uint8Array(data)[entry.dataOffset] ^= 1;
    await expect(extractMetadata(data, 'epub', 'corrupted.epub')).rejects.toThrow(/bị hỏng/);
  });
});
