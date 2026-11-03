import { expect, test, type Page } from '@playwright/test';
import { cbzFixture, epubFixture } from './fixtures';

async function tapZone(page: Page, fraction: number) {
  const box = (await page.locator('.rd-reading-area').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * fraction, box.y + box.height * .5);
}
async function idle(page: Page) {
  await expect(page.locator('.reader')).not.toHaveClass(/rd-is-turning/);
}
async function openEpub(page: Page) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Thêm sách vào thư viện' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'webkit.epub', mimeType: 'application/epub+zip', buffer: epubFixture() });
  await page.getByRole('button', { name: 'Đọc WebKit Reader Check', exact: true }).click();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.rd-status')).toHaveCount(0);
  await expect(page.locator('.rd-epub-host iframe')).toBeVisible();
  await page.waitForTimeout(350); // Wait for the reader entrance transition before physical taps.
}
async function location(page: Page) {
  return page.evaluate(() => new Promise<string>(resolve => {
    const request = indexedDB.open('la-reader', 1);
    request.onsuccess = () => { const db = request.result; const all = db.transaction('books').objectStore('books').getAll(); all.onsuccess = () => { db.close(); resolve(all.result.find(book => book.format === 'epub')?.location || ''); }; };
  }));
}

test('EPUB receives real WebKit touch input at center and broad side zones', async ({ page }) => {
  await openEpub(page);
  const reader = page.locator('.reader');
  const before = (await page.locator('.rd-reading-area').boundingBox())!;
  await tapZone(page, .5);
  await expect(reader).toHaveAttribute('data-chrome', 'hidden');
  expect((await page.locator('.rd-reading-area').boundingBox())!.height).toBeGreaterThan(before.height + 100);
  await expect(page.locator('.rd-header')).toHaveAttribute('inert', '');
  await tapZone(page, .5); await expect(reader).toHaveAttribute('data-chrome', 'visible');
  const start = await location(page);
  await tapZone(page, .75); await idle(page);
  await expect.poll(() => location(page)).not.toBe(start);
  await expect(reader).toHaveAttribute('data-chrome', 'visible');
  const next = await location(page);
  await tapZone(page, .25); await idle(page);
  await expect.poll(() => location(page)).not.toBe(next);
  await page.getByRole('button', { name: 'Ẩn thanh điều khiển', exact: true }).click();
  await expect(reader).toHaveAttribute('data-chrome', 'hidden');
  await tapZone(page, .75); await idle(page); await expect(reader).toHaveAttribute('data-chrome', 'hidden');
  await tapZone(page, .5); await expect(reader).toHaveAttribute('data-chrome', 'visible');
});

test('trusted touch listeners work while publication scripts stay blocked', async ({ page }) => {
  await openEpub(page);
  const iframe = page.locator('.rd-epub-host iframe');
  const frame = await (await iframe.elementHandle())!.contentFrame();
  expect(await frame!.locator('script,[onload],a[href^="javascript:"]').count()).toBe(0);
  await expect(frame!.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'none'/);
  // Even if script markup is introduced later, CSP must still prevent execution.
  await page.evaluate(() => {
    const doc = document.querySelector<HTMLIFrameElement>('.rd-epub-host iframe')!.contentDocument!;
    const script = doc.createElement('script'); script.textContent = 'parent.__publicationExecuted = true'; doc.body.append(script);
    const img = doc.createElement('img'); img.setAttribute('onerror', 'parent.__publicationExecuted = true'); img.src = 'data:image/png;base64,broken'; doc.body.append(img);
  });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as Window & { __publicationExecuted?: boolean }).__publicationExecuted)).toBeUndefined();
  await tapZone(page, .5); await expect(page.locator('.reader')).toHaveAttribute('data-chrome', 'hidden');
});

test('iPad rotation and narrow windows keep controls usable', async ({ page }) => {
  await openEpub(page);
  for (const viewport of [{ width: 834, height: 1194 }, { width: 744, height: 1133 }, { width: 600, height: 834 }, { width: 390, height: 844 }, { width: 1366, height: 1024 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(250);
    await expect(page.locator('.reader')).toHaveAttribute('data-layout', viewport.width > viewport.height ? 'double' : 'single');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await tapZone(page, .5); await expect(page.locator('.reader')).toHaveAttribute('data-chrome', 'hidden');
    await tapZone(page, .5); await expect(page.locator('.reader')).toHaveAttribute('data-chrome', 'visible');
    await page.getByRole('button', { name: 'Cài đặt đọc', exact: true }).click();
    await page.locator('.rd-panel').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const panel = (await page.locator('.rd-panel').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(0); expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.getByRole('button', { name: 'Đóng bảng', exact: true }).click();
  }
});

test('CBZ still uses broad touch zones and respects two-page bounds', async ({ page }) => {
  await page.goto('/'); await page.getByRole('heading', { name: 'Thêm sách vào thư viện' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'comic.cbz', mimeType: 'application/vnd.comicbook+zip', buffer: cbzFixture() });
  await page.getByRole('button', { name: 'Đọc comic', exact: true }).click(); await expect(page.locator('.rd-status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đọc hai trang', exact: true }).click();
  const images = page.locator('.rd-page-surface>.rd-comic-viewport .rd-comic-image');
  await expect(images).toHaveCount(2); await page.waitForTimeout(350);
  await tapZone(page, .75); await idle(page); await expect(images.first()).toHaveAttribute('alt', /^Trang 3 /);
  await tapZone(page, .5); await expect(page.locator('.reader')).toHaveAttribute('data-chrome', 'hidden');
  await tapZone(page, .25); await idle(page); await expect(images.first()).toHaveAttribute('alt', /^Trang 1 /);
  await tapZone(page, .5); await expect(page.locator('.reader')).toHaveAttribute('data-chrome', 'visible');
});
