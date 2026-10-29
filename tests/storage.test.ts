import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LibraryBook } from '../src/types';

const mocks = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  files: new Map<string, string>(),
  get: vi.fn(), set: vi.fn(), writeFile: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: mocks.get, set: mocks.set } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: { writeFile: mocks.writeFile, readFile: mocks.readFile, deleteFile: mocks.deleteFile },
}));

let storage: typeof import('../src/lib/storage');
const INDEX = 'la.library.v1';
const SETTINGS = 'la.settings.v1';
const binary = (...values: number[]): ArrayBuffer => Uint8Array.from(values).buffer;
function book(id: string, changes: Partial<LibraryBook> = {}): LibraryBook {
  return { id, title: `Sách ${id}`, author: 'Tác giả', format: 'epub', filename: `${id}.epub`, size: 4, addedAt: 100, progress: 0, bookmarks: [], ...changes };
}

beforeEach(async () => {
  vi.resetModules();
  mocks.preferences.clear();
  mocks.files.clear();
  vi.resetAllMocks();
  mocks.get.mockImplementation(async ({ key }: { key: string }) => ({ value: mocks.preferences.get(key) ?? null }));
  mocks.set.mockImplementation(async ({ key, value }: { key: string; value: string }) => { mocks.preferences.set(key, value); });
  mocks.writeFile.mockImplementation(async ({ path, data }: { path: string; data: string }) => { mocks.files.set(path, data); return { uri: path }; });
  mocks.readFile.mockImplementation(async ({ path }: { path: string }) => {
    const data = mocks.files.get(path);
    if (data === undefined) throw new Error('File not found');
    return { data };
  });
  mocks.deleteFile.mockImplementation(async ({ path }: { path: string }) => { mocks.files.delete(path); });
  storage = await import('../src/lib/storage');
});

describe('native library storage', () => {
  it('roundtrips all binary byte values across base64 chunk boundaries', async () => {
    const data = Uint8Array.from({ length: 20001 }, (_, index) => index % 256).buffer;
    const entry = book('roundtrip', { size: data.byteLength });
    await storage.putBook(entry, data);
    expect(new Uint8Array(await storage.readBook(entry.id))).toEqual(new Uint8Array(data));
    expect(await storage.loadBooks()).toEqual([entry]);
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'books/roundtrip.zip', directory: 'DATA', recursive: true }));
  });

  it('serializes concurrent imports without losing shelf entries', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => book(`book-${index}`));
    await Promise.all(entries.map((entry, index) => storage.putBook(entry, binary(index, 255, 0))));
    expect((await storage.loadBooks()).map(entry => entry.id).sort()).toEqual(entries.map(entry => entry.id).sort());
    expect(mocks.files.size).toBe(entries.length);
    for (const [index, entry] of entries.entries()) expect(new Uint8Array(await storage.readBook(entry.id))).toEqual(Uint8Array.from([index, 255, 0]));
  });

  it('waits for pending writes before reading the library or a file', async () => {
    let releaseWrite!: () => void;
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    mocks.writeFile.mockImplementationOnce(async ({ path, data }: { path: string; data: string }) => {
      await gate;
      mocks.files.set(path, data);
      return { uri: path };
    });
    const save = storage.putBook(book('pending'), binary(9, 8, 7));
    let settled = false;
    const read = storage.readBook('pending').then(result => { settled = true; return result; });
    const shelf = storage.loadBooks();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseWrite();
    await save;
    expect(new Uint8Array(await read)).toEqual(Uint8Array.from([9, 8, 7]));
    expect((await shelf).map(entry => entry.id)).toEqual(['pending']);
  });

  it('replaces metadata for duplicate IDs without creating duplicate shelf entries', async () => {
    const data = binary(4, 3, 2, 1);
    await storage.putBook(book('same'), data);
    const replacement = book('same', { title: 'Tên mới', progress: 0.6, location: 'epubcfi(/6/2)' });
    await storage.putBook(replacement, data);
    expect(await storage.loadBooks()).toEqual([replacement]);
    expect(new Uint8Array(await storage.readBook('same'))).toEqual(new Uint8Array(data));
    expect(mocks.files.size).toBe(1);
  });

  it('updates progress and bookmarks without rewriting the stored archive', async () => {
    await storage.putBook(book('reading'), binary(7, 6, 5));
    const updated = book('reading', { progress: 0.75, location: 'page:7', bookmarks: [{ id: 'mark', location: 'page:7', label: 'Trang 8', createdAt: 200 }] });
    await storage.updateBook(updated);
    expect(await storage.loadBooks()).toEqual([updated]);
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await storage.readBook('reading'))).toEqual(Uint8Array.from([7, 6, 5]));
  });

  it('removes the index and archive while keeping other books', async () => {
    await storage.putBook(book('remove'), binary(1));
    await storage.putBook(book('keep'), binary(2));
    await storage.removeBook('remove');
    expect((await storage.loadBooks()).map(entry => entry.id)).toEqual(['keep']);
    expect(mocks.files.has('books/remove.zip')).toBe(false);
    expect(new Uint8Array(await storage.readBook('keep'))).toEqual(Uint8Array.from([2]));
  });

  it('does not recreate a removed entry when stale progress arrives later', async () => {
    await storage.putBook(book('gone'), binary(1));
    await storage.removeBook('gone');
    await storage.updateBook(book('gone', { progress: 0.8 }));
    expect(await storage.loadBooks()).toEqual([]);
    expect(mocks.files.size).toBe(0);
  });

  it('keeps a valid shelf when archive deletion fails', async () => {
    await storage.putBook(book('orphan'), binary(1));
    mocks.deleteFile.mockRejectedValueOnce(new Error('Disk busy'));
    await storage.removeBook('orphan');
    expect(await storage.loadBooks()).toEqual([]);
  });

  it('rolls back a new file when index storage fails and allows later imports', async () => {
    mocks.set.mockRejectedValueOnce(new Error('Preferences full'));
    await expect(storage.putBook(book('failed'), binary(1))).rejects.toThrow('Preferences full');
    expect(mocks.files.has('books/failed.zip')).toBe(false);
    expect(await storage.loadBooks()).toEqual([]);
    await storage.putBook(book('next'), binary(2));
    expect((await storage.loadBooks()).map(entry => entry.id)).toEqual(['next']);
  });

  it('preserves a previously imported file if duplicate metadata replacement fails', async () => {
    const data = binary(0, 128, 255, 65);
    const original = book('existing');
    await storage.putBook(original, data);
    mocks.set.mockRejectedValueOnce(new Error('Preferences full'));
    await expect(storage.putBook(book('existing', { title: 'Replacement' }), data)).rejects.toThrow('Preferences full');
    expect(await storage.loadBooks()).toEqual([original]);
    expect(new Uint8Array(await storage.readBook('existing'))).toEqual(new Uint8Array(data));
  });

  it('rejects corrupted library metadata instead of replacing the library silently', async () => {
    mocks.preferences.set(INDEX, '{ broken JSON');
    await expect(storage.loadBooks()).rejects.toThrow();
    mocks.preferences.set(INDEX, JSON.stringify({ books: [] }));
    await expect(storage.loadBooks()).rejects.toThrow(/không hợp lệ/);
  });
});

describe('reader preferences', () => {
  it('returns defaults for absent, malformed or null settings', async () => {
    expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    for (const value of ['not json', 'null', '{}']) {
      mocks.preferences.set(SETTINGS, value);
      expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('clamps numeric values and falls back for unknown options', async () => {
    mocks.preferences.set(SETTINGS, JSON.stringify({ theme: 'neon', fontSize: 100, lineHeight: 0.1, comicDirection: 'backward' }));
    expect(await storage.loadSettings()).toEqual({ theme: 'paper', fontSize: 30, lineHeight: 1.3, comicDirection: 'ltr', comicLayout: 'single' });
    mocks.preferences.set(SETTINGS, JSON.stringify({ theme: 'dark', fontSize: -5, lineHeight: 9, comicDirection: 'rtl' }));
    expect(await storage.loadSettings()).toEqual({ theme: 'dark', fontSize: 14, lineHeight: 2.2, comicDirection: 'rtl', comicLayout: 'single' });
    mocks.preferences.set(SETTINGS, JSON.stringify({ fontSize: 'invalid', lineHeight: 'invalid' }));
    expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and restores valid reader settings', async () => {
    const settings = { theme: 'sepia' as const, fontSize: 24, lineHeight: 1.9, comicDirection: 'rtl' as const, comicLayout: 'double' as const };
    await storage.saveSettings(settings);
    expect(await storage.loadSettings()).toEqual(settings);
  });

  it('migrates old reader preferences to single-page comics while retaining other settings', async () => {
    mocks.preferences.set(SETTINGS, JSON.stringify({ theme: 'dark', fontSize: 22, lineHeight: 1.8, comicDirection: 'rtl' }));
    expect(await storage.loadSettings()).toEqual({ theme: 'dark', fontSize: 22, lineHeight: 1.8, comicDirection: 'rtl', comicLayout: 'single' });
  });

  it('accepts only the double-page option and falls back for malformed comic layout values', async () => {
    mocks.preferences.set(SETTINGS, JSON.stringify({ comicLayout: 'double' }));
    expect((await storage.loadSettings()).comicLayout).toBe('double');
    for (const comicLayout of ['single', 'Double', 'spread', '', null, true, 2, {}, ['double']]) {
      mocks.preferences.set(SETTINGS, JSON.stringify({ comicLayout }));
      expect((await storage.loadSettings()).comicLayout).toBe('single');
    }
  });
});

describe('legacy sample cleanup', () => {
  function seedLegacyLibrary() {
    const demo = book('legacy-demo', { title: 'Cùng một tựa sách', demo: true });
    const secondDemo = book('legacy-comic', { format: 'cbz', demo: true });
    const imported = book('personal-import', { title: demo.title });
    const explicitImport = book('personal-no-demo', { title: demo.title, demo: false });
    const entries = [demo, imported, secondDemo, explicitImport];
    mocks.preferences.set(INDEX, JSON.stringify(entries));
    for (const entry of entries) mocks.files.set(`books/${entry.id}.zip`, 'AQID');
    return { demo, secondDemo, imported, explicitImport, entries };
  }

  it('removes only demo:true records and their bytes, preserving ordinary books with the same title', async () => {
    const { imported, explicitImport } = seedLegacyLibrary();
    expect(await storage.loadBooks()).toEqual([imported, explicitImport]);
    expect(JSON.parse(mocks.preferences.get(INDEX)!)).toEqual([imported, explicitImport]);
    expect([...mocks.files.keys()].sort()).toEqual(['books/personal-import.zip', 'books/personal-no-demo.zip']);
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
    expect(mocks.deleteFile).toHaveBeenCalledWith({ path: 'books/legacy-demo.zip', directory: 'DATA' });
    expect(mocks.deleteFile).toHaveBeenCalledWith({ path: 'books/legacy-comic.zip', directory: 'DATA' });
    expect(new Uint8Array(await storage.readBook(imported.id))).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('is idempotent on repeated loads without deleting imported files or rewriting the index', async () => {
    const { imported, explicitImport } = seedLegacyLibrary();
    await storage.loadBooks();
    const deletes = mocks.deleteFile.mock.calls.length;
    const writes = mocks.set.mock.calls.length;
    expect(await storage.loadBooks()).toEqual([imported, explicitImport]);
    expect(await storage.loadBooks()).toEqual([imported, explicitImport]);
    expect(mocks.deleteFile).toHaveBeenCalledTimes(deletes);
    expect(mocks.set).toHaveBeenCalledTimes(writes);
  });

  it('serializes concurrent loads so each legacy sample is removed only once', async () => {
    const { imported, explicitImport } = seedLegacyLibrary();
    const results = await Promise.all([storage.loadBooks(), storage.loadBooks(), storage.loadBooks()]);
    for (const result of results) expect(result).toEqual([imported, explicitImport]);
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('preserves imports queued during sample migration', async () => {
    const { imported, explicitImport } = seedLegacyLibrary();
    const newlyImported = book('newly-imported', { title: 'Cùng một tựa sách' });
    await Promise.all([storage.loadBooks(), storage.putBook(newlyImported, binary(7, 8, 9))]);
    expect(await storage.loadBooks()).toEqual([imported, explicitImport, newlyImported]);
    expect(new Uint8Array(await storage.readBook(newlyImported.id))).toEqual(Uint8Array.from([7, 8, 9]));
    expect(mocks.files.has('books/personal-import.zip')).toBe(true);
  });

  it('surfaces failed sample-file deletion and keeps ordinary imported bytes intact', async () => {
    const { imported, explicitImport } = seedLegacyLibrary();
    mocks.deleteFile.mockRejectedValueOnce(new Error('Sample file is busy'));
    await expect(storage.loadBooks()).rejects.toThrow();
    expect(mocks.files.has(`books/${imported.id}.zip`)).toBe(true);
    expect(mocks.files.has(`books/${explicitImport.id}.zip`)).toBe(true);
  });

  it('surfaces failed migration index writes instead of reporting a completed cleanup', async () => {
    const { imported } = seedLegacyLibrary();
    mocks.set.mockRejectedValueOnce(new Error('Preferences unavailable'));
    await expect(storage.loadBooks()).rejects.toThrow('Preferences unavailable');
    expect(mocks.files.has(`books/${imported.id}.zip`)).toBe(true);
  });
});
