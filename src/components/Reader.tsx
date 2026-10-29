import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub from 'epubjs';
import { ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, List, LoaderCircle, Minus, Plus, Settings2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReaderProps, ReadingPosition, Theme } from '../types';
import { listComicPages, readArchiveEntry } from '../lib/archive';
import { getComicSpread, turnComicPage } from '../lib/comic-layout';
import './reader.css';

type EpubBook = ReturnType<typeof ePub>;
type EpubRendition = ReturnType<EpubBook['renderTo']>;
interface TocEntry { id: string; href: string; label: string; depth: number }
interface NavigationItem { id: string; href: string; label: string; subitems?: NavigationItem[] }
interface EpubLocation { start: { cfi: string; href: string; index: number; displayed: { page: number; total: number } }; atEnd?: boolean; atStart?: boolean }

const palette: Record<Theme, { background: string; color: string }> = {
  paper: { background: '#faf9f6', color: '#292825' },
  sepia: { background: '#f4ead6', color: '#493e2e' },
  dark: { background: '#20201f', color: '#e9e6df' },
};
function flatten(items: NavigationItem[], depth = 0): TocEntry[] {
  return items.flatMap(item => [{ id: item.id, href: item.href, label: item.label.trim(), depth }, ...flatten(item.subitems || [], depth + 1)]);
}
function pageFrom(location?: string) {
  const value = Number(location?.replace(/^page:/, '') || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function imageMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
}
function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể mở nội dung sách. Hãy thử nhập lại tệp.';
}

// This runs before a spine document is serialized into its sandboxed iframe.
function protectDocument(document: Document) {
  document.querySelectorAll('script,iframe,object,embed,form,meta[http-equiv="refresh"]').forEach(element => element.remove());
  document.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
      if (['src', 'href', 'xlink:href', 'poster'].includes(attribute.name) && /^(?:https?:)?\/\//i.test(attribute.value.trim()) && !['a', 'base'].includes(element.tagName.toLowerCase())) element.removeAttribute(attribute.name);
    }
  });
  const csp = document.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:; form-action 'none'; base-uri 'self'");
  document.querySelector('head')?.prepend(csp);
}

export default function Reader(props: ReaderProps) {
  const { book, data, settings } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const dialog = useRef<HTMLDivElement>(null);
  const panelElement = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const rendition = useRef<EpubRendition | null>(null);
  const epub = useRef<EpubBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toc, setToc] = useState<TocEntry[]>([]);
  const tocRef = useRef<TocEntry[]>([]);
  const [panel, setPanel] = useState<'contents' | 'settings' | 'bookmarks' | null>(null);
  const [position, setPosition] = useState<ReadingPosition>({ location: book.location || '', progress: book.progress, label: 'Đang mở sách…' });
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(pageFrom(book.location));
  const [comicImages, setComicImages] = useState<{ index: number; url: string }[]>([]);
  const [landscape, setLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  const spread = useMemo(() => getComicSpread(page, pages.length, settings.comicLayout, landscape), [page, pages.length, settings.comicLayout, landscape]);
  const [zoom, setZoom] = useState(1);
  const [boundaries, setBoundaries] = useState({ first: true, last: false });
  const [turning, setTurning] = useState(false);
  const turningRef = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const orientation = window.matchMedia('(orientation: landscape)');
    const update = () => setLandscape(orientation.matches);
    orientation.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => { orientation.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, []);

  const updatePosition = useCallback((next: ReadingPosition) => {
    setPosition(next);
    callbacks.current.onPosition(next);
  }, []);

  const applyTheme = useCallback(() => {
    const reader = rendition.current;
    if (!reader) return;
    const current = callbacks.current.settings;
    const colors = palette[current.theme];
    reader.themes.default({
      body: { color: `${colors.color} !important`, background: `${colors.background} !important`, 'font-family': '"Times New Roman", "Noto Serif", Georgia, serif !important', 'line-height': `${current.lineHeight} !important`, 'letter-spacing': 'normal !important', 'word-spacing': 'normal !important', padding: '0 14px !important' },
      p: { 'line-height': `${current.lineHeight} !important` },
      a: { color: `${current.theme === 'dark' ? '#e59270' : '#c65c37'} !important` },
      img: { 'max-width': '100% !important', 'max-height': '85vh !important', 'object-fit': 'contain' },
    });
    reader.themes.fontSize(`${current.fontSize}px`);
  }, []);

  const turn = useCallback(async (direction: -1 | 1) => {
    if (turningRef.current) return;
    if (callbacks.current.book.format === 'cbz') {
      setPage(current => turnComicPage(current, pages.length, callbacks.current.settings.comicLayout, landscape, direction));
      return;
    }
    if (!rendition.current) return;
    turningRef.current = true;
    setTurning(true);
    try {
      await (direction > 0 ? rendition.current.next() : rendition.current.prev());
    } catch (cause) { setError(readableError(cause)); }
    finally { turningRef.current = false; setTurning(false); }
  }, [pages.length, landscape]);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  useEffect(() => {
    let alive = true;
    let resize: ResizeObserver | undefined;
    let instance: EpubBook | undefined;
    let reader: EpubRendition | undefined;
    let opening: Promise<unknown> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const savedLocation = callbacks.current.book.location;
    setLoading(true);
    setError('');
    if (book.format === 'cbz') {
      try {
        const entries = listComicPages(data);
        if (!entries.length) throw new Error('Tệp CBZ không có ảnh JPG, PNG, WebP, GIF hoặc AVIF.');
        setPages(entries);
        setPage(Math.min(entries.length - 1, pageFrom(savedLocation)));
        setLoading(false);
      } catch (cause) { setError(readableError(cause)); setLoading(false); }
      return () => { alive = false; };
    }
    const element = host.current;
    if (!element) return;
    const open = async () => {
      try {
        // Defer construction so React's development cleanup cannot destroy a half-open ZIP.
        await Promise.resolve();
        if (!alive) return;
        instance = ePub({ replacements: 'blobUrl' });
        epub.current = instance;
        instance.spine.hooks.content.register(protectDocument);
        opening = instance.open(data.slice(0)).then(() => Promise.all([instance!.ready, instance!.opened]));
        await Promise.race([opening, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Mở sách quá lâu. Tệp có thể thiếu chương hoặc tài nguyên. Hãy kiểm tra và nhập lại EPUB.')), 25000); })]);
        if (timeout) clearTimeout(timeout);
        if (!alive) return;
        const navigation = await instance.loaded.navigation;
        if (!alive) return;
        const entries = flatten(navigation.toc);
        tocRef.current = entries;
        setToc(entries);
        reader = instance.renderTo(element, {
          width: '100%', height: '100%', flow: 'paginated', spread: 'none',
          allowScriptedContent: false,
        });
        rendition.current = reader;
        reader.hooks.content.register((contents: { document: Document }) => {
          contents.document.addEventListener('click', event => {
            const link = (event.target as Element | null)?.closest('a');
            if (link && /^(?:https?:|mailto:|tel:|javascript:|\/\/)/i.test(link.getAttribute('href') || '')) {
              event.preventDefault(); event.stopImmediatePropagation();
            }
          }, true);
          contents.document.addEventListener('keydown', event => {
            if (event.key === 'ArrowRight') { event.preventDefault(); void turnRef.current(1); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); void turnRef.current(-1); }
            if (event.key === 'Escape') callbacks.current.onClose();
          });
          let start: { x: number; y: number } | null = null;
          contents.document.addEventListener('touchstart', event => {
            const finger = event.touches[0];
            start = event.touches.length === 1 && finger ? { x: finger.clientX, y: finger.clientY } : null;
          }, { passive: true });
          contents.document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
          contents.document.addEventListener('touchend', event => {
            const finger = event.changedTouches[0];
            const origin = start;
            start = null;
            if (!origin || !finger || event.touches.length || contents.document.getSelection()?.toString()) return;
            const dx = finger.clientX - origin.x;
            const dy = finger.clientY - origin.y;
            if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) void turnRef.current(dx < 0 ? 1 : -1);
          }, { passive: true });
        });
        reader.on('relocated', (location: EpubLocation) => {
          if (!alive || !location.start?.cfi) return;
          const current = location.start;
          const chapter = tocRef.current.find(entry => entry.href.split('#')[0] === (current.href || '').split('#')[0]);
          const totalSpine = Math.max(1, (instance?.spine as unknown as { spineItems?: unknown[] } | undefined)?.spineItems?.length || 1);
          const chapterIndex = Number.isFinite(current.index) ? Math.max(0, Math.min(totalSpine - 1, current.index)) : 0;
          const displayedPage = Number.isFinite(current.displayed?.page) ? Math.max(1, current.displayed.page) : 1;
          const displayedTotal = Number.isFinite(current.displayed?.total) ? Math.max(1, current.displayed.total) : 1;
          const chapterFraction = Math.min(1, Math.max(0, (displayedPage - 1) / displayedTotal));
          const progress = location.atEnd ? 1 : Math.min(0.999, Math.max(0, (chapterIndex + chapterFraction) / totalSpine));
          updatePosition({ location: current.cfi, progress, label: chapter?.label || `Chương ${chapterIndex + 1}` });
          setBoundaries({ first: !!location.atStart, last: !!location.atEnd });
        });
        reader.on('displayError', (cause: unknown) => { if (alive) setError(readableError(cause)); });
        applyTheme();
        try { await reader.display(savedLocation || undefined); }
        catch {
          if (!alive) return;
          await reader.display();
        }
        if (!alive) return;
        setLoading(false);
        resize = new ResizeObserver(() => {
          if (alive && element.clientWidth && element.clientHeight) reader?.resize(element.clientWidth, element.clientHeight);
        });
        resize.observe(element);
      } catch (cause) {
        if (alive) { setError(readableError(cause)); setLoading(false); }
      }
    };
    void open();
    return () => {
      alive = false;
      resize?.disconnect();
      if (timeout) clearTimeout(timeout);
      if (rendition.current === reader) rendition.current = null;
      if (epub.current === instance) epub.current = null;
      const disposable = instance;
      const dispose = () => { try { disposable?.destroy(); } catch { /* a pending render may already have been destroyed */ } };
      if (disposable && !reader && opening) void opening.then(dispose, dispose);
      else dispose();
      element.replaceChildren();
    };
  // Progress/bookmark changes must not recreate the publication.
  }, [book.id, book.format, data, applyTheme, updatePosition]);

  useEffect(() => { applyTheme(); }, [settings.theme, settings.fontSize, settings.lineHeight, applyTheme]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('.rd-back')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scope = panel ? panelElement.current : dialog.current;
    if (!scope) return;
    const focusables = () => [...scope.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]),iframe')]
      .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
    if (panel) focusables()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) { event.preventDefault(); scope.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !scope.contains(event.target)) focusables()[0]?.focus();
    };
    document.addEventListener('keydown', trapFocus, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus, true);
      document.removeEventListener('focusin', keepFocus);
      if (panel && previous?.isConnected) previous.focus();
    };
  }, [panel]);

  useEffect(() => {
    if (book.format !== 'cbz' || !pages.length) return;
    setZoom(1);
    const images: { index: number; url: string }[] = [];
    try {
      for (const index of spread.indices) {
        const bytes = readArchiveEntry(data, pages[index]);
        const buffer = new Uint8Array(bytes).buffer;
        images.push({ index, url: URL.createObjectURL(new Blob([buffer], { type: imageMime(pages[index]) })) });
      }
      setComicImages(images);
      setError('');
      const range = spread.start === spread.end ? `${spread.start + 1}` : `${spread.start + 1}–${spread.end + 1}`;
      updatePosition({ location: `page:${page}`, progress: (spread.end + 1) / pages.length, label: `Trang ${range} / ${pages.length}` });
      setBoundaries({ first: spread.first, last: spread.last });
    } catch (cause) { setComicImages([]); setError(readableError(cause)); }
    return () => { for (const image of images) URL.revokeObjectURL(image.url); };
  }, [book.format, data, pages, page, spread, updatePosition]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel) { setPanel(null); return; }
      if ((event.target as HTMLElement)?.matches('input,select,textarea') || panel) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); void turn(settings.comicDirection === 'rtl' && book.format === 'cbz' ? -1 : 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); void turn(settings.comicDirection === 'rtl' && book.format === 'cbz' ? 1 : -1); }
      if (event.key === 'Escape') callbacks.current.onClose();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [turn, panel, settings.comicDirection, book.format]);

  const jump = async (target: string) => {
    setPanel(null);
    if (book.format === 'cbz') { setPage(Math.min(pages.length - 1, pageFrom(target))); return; }
    try { await rendition.current?.display(target); } catch (cause) { setError(readableError(cause)); }
  };
  const isBookmarked = book.bookmarks.some(mark => mark.location === position.location);
  const rtl = book.format === 'cbz' && settings.comicDirection === 'rtl';
  const controlsDisabled = loading || !!error || turning;

  return <div ref={dialog} className={`reader rd-theme-${settings.theme}`} role="dialog" aria-label={`Đọc ${book.title}`} aria-modal="true" tabIndex={-1}>
    <header className="rd-header" inert={!!panel}>
      <button className="rd-icon-button rd-back" onClick={props.onClose} aria-label="Về thư viện"><ArrowLeft size={21}/><span>Thư viện</span></button>
      <div className="rd-book-title"><strong>{book.title}</strong><span>{book.author || 'Tác giả chưa rõ'}</span></div>
      <div className="rd-header-actions">
        <button className={`rd-icon-button ${isBookmarked ? 'rd-active' : ''}`} disabled={!position.location || loading || !!error} onClick={() => props.onBookmark(position)} aria-label={isBookmarked ? 'Bỏ dấu trang hiện tại' : 'Đánh dấu trang'} title={isBookmarked ? 'Bỏ dấu trang hiện tại' : 'Đánh dấu trang'}><Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'}/></button>
        <button className="rd-icon-button" onClick={() => setPanel('contents')} aria-label={book.format === 'cbz' ? 'Đi đến trang' : 'Mục lục'}><List size={21}/></button>
        <button className="rd-icon-button" onClick={() => setPanel('settings')} aria-label="Cài đặt đọc"><Settings2 size={20}/></button>
      </div>
    </header>

    <main className={`rd-reading-area ${book.format === 'cbz' ? 'rd-comic' : ''}`} inert={!!panel}>
      {book.format === 'epub' && <div className="rd-epub-container"><div ref={host} className="rd-epub-host"/></div>}
      {book.format === 'cbz' && comicImages.length > 0 && !error && <div className={`rd-comic-viewport ${zoom > 1 ? 'rd-zoomed' : ''}`}
        onTouchStart={event => { const finger = event.touches[0]; touch.current = event.touches.length === 1 && finger ? { x: finger.clientX, y: finger.clientY } : null; }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={event => {
          const origin = touch.current;
          touch.current = null;
          const finger = event.changedTouches[0];
          if (!origin || !finger || event.touches.length || zoom > 1) return;
          const dx = finger.clientX - origin.x;
          const dy = finger.clientY - origin.y;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) void turn((dx < 0 ? 1 : -1) * (rtl ? -1 : 1) as -1 | 1);
        }}>
        <div className={`rd-comic-spread ${comicImages.length === 2 ? 'rd-two-pages' : ''} ${rtl ? 'rd-rtl' : ''}`} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          {comicImages.map(image => <img key={image.url} src={image.url} alt={`Trang ${image.index + 1} của ${book.title}`} className="rd-comic-image" onError={() => setError('Không thể hiển thị ảnh trang này. Định dạng ảnh có thể không được thiết bị hỗ trợ.')}/>)}
        </div>
      </div>}
      {loading && <div className="rd-status" role="status"><LoaderCircle className="rd-spin" size={28}/><strong>Đang mở sách…</strong></div>}
      {error && <div className="rd-status rd-error" role="alert"><BookOpen size={32}/><h2>Chưa mở được sách</h2><p>{error}</p><button className="rd-primary" onClick={props.onClose}>Về thư viện</button></div>}
      {book.format === 'cbz' && !loading && !error && <div className="rd-zoom-controls"><button className="rd-icon-button" aria-label="Thu nhỏ ảnh" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><ZoomOut size={18}/></button><span>{Math.round(zoom * 100)}%</span><button className="rd-icon-button" aria-label="Phóng to ảnh" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}><ZoomIn size={18}/></button></div>}
    </main>

    <footer className="rd-footer" inert={!!panel}>
      <div className="rd-progress-track"><div style={{ width: `${Math.round(position.progress * 100)}%` }}/></div>
      {book.format === 'cbz' && landscape && <div className="rd-layout-bar" role="group" aria-label="Bố cục đọc CBZ"><div className="rd-layout-switch"><button aria-label="Đọc một trang" aria-pressed={settings.comicLayout === 'single'} onClick={() => props.onSettings({ ...settings, comicLayout: 'single' })}>1 trang</button><button aria-label="Đọc hai trang" aria-pressed={settings.comicLayout === 'double'} onClick={() => props.onSettings({ ...settings, comicLayout: 'double' })}>2 trang</button></div></div>}
      <div className="rd-footer-row">
        <button className="rd-turn" onClick={() => void turn(rtl ? 1 : -1)} disabled={controlsDisabled || (rtl ? boundaries.last : boundaries.first)} aria-label={rtl ? 'Trang tiếp theo' : 'Trang trước'}><ChevronLeft size={22}/><span>{rtl ? 'Tiếp' : 'Trước'}</span></button>
        <button className="rd-location" onClick={() => setPanel('contents')} disabled={loading || !!error}><span>{position.label}</span><small>{Math.round(position.progress * 100)}% đã đọc</small></button>
        <button className="rd-turn" onClick={() => void turn(rtl ? -1 : 1)} disabled={controlsDisabled || (rtl ? boundaries.first : boundaries.last)} aria-label={rtl ? 'Trang trước' : 'Trang tiếp theo'}><span>{rtl ? 'Trước' : 'Tiếp'}</span><ChevronRight size={22}/></button>
      </div>
    </footer>

    {panel && <div className="rd-panel-backdrop" onClick={() => setPanel(null)}>
      <section ref={panelElement} className="rd-panel" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" tabIndex={-1} aria-label={panel === 'settings' ? 'Cài đặt đọc' : 'Mục lục và dấu trang'}>
        <header className="rd-panel-header"><h2>{panel === 'settings' ? 'Cài đặt đọc' : 'Mục lục & dấu trang'}</h2><button className="rd-icon-button" onClick={() => setPanel(null)} aria-label="Đóng bảng"><X size={21}/></button></header>
        {panel !== 'settings' && <div className="rd-panel-tabs"><button className={panel === 'contents' ? 'rd-selected' : ''} onClick={() => setPanel('contents')}>{book.format === 'epub' ? 'Mục lục' : 'Trang sách'}</button><button className={panel === 'bookmarks' ? 'rd-selected' : ''} onClick={() => setPanel('bookmarks')}>Dấu trang <span>{book.bookmarks.length}</span></button></div>}
        <div className="rd-panel-body">
          {panel === 'contents' && book.format === 'epub' && (toc.length ? <ol className="rd-toc">{toc.map((entry, index) => <li key={`${entry.id}-${index}`}><button onClick={() => void jump(entry.href)} style={{ paddingLeft: `${16 + entry.depth * 16}px` }}><span>{entry.label || `Chương ${index + 1}`}</span><ChevronRight size={16}/></button></li>)}</ol> : <p className="rd-empty">Cuốn sách này không có mục lục.</p>)}
          {panel === 'contents' && book.format === 'cbz' && <div className="rd-page-picker"><BookOpen size={32}/><p>Trang <strong>{page + 1}</strong> / {pages.length}</p><input aria-label="Chọn trang truyện" type="range" min="0" step="1" max={Math.max(0, pages.length - 1)} value={page} onChange={event => setPage(Math.floor(Number(event.target.value)))}/><label>Đến trang <input aria-label="Nhập số trang" type="number" inputMode="numeric" step="1" min="1" max={pages.length} value={page + 1} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setPage(Math.max(0, Math.min(pages.length - 1, Math.floor(value) - 1))); }}/></label><button className="rd-primary" onClick={() => setPanel(null)}>Đọc trang này</button></div>}
          {panel === 'bookmarks' && (book.bookmarks.length ? <ol className="rd-toc">{book.bookmarks.map(mark => <li key={mark.id}><button onClick={() => void jump(mark.location)}><Bookmark size={16}/><span>{mark.label}</span><ChevronRight size={16}/></button></li>)}</ol> : <div className="rd-empty"><Bookmark size={28}/><p>Chưa có dấu trang.</p><small>Chạm biểu tượng dấu trang trên thanh công cụ để lưu vị trí hiện tại.</small></div>)}
          {panel === 'settings' && <>
            <div className="rd-setting"><label>Màu trang</label><div className="rd-themes">{(['paper', 'sepia', 'dark'] as Theme[]).map(theme => <button key={theme} className={`rd-theme-choice rd-choice-${theme} ${settings.theme === theme ? 'rd-chosen' : ''}`} onClick={() => props.onSettings({ ...settings, theme })}><span>Aa</span><small>{theme === 'paper' ? 'Sáng' : theme === 'sepia' ? 'Giấy ngà' : 'Tối'}</small>{settings.theme === theme && <Check size={15}/>}</button>)}</div></div>
            {book.format === 'epub' ? <>
              <div className="rd-setting"><label>Cỡ chữ <span>{settings.fontSize}px</span></label><div className="rd-stepper"><button className="rd-icon-button" aria-label="Giảm cỡ chữ" disabled={settings.fontSize <= 14} onClick={() => props.onSettings({ ...settings, fontSize: Math.max(14, settings.fontSize - 1) })}><Minus size={18}/></button><span style={{ fontFamily: '"Times New Roman", "Noto Serif", serif', fontSize: settings.fontSize }}>Văn bản xem trước</span><button className="rd-icon-button" aria-label="Tăng cỡ chữ" disabled={settings.fontSize >= 30} onClick={() => props.onSettings({ ...settings, fontSize: Math.min(30, settings.fontSize + 1) })}><Plus size={18}/></button></div></div>
              <div className="rd-setting"><label>Giãn dòng <span>{settings.lineHeight.toFixed(1)}</span></label><input aria-label="Giãn dòng" type="range" min="1.3" max="2.2" step="0.1" value={settings.lineHeight} onChange={event => props.onSettings({ ...settings, lineHeight: Number(event.target.value) })}/></div>
            </> : <><div className="rd-setting"><label>Bố cục khi xoay ngang</label><div className="rd-direction"><button aria-pressed={settings.comicLayout === 'single'} className={settings.comicLayout === 'single' ? 'rd-selected' : ''} onClick={() => props.onSettings({ ...settings, comicLayout: 'single' })}>Một trang</button><button aria-pressed={settings.comicLayout === 'double'} className={settings.comicLayout === 'double' ? 'rd-selected' : ''} onClick={() => props.onSettings({ ...settings, comicLayout: 'double' })}>Hai trang</button></div><p className="rd-hint">Màn hình dọc luôn hiển thị một trang. Khi xoay ngang, app dùng bố cục đã chọn.</p></div><div className="rd-setting"><label>Hướng đọc</label><div className="rd-direction"><button className={settings.comicDirection === 'ltr' ? 'rd-selected' : ''} onClick={() => props.onSettings({ ...settings, comicDirection: 'ltr' })}>Trái → phải</button><button className={settings.comicDirection === 'rtl' ? 'rd-selected' : ''} onClick={() => props.onSettings({ ...settings, comicDirection: 'rtl' })}>Phải → trái</button></div><p className="rd-hint">Chọn phải → trái để đọc manga. Vuốt ngang để chuyển trang; phóng to để xem chi tiết.</p></div></>}
            <p className="rd-settings-note">Vị trí đọc và tuỳ chỉnh được lưu trên thiết bị này.</p>
          </>}
        </div>
      </section>
    </div>}
  </div>;
}
