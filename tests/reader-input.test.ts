import { describe, expect, it, vi } from 'vitest';
import { bindReaderGestures, gestureDirection, type ReaderGesture } from '../src/lib/reader-input';

const start = (x: number, y = 100): ReaderGesture => ({ x, y, time: 0, id: 1 });
describe('reader gestures', () => {
  it('uses left and right margins while leaving the center for reading', () => {
    expect(gestureDirection(start(20), { x: 20, y: 100, time: 120 }, 390)).toBe(-1);
    expect(gestureDirection(start(375), { x: 375, y: 100, time: 120 }, 390)).toBe(1);
    expect(gestureDirection(start(195), { x: 195, y: 100, time: 120 }, 390)).toBeNull();
  });
  it('does not expand edge taps across a wide desktop page', () => {
    expect(gestureDirection(start(250), { x: 250, y: 100, time: 100 }, 1400)).toBeNull();
  });
  it('ignores long presses and movements that could be selection or scrolling', () => {
    expect(gestureDirection(start(20), { x: 20, y: 100, time: 650 }, 390)).toBeNull();
    expect(gestureDirection(start(20), { x: 24, y: 150, time: 100 }, 390)).toBeNull();
    expect(gestureDirection(start(20), { x: 40, y: 100, time: 100 }, 390)).toBeNull();
  });
  it('recognizes horizontal swipes in both directions, not diagonal scrolls', () => {
    expect(gestureDirection(start(300), { x: 200, y: 120, time: 200 }, 390)).toBe(1);
    expect(gestureDirection(start(100), { x: 200, y: 120, time: 200 }, 390)).toBe(-1);
    expect(gestureDirection(start(100), { x: 200, y: 190, time: 200 }, 390)).toBeNull();
  });
  it('rejects taps outside the visible page', () => {
    expect(gestureDirection(start(-2), { x: -2, y: 100, time: 100 }, 390)).toBeNull();
    expect(gestureDirection(start(395), { x: 395, y: 100, time: 100 }, 390)).toBeNull();
  });
  it('does not navigate from links, controls, multi-touch, selection, or disabled gestures', () => {
    const area = document.createElement('div');
    area.innerHTML = '<a href="#chapter">Chapter</a><button>Control</button><p>Text</p>';
    document.body.append(area);
    const turn = vi.fn();
    let enabled = true;
    const cleanup = bindReaderGestures(area, { bounds: () => ({ left: 0, width: 390 }) as DOMRect, enabled: () => enabled, turn });
    function pointer(target: Element, type: string, primary = true) {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerId: primary ? 1 : 2, button: 0, isPrimary: primary, clientX: 380, clientY: 100 });
      target.dispatchEvent(event);
    }
    for (const target of area.querySelectorAll('a,button')) { pointer(target, 'pointerdown'); pointer(target, 'pointerup'); }
    pointer(area, 'pointerdown'); pointer(area, 'pointerdown', false); pointer(area, 'pointerup');
    enabled = false; pointer(area, 'pointerdown'); pointer(area, 'pointerup'); enabled = true;
    const selection = window.getSelection()!;
    selection.selectAllChildren(area.querySelector('p')!);
    pointer(area, 'pointerdown'); pointer(area, 'pointerup'); selection.removeAllRanges();
    expect(turn).not.toHaveBeenCalled();
    pointer(area, 'pointerdown'); pointer(area, 'pointerup'); expect(turn).toHaveBeenCalledWith(1);
    cleanup(); turn.mockClear(); pointer(area, 'pointerdown'); pointer(area, 'pointerup'); expect(turn).not.toHaveBeenCalled();
    area.remove();
  });
  it('toggles controls for a short center tap, without also turning a page', () => {
    const area = document.createElement('div');
    const turn = vi.fn();
    const toggleControls = vi.fn();
    const cleanup = bindReaderGestures(area, { bounds: () => ({ left: 0, width: 390 }) as DOMRect, enabled: () => true, turn, toggleControls });
    function gesture(x1: number, x2: number, y2 = 100, time = 120) {
      for (const [type, x, y, stamp] of [['pointerdown', x1, 100, 0], ['pointerup', x2, y2, time]] as const) {
        const event = new Event(type, { bubbles: true });
        Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y });
        Object.defineProperty(event, 'timeStamp', { value: stamp });
        area.dispatchEvent(event);
      }
    }
    gesture(195, 195);
    expect(toggleControls).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
    gesture(195, 195, 100, 700); // Long press.
    gesture(195, 195, 160); // Vertical scroll.
    gesture(195, 220); // Selection drag.
    gesture(-5, -5); // Outside the viewport.
    expect(toggleControls).toHaveBeenCalledTimes(1);
    gesture(300, 150); // Swipe.
    gesture(380, 380); // Edge tap.
    expect(turn).toHaveBeenCalledTimes(2);
    expect(toggleControls).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it('keeps center taps on links and selected text from hiding controls', () => {
    const area = document.createElement('div');
    area.innerHTML = '<a href="#chapter">Chapter</a><p>Selectable text</p>';
    document.body.append(area);
    const toggleControls = vi.fn();
    const cleanup = bindReaderGestures(area, { bounds: () => ({ left: 0, width: 390 }) as DOMRect, enabled: () => true, turn: vi.fn(), toggleControls });
    const tap = (target: Element) => {
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new Event(type, { bubbles: true });
        Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: 195, clientY: 100 });
        target.dispatchEvent(event);
      }
    };
    tap(area.querySelector('a')!);
    window.getSelection()!.selectAllChildren(area.querySelector('p')!);
    tap(area);
    expect(toggleControls).not.toHaveBeenCalled();
    window.getSelection()!.removeAllRanges();
    cleanup(); area.remove();
  });
});
