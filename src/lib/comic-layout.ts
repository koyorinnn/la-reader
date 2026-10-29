import type { ComicLayout } from '../types';

export function getComicSpread(page: number, count: number, layout: ComicLayout, landscape: boolean) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!total) return { start: 0, end: 0, indices: [] as number[], double: false, first: true, last: true };
  const anchor = Number.isFinite(page) ? Math.max(0, Math.min(total - 1, Math.floor(page))) : 0;
  const double = landscape && layout === 'double';
  const start = double ? anchor - anchor % 2 : anchor;
  const end = Math.min(total - 1, start + (double ? 1 : 0));
  return { start, end, indices: end > start ? [start, end] : [start], double, first: start === 0, last: end === total - 1 };
}

export function turnComicPage(page: number, count: number, layout: ComicLayout, landscape: boolean, direction: -1 | 1) {
  const spread = getComicSpread(page, count, layout, landscape);
  if (!spread.indices.length) return 0;
  if (direction > 0 && spread.last || direction < 0 && spread.first) return spread.start;
  return spread.start + direction * (spread.double ? 2 : 1);
}
