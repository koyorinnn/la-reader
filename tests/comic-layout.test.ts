import { describe, expect, it } from 'vitest';
import { getComicSpread, turnComicPage } from '../src/lib/comic-layout';

describe('CBZ single and double page layout', () => {
  it('always shows one page in portrait while preserving the anchor', () => {
    expect(getComicSpread(3, 6, 'double', false)).toMatchObject({ start: 3, end: 3, indices: [3], double: false });
    expect(turnComicPage(3, 6, 'double', false, 1)).toBe(4);
  });
  it('allows single page in landscape', () => {
    expect(getComicSpread(2, 6, 'single', true).indices).toEqual([2]);
    expect(turnComicPage(2, 6, 'single', true, 1)).toBe(3);
  });
  it('pairs adjacent pages from the beginning of the archive', () => {
    for (let page = 0; page < 6; page++) {
      const start = page - page % 2;
      expect(getComicSpread(page, 6, 'double', true).indices).toEqual([start, start + 1]);
    }
  });
  it('steps by whole spreads without skipping or repeating odd final pages', () => {
    let page = 0;
    const visible: number[] = [];
    while (true) {
      const spread = getComicSpread(page, 5, 'double', true);
      visible.push(...spread.indices);
      if (spread.last) break;
      page = turnComicPage(page, 5, 'double', true, 1);
    }
    expect(visible).toEqual([0, 1, 2, 3, 4]);
    expect(getComicSpread(page, 5, 'double', true)).toMatchObject({ indices: [4], last: true, double: true });
    expect(turnComicPage(4, 5, 'double', true, -1)).toBe(2);
    expect(turnComicPage(2, 5, 'double', true, -1)).toBe(0);
  });
  it('handles an even last pair and clamps turns at both boundaries', () => {
    expect(getComicSpread(5, 6, 'double', true)).toMatchObject({ indices: [4, 5], last: true });
    expect(turnComicPage(5, 6, 'double', true, 1)).toBe(4);
    expect(turnComicPage(0, 6, 'double', true, -1)).toBe(0);
  });
  it('retains an exact selected page when rotating back to portrait', () => {
    const anchor = 3;
    expect(getComicSpread(anchor, 5, 'double', true).indices).toEqual([2, 3]);
    expect(getComicSpread(anchor, 5, 'double', false).indices).toEqual([3]);
    expect(getComicSpread(anchor, 5, 'double', true).indices).toEqual([2, 3]);
  });
  it('handles a one-page publication', () => {
    expect(getComicSpread(0, 1, 'double', true)).toMatchObject({ indices: [0], first: true, last: true });
    expect(turnComicPage(0, 1, 'double', true, 1)).toBe(0);
    expect(turnComicPage(0, 1, 'double', true, -1)).toBe(0);
  });
  it.each([0, -2, NaN, Infinity])('handles empty or malformed count %s', count => {
    expect(getComicSpread(3, count, 'double', true)).toEqual({ start: 0, end: 0, indices: [], double: false, first: true, last: true });
    expect(turnComicPage(3, count, 'double', true, 1)).toBe(0);
  });
  it.each([-2, NaN, Infinity])('normalizes invalid anchor %s', page => {
    expect(getComicSpread(page, 5, 'single', false).indices).toEqual([0]);
  });
  it('floors fractional pages and clamps an out-of-range saved position', () => {
    expect(getComicSpread(2.7, 5, 'single', true).indices).toEqual([2]);
    expect(getComicSpread(99, 5, 'double', true).indices).toEqual([4]);
  });
});
