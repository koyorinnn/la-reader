export type BookFormat = 'epub' | 'cbz';
export type Theme = 'paper' | 'sepia' | 'dark';
export interface Bookmark { id: string; location: string; label: string; createdAt: number }
export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  filename: string;
  size: number;
  cover?: string;
  addedAt: number;
  lastReadAt?: number;
  progress: number;
  location?: string;
  bookmarks: Bookmark[];
  demo?: boolean;
}
export type ComicLayout = 'single' | 'double';
export interface ReaderSettings { theme: Theme; fontSize: number; lineHeight: number; comicDirection: 'ltr' | 'rtl'; comicLayout: ComicLayout }
export const DEFAULT_SETTINGS: ReaderSettings = { theme: 'paper', fontSize: 19, lineHeight: 1.7, comicDirection: 'ltr', comicLayout: 'single' };
export interface ReadingPosition { location: string; progress: number; label: string }
export interface ReaderProps {
  book: LibraryBook;
  data: ArrayBuffer;
  settings: ReaderSettings;
  onSettings: (settings: ReaderSettings) => void;
  onPosition: (position: ReadingPosition) => void;
  onBookmark: (position: ReadingPosition) => void;
  onClose: () => void;
}
