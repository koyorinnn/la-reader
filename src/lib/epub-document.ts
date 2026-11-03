// WebKit needs allow-scripts on the iframe to deliver events to our parent-owned
// listeners. Publication code is still prohibited by this CSP, applied before
// the document is serialized or any resource is loaded into the iframe.
export const EPUB_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:; form-action 'none'; base-uri 'none'";

export function protectEpubDocument(document: Document) {
  document.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv]').forEach(element => element.remove());
  document.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.replace(/[\u0000-\u0020]/g, '');
      if (/^on/i.test(name) || /^(?:javascript|vbscript):/i.test(value)) element.removeAttribute(attribute.name);
      if (['src', 'href', 'xlink:href', 'poster'].includes(name) && /^(?:https?:)?\/\//i.test(value) && element.localName !== 'a') element.removeAttribute(attribute.name);
      if (element.localName === 'a' && (name === 'target' || name === 'download' || (name === 'href' && /^[a-z][\w+.-]*:/i.test(value)))) element.removeAttribute(attribute.name);
    }
  });
  let head = document.querySelector('head');
  if (!head) {
    head = document.createElement('head');
    document.documentElement.prepend(head);
  }
  const csp = document.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', EPUB_CSP);
  head.prepend(csp);
}
