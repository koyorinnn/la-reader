import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ArrowDownWideNarrow, ArrowRight, Bookmark, BookOpen, Check, ChevronRight, CloudOff, Grid2X2, Library, List, LoaderCircle, Moon, Plus, Search, Settings2, Sun, Trash2, X } from 'lucide-react';
import { extractMetadata, MAX_FILE_BYTES } from './lib/archive';
import * as storage from './lib/storage';
import { DEFAULT_SETTINGS, type LibraryBook, type ReaderSettings, type ReadingPosition } from './types';
import Reader from './components/Reader';
type View = 'all' | 'reading' | 'bookmarks';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';

export default function App() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const booksRef = useRef<LibraryBook[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const [view, setView] = useState<View>('all');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [active, setActive] = useState<{ id: string; data: ArrayBuffer }>();
  const [modal, setModal] = useState<'settings' | 'about' | null>(null);
  const [deleting, setDeleting] = useState<LibraryBook>();
  const picker = useRef<HTMLInputElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const replaceBooks = useCallback((next: LibraryBook[]) => { booksRef.current = next; setBooks(next); }, []);

  useEffect(() => {
    let live = true;
    Promise.all([storage.loadBooks(), storage.loadSettings()]).then(([items, prefs]) => {
      if (live) { replaceBooks(items); setSettings(prefs); }
    }).catch(error => { if (live) notify(errorText(error), true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [replaceBooks, notify]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(undefined), toast.error ? 9000 : 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (activeRef.current) setActive(undefined);
      else if (modal) setModal(null);
      else if (deleting) setDeleting(undefined);
      else NativeApp.minimizeApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [modal, deleting]);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);
  useEffect(() => {
    if (!active && !modal && !deleting) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = document.querySelectorAll<HTMLElement>('.sidebar, .main-content, .mobile-nav');
    background.forEach(element => { element.inert = true; });
    return () => { document.body.style.overflow = previous; background.forEach(element => { element.inert = false; }); };
  }, [active, modal, deleting]);
  useEffect(() => {
    if (!modal && !deleting) return;
    const focus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(document.querySelectorAll<HTMLElement>('.dialog button:not([disabled]), .dialog input, .dialog select'));
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', focus); return () => document.removeEventListener('keydown', focus);
  }, [modal, deleting]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setModal(null); setDeleting(undefined); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  const changeSettings = (next: ReaderSettings) => { setSettings(next); void storage.saveSettings(next).catch(error => notify(errorText(error), true)); };
  const persistBook = useCallback((book: LibraryBook) => {
    replaceBooks(booksRef.current.map(item => item.id === book.id ? book : item));
    void storage.updateBook(book).catch(error => notify(`Chưa lưu được tiến độ: ${errorText(error)}`, true));
  }, [replaceBooks, notify]);
  const openBook = async (book: LibraryBook) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('Đang mở sách…');
    try { const data = await storage.readBook(book.id); persistBook({ ...book, lastReadAt: Date.now() }); setActive({ id: book.id, data }); }
    catch (error) { notify(errorText(error), true); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const importData = async (data: ArrayBuffer, filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension !== 'epub' && extension !== 'cbz') throw new Error('Hãy chọn tệp .epub hoặc .cbz.');
    if (data.byteLength > MAX_FILE_BYTES) throw new Error('Tệp vượt quá 100 MB. Hãy chọn tệp nhỏ hơn.');
    const id = await storage.fingerprint(data);
    const existing = booksRef.current.find(book => book.id === id);
    if (existing) return { book: existing, existing: true };
    const metadata = await extractMetadata(data, extension, filename);
    const book: LibraryBook = { ...metadata, id, format: extension, filename, size: data.byteLength, addedAt: Date.now(), progress: 0, bookmarks: [] };
    await storage.putBook(book, data);
    replaceBooks([...booksRef.current, book]);
    if (!Capacitor.isNativePlatform()) void navigator.storage?.persist?.().catch(() => {});
    return { book, existing: false };
  };
  const importFiles = async (files: File[]) => {
    if (busyRef.current || !files.length) return;
    busyRef.current = true;
    let count = 0; let duplicates = 0; const failures: string[] = [];
    try {
      for (const file of files) {
        setBusy(`Đang nhập ${file.name}…`);
        try {
          if (file.size > MAX_FILE_BYTES) throw new Error('Tệp vượt quá 100 MB.');
          const result = await importData(await file.arrayBuffer(), file.name);
          result.existing ? duplicates++ : count++;
        } catch (error) { failures.push(`${file.name}: ${errorText(error)}`); }
      }
      setView('all'); setFilter('all'); setSearch('');
      notify([count ? `Đã thêm ${count} sách vào thư viện.` : '', duplicates ? `${duplicates} sách đã có trong thư viện.` : '', ...failures].filter(Boolean).join(' '), failures.length > 0);
    } finally { busyRef.current = false; setBusy(''); }
  };
  const updatePosition = useCallback((position: ReadingPosition) => {
    const current = booksRef.current.find(book => book.id === activeRef.current?.id);
    if (current) persistBook({ ...current, location: position.location, progress: Math.max(0, Math.min(1, position.progress)), lastReadAt: Date.now() });
  }, [persistBook]);
  const bookmark = useCallback((position: ReadingPosition) => {
    const current = booksRef.current.find(book => book.id === activeRef.current?.id);
    if (!current) return;
    const exists = current.bookmarks.some(mark => mark.location === position.location);
    persistBook({ ...current, bookmarks: exists ? current.bookmarks.filter(mark => mark.location !== position.location) : [...current.bookmarks, { id: crypto.randomUUID(), ...position, label: position.label || 'Trang đã lưu', createdAt: Date.now() }] });
    notify(exists ? 'Đã bỏ dấu trang.' : 'Đã lưu dấu trang.');
  }, [persistBook, notify]);
  const deleteBook = async () => {
    if (!deleting) return;
    try { await storage.removeBook(deleting.id); replaceBooks(booksRef.current.filter(book => book.id !== deleting.id)); setDeleting(undefined); notify('Đã xóa sách khỏi thư viện.'); }
    catch (error) { notify(errorText(error), true); }
  };
  const reading = books.filter(book => book.lastReadAt && book.progress < 0.995);
  const marked = books.filter(book => book.bookmarks.length > 0);
  const recent = [...reading].sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0];
  const filtered = books.filter(book => (view === 'all' || (view === 'reading' ? reading : marked).some(item => item.id === book.id)) && (filter === 'all' || book.format === filter) && `${book.title} ${book.author}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'vi') : sort === 'added' ? b.addedAt - a.addedAt : (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt));
  const currentBook = active && books.find(book => book.id === active.id);

  return <div className="app-shell">
    <input ref={picker} className="visually-hidden" type="file" multiple accept={Capacitor.isNativePlatform() ? '*/*' : '.epub,.cbz,application/epub+zip,application/vnd.comicbook+zip,application/x-cbz'} aria-label="Chọn tệp EPUB hoặc CBZ" onChange={event => { void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }}/>
    <aside className="sidebar">
      <button className="brand" onClick={() => { setView('all'); setSearch(''); }} aria-label="Lá Reader, về thư viện"><BookOpen size={26} strokeWidth={1.7}/><span>Lá<span>Reader</span></span></button>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {([{ id: 'all', label: 'Thư viện', icon: Library, count: books.length }, { id: 'reading', label: 'Đang đọc', icon: BookOpen, count: reading.length }, { id: 'bookmarks', label: 'Dấu trang', icon: Bookmark, count: marked.length }] as const).map(item => <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.id)}><item.icon size={20} strokeWidth={1.6}/><span>{item.label}</span><small>{item.count}</small></button>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal('settings')}><Settings2 size={20} strokeWidth={1.6}/><span>Cài đặt</span></button><button className="local-badge" onClick={() => setModal('about')}><CloudOff size={15}/><span>Lưu trên thiết bị</span></button></div>
    </aside>
    <main className="main-content" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
      <header className="page-header"><div><span className="mobile-brand">LÁ READER</span><h1>{view === 'all' ? 'Thư viện' : view === 'reading' ? 'Đang đọc' : 'Dấu trang'}</h1><p>{view === 'bookmarks' ? `${marked.length} sách có dấu trang` : view === 'reading' ? `${reading.length} sách đang đọc` : `${books.length} cuốn sách`}</p></div><div className="header-actions"><button className="icon-button theme-toggle" aria-label={settings.theme === 'dark' ? 'Bật giao diện sáng' : 'Bật giao diện tối'} onClick={() => changeSettings({ ...settings, theme: settings.theme === 'dark' ? 'paper' : 'dark' })}>{settings.theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}</button><button className="primary-button" disabled={!!busy || loading} onClick={() => picker.current?.click()}><Plus size={20}/><span>Nhập sách</span></button></div></header>

      {recent && view === 'all' && !search && <section className="continue-section"><div className="section-title-row"><h2>Đọc tiếp</h2></div><button className="continue-book" disabled={!!busy} onClick={() => void openBook(recent)}><div className="continue-cover">{recent.cover ? <img src={recent.cover} alt=""/> : <BookOpen size={30}/>}</div><div className="continue-info"><span>{recent.format.toUpperCase()}</span><h3>{recent.title}</h3><p>{recent.author}</p><div className="continue-progress"><i style={{width:`${recent.progress*100}%`}}/></div><small>Đã đọc {Math.round(recent.progress*100)}%</small></div><span className="continue-action">Tiếp tục <ChevronRight size={20}/></span></button></section>}

      <section className="library-section" aria-label="Sách trong thư viện">
        <div className="library-toolbar"><div className="filter-tabs" aria-label="Lọc định dạng">{[['all', 'Tất cả'], ['epub', 'Sách EPUB'], ['cbz', 'Truyện CBZ']].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><div className="view-switch"><button aria-label="Hiển thị dạng lưới" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={18}/></button><button aria-label="Hiển thị dạng danh sách" aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}><List size={21}/></button></div></div>
        <div className="search-row"><label className="search-field"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên sách hoặc tác giả" aria-label="Tìm sách hoặc tác giả"/>{search && <button aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}><X size={17}/></button>}</label><label className="sort-field"><ArrowDownWideNarrow size={17}/><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sắp xếp sách"><option value="recent">Gần đây</option><option value="added">Mới thêm</option><option value="title">Tên A–Z</option></select></label></div>
        {loading ? <div className="empty-state"><LoaderCircle className="spin"/><p>Đang tải thư viện…</p></div> : filtered.length ? <div className={`books-grid ${layout === 'list' ? 'books-list' : ''}`}>{filtered.map(book => <article className="book-card" key={book.id}><button className="book-open" disabled={!!busy} onClick={() => void openBook(book)} aria-label={`Đọc ${book.title}`}><div className={`book-cover cover-${book.format}`}>{book.cover ? <img src={book.cover} alt=""/> : <div className="fallback-cover"><BookOpen size={24}/><span>{book.title}</span><small>{book.author}</small></div>}</div><div className="book-info"><h3>{book.title}</h3><p>{book.author}</p><div className="book-meta"><span>{book.format.toUpperCase()}</span><span>{book.lastReadAt ? `${Math.round(book.progress * 100)}%` : 'Chưa đọc'}</span></div><div className="book-progress"><i style={{width:`${book.progress*100}%`}}/></div></div></button><button className="book-delete" onClick={() => setDeleting(book)} aria-label={`Xóa ${book.title}`}><Trash2 size={16}/></button>{book.bookmarks.length > 0 && <span className="bookmark-count" aria-label={`${book.bookmarks.length} dấu trang`}><Bookmark size={13} fill="currentColor"/></span>}</article>)}</div> : <div className="empty-state"><div><h3>{search || filter !== 'all' ? 'Không tìm thấy sách' : view === 'bookmarks' ? 'Chưa có dấu trang' : view === 'reading' ? 'Chưa có sách đang đọc' : 'Thêm sách vào thư viện'}</h3><p>{search || filter !== 'all' ? 'Thử một tên sách khác hoặc đổi bộ lọc.' : view === 'bookmarks' ? 'Đánh dấu một trang khi đọc để dễ quay lại.' : 'Nhập tệp EPUB hoặc CBZ từ thiết bị của bạn.'}</p>{view === 'all' && !search && filter === 'all' && <button className="text-button" disabled={!!busy} onClick={() => picker.current?.click()}>Chọn tệp <ArrowRight size={16}/></button>}</div></div>}
      </section>

      <footer className="page-footer"><span>EPUB · CBZ</span><button onClick={() => setModal('about')}>Về Lá Reader</button></footer>
    </main>
    <nav className="mobile-nav" aria-label="Điều hướng di động"><button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}><Library size={23} strokeWidth={1.7}/>Thư viện</button><button className={view === 'reading' ? 'active' : ''} onClick={() => setView('reading')}><BookOpen size={23} strokeWidth={1.7}/>Đang đọc</button><button className={view === 'bookmarks' ? 'active' : ''} onClick={() => setView('bookmarks')}><Bookmark size={23} strokeWidth={1.7}/>Dấu trang</button><button onClick={() => setModal('settings')}><Settings2 size={23} strokeWidth={1.7}/>Cài đặt</button></nav>
    {active && currentBook && <Reader key={active.id} book={currentBook} data={active.data} settings={settings} onSettings={changeSettings} onPosition={updatePosition} onBookmark={bookmark} onClose={() => setActive(undefined)}/>}
    {busy && <div className="busy-indicator" role="status"><LoaderCircle className="spin" size={18}/>{busy}</div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <X size={18}/> : <Check size={18}/>}<span>{toast.message}</span><button aria-label="Đóng thông báo" onClick={() => setToast(undefined)}><X size={16}/></button></div>}
    {(modal || deleting) && <div className="modal-backdrop" onClick={() => { setModal(null); setDeleting(undefined); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={event => event.stopPropagation()}><div className="dialog-heading"><h2 id="dialog-title">{deleting ? 'Xóa sách?' : modal === 'settings' ? 'Cài đặt đọc' : 'Lá Reader'}</h2><button className="icon-button" autoFocus aria-label="Đóng cửa sổ" onClick={() => { setModal(null); setDeleting(undefined); }}><X size={22}/></button></div>{deleting ? <><p>“{deleting.title}” cùng tiến độ và dấu trang sẽ được xóa khỏi thư viện. Tệp gốc của bạn vẫn được giữ nguyên.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleting(undefined)}>Hủy</button><button className="danger-button" onClick={() => void deleteBook()}>Xóa sách</button></div></> : modal === 'settings' ? <><label className="setting-label">Giao diện</label><div className="theme-options">{([{ id: 'paper', name: 'Sáng' }, { id: 'sepia', name: 'Giấy' }, { id: 'dark', name: 'Tối' }] as const).map(theme => <button key={theme.id} className={`theme-option ${theme.id} ${settings.theme === theme.id ? 'chosen' : ''}`} aria-pressed={settings.theme === theme.id} onClick={() => changeSettings({ ...settings, theme: theme.id })}><span>Aa</span>{theme.name}</button>)}</div><label className="setting-label" htmlFor="font-size">Cỡ chữ EPUB <strong>{settings.fontSize}</strong></label><input id="font-size" className="setting-slider" type="range" min="14" max="30" value={settings.fontSize} onChange={event => changeSettings({ ...settings, fontSize: Number(event.target.value) })}/><label className="setting-label" htmlFor="comic-direction">Chiều đọc CBZ</label><select id="comic-direction" className="setting-select" value={settings.comicDirection} onChange={event => changeSettings({ ...settings, comicDirection: event.target.value as 'ltr' | 'rtl' })}><option value="ltr">Trái sang phải</option><option value="rtl">Phải sang trái (manga)</option></select><label className="setting-label" htmlFor="comic-layout">Bố cục CBZ khi xoay ngang</label><select id="comic-layout" className="setting-select" value={settings.comicLayout} onChange={event => changeSettings({ ...settings, comicLayout: event.target.value as 'single' | 'double' })}><option value="single">Một trang</option><option value="double">Hai trang</option></select><p className="settings-note">Màn hình dọc luôn hiển thị một trang. Thay đổi được lưu tự động.</p></> : <><p>Đọc EPUB và CBZ offline. Không cần tài khoản.</p><div className="about-details"><p><strong>Tệp được hỗ trợ</strong>EPUB không DRM. CBZ chứa JPG, PNG, WebP, GIF hoặc AVIF. Tối đa 100 MB/tệp.</p><p><strong>Lưu trữ</strong>Sách, tiến độ và dấu trang được lưu trên thiết bị. Gỡ app hoặc xóa dữ liệu sẽ xóa thư viện. Hãy giữ tệp gốc.</p></div><span className="version-label">Phiên bản 1.0.0</span></>}</section></div>}
  </div>;
}
