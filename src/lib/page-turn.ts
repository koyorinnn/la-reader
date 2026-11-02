import type { PageAnimation } from '../types';

const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

// Copy the visible viewport, including EPUB's isolated document and scroll offsets.
// The snapshot is inert and lives only for one page turn; the original remains the reader.
async function snapshot(surface: HTMLElement, parent: HTMLElement, width: number, height: number) {
  const copy = surface.cloneNode(true) as HTMLElement;
  copy.classList.add('rd-page-snapshot');
  copy.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;pointer-events:none;`;
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  const originals = [...surface.querySelectorAll<HTMLIFrameElement>('iframe')];
  const ready: Promise<unknown>[] = [];
  copy.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame, index) => {
    const original = originals[index];
    frame.removeAttribute('src');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.tabIndex = -1;
    if (original.contentDocument) {
      ready.push(new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 180);
        frame.onload = () => { clearTimeout(timer); resolve(); };
      }));
      const html = original.contentDocument.documentElement.cloneNode(true) as HTMLElement;
      const styles = [...original.contentDocument.querySelectorAll('style')];
      html.querySelectorAll('style').forEach((style, index) => {
        // EPUB themes insert CSSOM rules; those are absent from style.outerHTML.
        try { const rules = styles[index].sheet?.cssRules; if (rules) style.textContent = [...rules].map(rule => rule.cssText).join('\n'); } catch { /* retain serialized styles when a sheet is unreadable */ }
      });
      frame.srcdoc = '<!DOCTYPE html>' + html.outerHTML;
    }
  });
  parent.append(copy);
  const elements = [surface, ...surface.querySelectorAll<HTMLElement>('*')];
  const clones = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
  const restoreScroll = () => elements.forEach((element, index) => {
    if (clones[index]) { clones[index].scrollLeft = element.scrollLeft; clones[index].scrollTop = element.scrollTop; }
  });
  restoreScroll();
  await Promise.all(ready);
  await Promise.all([...copy.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
  restoreScroll();
  return copy;
}

export async function animatePageTurn(options: {
  surface: HTMLElement;
  direction: -1 | 1;
  double: boolean;
  style: PageAnimation;
  signal: AbortSignal;
  navigate: () => Promise<void>;
}) {
  const { surface, direction, double, style, signal, navigate } = options;
  if (style === 'none' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { await navigate(); return; }
  const { width, height } = surface.getBoundingClientRect();
  if (!width || !height) { await navigate(); return; }
  const layer = document.createElement('div');
  layer.className = `rd-turn-overlay rd-turn-${style}`;
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const animations: Animation[] = [];
  const cancel = () => { animations.forEach(animation => animation.cancel()); layer.remove(); };
  signal.addEventListener('abort', cancel, { once: true });
  surface.parentElement!.append(layer);
  try {
    // Keep the old spread visible while EPUB lays out the next chapter or images decode.
    const old = await snapshot(surface, layer, width, height);
    let leaf: HTMLDivElement | undefined;
    let back: HTMLDivElement | undefined;
    if (style === 'curl') {
      leaf = document.createElement('div');
      leaf.className = 'rd-turn-leaf';
      const leafWidth = double ? width / 2 : width;
      const leafLeft = double && direction > 0 ? width / 2 : 0;
      leaf.style.cssText = `width:${leafWidth}px;left:${leafLeft}px;transform-origin:${direction > 0 ? 'left' : 'right'} center;`;
      const front = document.createElement('div');
      front.className = 'rd-turn-face rd-turn-front';
      back = document.createElement('div');
      back.className = 'rd-turn-face rd-turn-back';
      leaf.append(front, back);
      layer.append(leaf);
      // Capture before navigation releases the old CBZ image's object URL.
      const frontCopy = await snapshot(surface, front, width, height);
      frontCopy.style.left = `${-leafLeft}px`;
    }
    if (signal.aborted) return;
    await navigate();
    await paint();
    await Promise.all([...surface.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
    if (signal.aborted) return;
    const duration = style === 'slide' ? 240 : 540;
    const timing: KeyframeAnimationOptions = { duration, easing: 'cubic-bezier(.22,.65,.28,1)', fill: 'forwards' };
    if (style === 'slide') {
      animations.push(old.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-direction * 22}%)`, opacity: 0 }], timing));
    } else if (leaf && back) {
      if (double) {
        const backCopy = await snapshot(surface, back, width, height);
        backCopy.style.left = `${direction > 0 ? 0 : -width / 2}px`;
      }
      if (signal.aborted) return;
      if (double) old.style.clipPath = direction > 0 ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
      else old.remove();
      animations.push(leaf.animate([
        { transform: 'rotateY(0deg)', filter: 'brightness(1)', opacity: 1 },
        { transform: `rotateY(${-direction * 85}deg)`, filter: 'brightness(.93)', opacity: 1, offset: .52 },
        { transform: `rotateY(${-direction * (double ? 180 : 125)}deg)`, filter: 'brightness(1)', opacity: double ? 1 : 0 },
      ], timing));
    }
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}
