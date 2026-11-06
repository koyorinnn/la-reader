"""Generate original test publications. Never packaged in release apps."""
from pathlib import Path
import struct
import zlib
import zipfile

root = Path(__file__).resolve().parent.parent / 'test-fixtures'
root.mkdir(exist_ok=True)

def png(width, height, number):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data)&0xffffffff)
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            border = x < 30 or y < 30 or x > width-31 or y > height-31
            panel = (70 < y < 270 or 310 < y < 660) and 60 < x < width-60
            bar = 700 < y < 740 and 70 < x < 70+number*55
            rgb = (220, 225, 214) if border else (185+number*5, 202, 192) if panel else (60, 88, 70) if bar else (247, 245, 236)
            rows.extend(rgb)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')

with zipfile.ZipFile(root/'Native-reader.epub', 'w') as book:
    book.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    book.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    book.writestr('OEBPS/book.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">la-native-test</dc:identifier><dc:title>Những ngày đọc sách</dc:title><dc:creator>Lá Reader</dc:creator><dc:language>vi</dc:language><meta property="dcterms:modified">2026-11-07T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
    book.writestr('OEBPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Mục lục</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Một buổi sáng yên tĩnh</a></li></ol></nav></body></html>')
    text = 'Ánh sáng đi qua ô cửa, dừng lại trên những trang sách. Đọc chậm một chút, ta có thể nghe rõ câu chuyện đang mở ra. Một cuốn sách luôn dành chỗ cho những khoảng lặng và trí tưởng tượng của người đọc.'
    paragraphs = ''.join(f'<p id="p{i}">{i+1}. {text} {text}</p>' for i in range(100))
    book.writestr('OEBPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" lang="vi"><head><meta charset="utf-8"/><title>Một buổi sáng yên tĩnh</title></head><body><h1>Một buổi sáng yên tĩnh</h1>'+paragraphs+'</body></html>')
with zipfile.ZipFile(root/'Native-comic.cbz', 'w', zipfile.ZIP_DEFLATED) as comic:
    for page in range(1, 6): comic.writestr(f'page-{page}.png', png(580, 820, page))
print('Created two private test publications.')
