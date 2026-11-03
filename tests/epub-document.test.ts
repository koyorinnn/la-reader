import { describe, expect, it } from 'vitest';
import { EPUB_CSP, protectEpubDocument } from '../src/lib/epub-document';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
describe('publication documents with trusted WebKit input handlers', () => {
  it('removes active content and installs restrictive CSP before all resources', () => {
    const doc = parse(`<head><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><meta http-equiv="Content-Security-Policy" content="script-src * 'unsafe-inline'"><script>alert(1)</script></head><body onload="alert(2)"><iframe srcdoc="test"></iframe><object></object><embed><form><input></form><p>Keep text</p></body>`);
    protectEpubDocument(doc);
    expect(doc.querySelectorAll('script,iframe,object,embed,form,base,[onload]').length).toBe(0);
    expect(doc.head.firstElementChild?.getAttribute('content')).toBe(EPUB_CSP);
    expect(doc.querySelectorAll('meta[http-equiv]').length).toBe(1);
    expect(EPUB_CSP).toContain("script-src 'none'");
    expect(EPUB_CSP).toContain("connect-src 'none'");
    expect(doc.body.textContent).toContain('Keep text');
  });
  it('keeps local reading resources and chapter links without active URL schemes', () => {
    const doc = parse(`<body><img id="remote" src="https://evil.example/pixel"><img id="local" src="cover.jpg"><img id="data" src="data:image/png;base64,abc"><a id="chapter" href="chapter2.xhtml#heading">Next</a><a id="script" href="java&#10;script:alert(1)" onclick="alert(2)">Script</a><a id="dataLink" href="data:text/html,test" target="_top">Data</a><a id="blobLink" href="blob:https://example/uuid">Blob</a></body>`);
    protectEpubDocument(doc);
    expect(doc.querySelector('#remote')?.hasAttribute('src')).toBe(false);
    expect(doc.querySelector('#local')?.getAttribute('src')).toBe('cover.jpg');
    expect(doc.querySelector('#data')?.getAttribute('src')).toContain('data:image');
    expect(doc.querySelector('#chapter')?.getAttribute('href')).toBe('chapter2.xhtml#heading');
    for (const id of ['script', 'dataLink', 'blobLink']) expect(doc.querySelector('#'+id)?.hasAttribute('href')).toBe(false);
    expect(doc.querySelectorAll('[onclick],[target]').length).toBe(0);
  });
  it('protects a spine document even when the original head is missing', () => {
    const doc = parse('<body><h1>Chapter</h1></body>');
    doc.head.remove();
    protectEpubDocument(doc);
    expect(doc.documentElement.firstElementChild?.localName).toBe('head');
    expect(doc.querySelector('head>meta')?.getAttribute('content')).toBe(EPUB_CSP);
  });
});
