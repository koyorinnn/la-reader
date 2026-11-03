import { strToU8, zipSync } from 'fflate';

// Generated only by tests. These files are never part of public/ or app bundles.
export function epubFixture() {
  const paragraphs = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i + 1}. A quiet morning beside the window. The reader should preserve this text when controls hide, and allow turning the page from either side of the book.</p>`).join('');
  return Buffer.from(zipSync(Object.fromEntries(Object.entries({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'book.opf': '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-webkit-check</dc:identifier><dc:title>WebKit Reader Check</dc:title><dc:language>en</dc:language><dc:creator>Test</dc:creator></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="c1"/></spine></package>',
    'nav.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>',
    'chapter.xhtml': `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title><script>parent.__publicationExecuted = true</script></head><body onload="parent.__publicationExecuted = true"><h1>Chapter</h1>${paragraphs}<a href="javascript:parent.__publicationExecuted=true">Unsafe link</a></body></html>`,
  }).map(([key, value]) => [key, strToU8(value)]))));
}
export function cbzFixture() {
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRRsAAAAASUVORK5CYII=', 'base64');
  return Buffer.from(zipSync(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`page-${i + 1}.png`, pixel]))));
}
