export interface ReaderGesture { x: number; y: number; time: number; id: number }

// Physical directions: -1 is the left edge, 1 is the right edge.
export function gestureDirection(start: ReaderGesture, end: { x: number; y: number; time: number }, width: number): -1 | 1 | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 1 : -1;
  if (Math.hypot(dx, dy) > 12 || end.time - start.time > 450 || width <= 0) return null;
  const edge = Math.min(84, Math.max(44, width * 0.16));
  if (end.x >= 0 && end.x <= edge) return -1;
  if (end.x <= width && end.x >= width - edge) return 1;
  return null;
}

export function bindReaderGestures(target: HTMLElement | Document, options: {
  bounds: () => DOMRect | undefined;
  enabled: () => boolean;
  turn: (direction: -1 | 1) => void;
  frame?: HTMLIFrameElement;
}) {
  let start: ReaderGesture | null = null;
  const doc = target.nodeType === 9 ? target as Document : target.ownerDocument!;
  const interactive = (event: PointerEvent) => (event.target as Element | null)?.closest?.('a,button,input,textarea,select,label,[contenteditable],audio,video');
  const coordinates = (event: PointerEvent) => {
    const bounds = options.bounds();
    const frameBounds = options.frame?.getBoundingClientRect();
    return { x: event.clientX + (frameBounds?.left || 0) - (bounds?.left || 0), y: event.clientY + (frameBounds?.top || 0), time: event.timeStamp };
  };
  const down = (raw: Event) => {
    const event = raw as PointerEvent;
    start = event.isPrimary && event.button === 0 && options.enabled() && !interactive(event)
      ? { ...coordinates(event), id: event.pointerId } : null;
  };
  const up = (raw: Event) => {
    const event = raw as PointerEvent;
    const origin = start;
    start = null;
    if (!origin || origin.id !== event.pointerId || !options.enabled() || interactive(event) || doc.getSelection()?.toString()) return;
    const direction = gestureDirection(origin, coordinates(event), options.bounds()?.width || 0);
    if (direction) options.turn(direction);
  };
  const cancel = () => { start = null; };
  target.addEventListener('pointerdown', down, { passive: true });
  target.addEventListener('pointerup', up, { passive: true });
  target.addEventListener('pointercancel', cancel, { passive: true });
  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', cancel);
  };
}
