export interface ReaderGesture { x: number; y: number; time: number; id: number }

function isTap(start: ReaderGesture, end: { x: number; y: number; time: number }, width: number) {
  return width > 0 && end.x >= 0 && end.x <= width && Math.hypot(end.x - start.x, end.y - start.y) <= 12 && end.time - start.time <= 450;
}

// Each side takes 30% of the visible reader, leaving a generous 40% center
// for controls. Never cap this in pixels: that made iPad taps reach the bezel.
export function gestureDirection(start: ReaderGesture, end: { x: number; y: number; time: number }, width: number): -1 | 1 | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 1 : -1;
  if (!isTap(start, end, width)) return null;
  const edge = width * 0.3;
  if (end.x >= 0 && end.x <= edge) return -1;
  if (end.x <= width && end.x >= width - edge) return 1;
  return null;
}

export function bindReaderGestures(target: HTMLElement | Document, options: {
  bounds: () => DOMRect | undefined;
  enabled: () => boolean;
  turn: (direction: -1 | 1) => void;
  toggleControls?: () => void;
  frame?: HTMLIFrameElement;
}) {
  let start: ReaderGesture | null = null;
  const doc = target.nodeType === 9 ? target as Document : target.ownerDocument!;
  const interactive = (event: PointerEvent) => {
    const node = event.target as Node | null;
    const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
    return element?.closest('a,button,input,textarea,select,label,[contenteditable],audio,video');
  };
  const coordinates = (event: PointerEvent) => {
    const bounds = options.bounds();
    const frameBounds = options.frame?.getBoundingClientRect();
    return { x: event.clientX + (frameBounds?.left || 0) - (bounds?.left || 0), y: event.clientY + (frameBounds?.top || 0), time: event.timeStamp };
  };
  const down = (raw: Event) => {
    const event = raw as PointerEvent;
    start = event.isPrimary && event.button === 0 && options.enabled() && !interactive(event) && !doc.getSelection()?.toString()
      ? { ...coordinates(event), id: event.pointerId } : null;
  };
  const up = (raw: Event) => {
    const event = raw as PointerEvent;
    const origin = start;
    start = null;
    if (!origin || origin.id !== event.pointerId || !options.enabled() || interactive(event) || doc.getSelection()?.toString()) return;
    const end = coordinates(event);
    const width = options.bounds()?.width || 0;
    const direction = gestureDirection(origin, end, width);
    if (direction) options.turn(direction);
    else if (isTap(origin, end, width)) options.toggleControls?.();
  };
  const cancel = () => { start = null; };
  target.addEventListener('pointerdown', down, { passive: true, capture: true });
  target.addEventListener('pointerup', up, { passive: true, capture: true });
  target.addEventListener('pointercancel', cancel, { passive: true, capture: true });
  return () => {
    target.removeEventListener('pointerdown', down, true);
    target.removeEventListener('pointerup', up, true);
    target.removeEventListener('pointercancel', cancel, true);
  };
}
