import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SETTINGS, type LibraryBook, type ReaderSettings } from '../types';

const native = Capacitor.isNativePlatform();
const INDEX = 'la.library.v1';
const SETTINGS = 'la.settings.v1';
let dbPromise: Promise<IDBDatabase> | undefined;
let queue = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function database() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('la-reader', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Không thể mở bộ nhớ. Hãy kiểm tra dung lượng còn trống.'));
  });
}
async function readStore<T>(store: string, key?: string): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = key ? tx.objectStore(store).get(key) : tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
async function changeStore(change: (tx: IDBTransaction) => void) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'files'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Không lưu được sách. Hãy kiểm tra dung lượng còn trống.'));
    tx.onabort = () => reject(new Error('Thao tác lưu sách bị gián đoạn.'));
    change(tx);
  });
}
async function nativeBooks(): Promise<LibraryBook[]> {
  const { value } = await Preferences.get({ key: INDEX });
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Dữ liệu thư viện không hợp lệ.');
  return parsed as LibraryBook[];
}
function encode(data: ArrayBuffer) {
  const bytes = new Uint8Array(data); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function decode(value: string): ArrayBuffer {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
export function loadBooks(): Promise<LibraryBook[]> {
  return serialize(async () => {
    const books = native ? await nativeBooks() : await readStore<LibraryBook[]>('books');
    const demos = books.filter(book => book.demo === true);
    if (!demos.length) return books;
    const imported = books.filter(book => book.demo !== true);
    if (!native) {
      await changeStore(tx => {
        for (const book of demos) {
          tx.objectStore('books').delete(book.id);
          tx.objectStore('files').delete(book.id);
        }
      });
    } else {
      for (const book of demos) {
        try { await Filesystem.deleteFile({ path: `books/${book.id}.zip`, directory: Directory.Data }); }
        catch (error) {
          // A previous interrupted cleanup may already have removed this file.
          const code = (error as { code?: string })?.code;
          const message = error instanceof Error ? error.message : String(error);
          if (code !== 'OS-PLUG-FILE-0008' && !/does not exist|not found|no such file/i.test(message)) throw error;
        }
      }
      await Preferences.set({ key: INDEX, value: JSON.stringify(imported) });
    }
    return imported;
  });
}
export function putBook(book: LibraryBook, data: ArrayBuffer): Promise<void> {
  return serialize(async () => {
    if (!native) { await changeStore(tx => { tx.objectStore('books').put(book); tx.objectStore('files').put(data, book.id); }); return; }
    const books = await nativeBooks();
    // IDs are content hashes. Re-importing identical bytes only updates metadata;
    // never overwrite an existing archive before its index update commits.
    if (books.some(item => item.id === book.id)) {
      await Preferences.set({ key: INDEX, value: JSON.stringify(books.map(item => item.id === book.id ? book : item)) });
      return;
    }
    await Filesystem.writeFile({ path: `books/${book.id}.zip`, data: encode(data), directory: Directory.Data, recursive: true });
    try { await Preferences.set({ key: INDEX, value: JSON.stringify([...books.filter(b => b.id !== book.id), book]) }); }
    catch (error) { await Filesystem.deleteFile({ path: `books/${book.id}.zip`, directory: Directory.Data }).catch(() => {}); throw error; }
  });
}
export function updateBook(book: LibraryBook): Promise<void> {
  return serialize(async () => {
    if (!native) {
      await changeStore(tx => {
        const store = tx.objectStore('books');
        const existing = store.get(book.id);
        existing.onsuccess = () => { if (existing.result) store.put(book); };
      });
      return;
    }
    const books = await nativeBooks();
    await Preferences.set({ key: INDEX, value: JSON.stringify(books.map(b => b.id === book.id ? book : b)) });
  });
}
export function removeBook(id: string): Promise<void> {
  return serialize(async () => {
    if (!native) { await changeStore(tx => { tx.objectStore('books').delete(id); tx.objectStore('files').delete(id); }); return; }
    const books = await nativeBooks();
    // Remove the index first: a failed file deletion leaves an orphan, never a broken shelf entry.
    await Preferences.set({ key: INDEX, value: JSON.stringify(books.filter(b => b.id !== id)) });
    await Filesystem.deleteFile({ path: `books/${id}.zip`, directory: Directory.Data }).catch(() => {});
  });
}
export async function readBook(id: string): Promise<ArrayBuffer> {
  await queue;
  if (!native) {
    const data = await readStore<ArrayBuffer | undefined>('files', id);
    if (!data) throw new Error('Không tìm thấy tệp sách. Hãy xóa mục này và nhập lại tệp.');
    return data;
  }
  const file = await Filesystem.readFile({ path: `books/${id}.zip`, directory: Directory.Data });
  return typeof file.data === 'string' ? decode(file.data) : file.data.arrayBuffer();
}
export async function fingerprint(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function loadSettings(): Promise<ReaderSettings> {
  const { value } = await Preferences.get({ key: SETTINGS });
  try {
    const s = value ? JSON.parse(value) : {};
    return {
      theme: ['paper', 'sepia', 'dark'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
      fontSize: Math.max(14, Math.min(30, Number(s.fontSize) || 19)),
      lineHeight: Math.max(1.3, Math.min(2.2, Number(s.lineHeight) || 1.7)),
      comicDirection: s.comicDirection === 'rtl' ? 'rtl' : 'ltr',
      comicLayout: s.comicLayout === 'double' ? 'double' : 'single',
    };
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(settings: ReaderSettings) {
  return Preferences.set({ key: SETTINGS, value: JSON.stringify(settings) });
}
