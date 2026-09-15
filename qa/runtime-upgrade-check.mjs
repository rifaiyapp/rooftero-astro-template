import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist');
const baseline = process.env.QA_BASELINE && resolve(process.env.QA_BASELINE);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await mkdir('qa/runtime-output', { recursive: true });
  for (const width of [1440, 820, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    // Every external request is blocked, including accidental Lead Service requests.
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const capture = async (target, path) => {
      // Warm the compositor before the recorded capture, as Playwright's visual
      // assertions do when waiting for a stable screenshot.
      await target.screenshot({ fullPage: true, animations: 'disabled' });
      return target.screenshot({ path, fullPage: true, animations: 'disabled' });
    };
    const settle = async target => {
      await target.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
        // Allow the existing 120ms resize debounce and ResizeObserver geometry
        // updates to settle after font/image decode before comparing pixels.
        await new Promise(done => setTimeout(done, 250));
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        // Normalize only sub-layout-unit floating-point drift in the idle carousel
        // for deterministic captures; interaction tests below use its real handlers.
        const track = document.querySelector('.testimonial-track');
        if (track) {
          const matrix = new DOMMatrix(getComputedStyle(track).transform);
          track.style.transform = `translate3d(${Math.round(matrix.m41 * 64) / 64}px, 0, 0)`;
        }
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
    };
    await settle(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow,noarchive,nosnippet');
    assert.equal(await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).length), 0);
    const current = await capture(page, `qa/runtime-output/current-${width}.png`);
    if (baseline) {
      const before = await context.newPage();
      await before.route(base + '/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const file = resolve(baseline, '.' + (path === '/' ? '/index.html' : path));
        await route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      });
      await before.goto(base, { waitUntil: 'networkidle' });
      await settle(before);
      const original = await capture(before, `qa/runtime-output/baseline-${width}.png`);
      assert.ok(original.equals(current), `Approved page pixels changed at ${width}px`);
      await before.close();
    }
    if (width <= 820) {
      await page.locator('.menu-toggle').click();
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
      await page.locator('.menu-toggle').click();
    }
    const review = await page.locator('[data-review-dot][aria-current="true"]').getAttribute('data-review-dot');
    await page.locator('.review-arrow.next').click();
    await page.waitForFunction(previous => document.querySelector('[data-review-dot][aria-current="true"]').getAttribute('data-review-dot') !== previous, review);
    const faq = page.locator('.faq-question').first();
    await faq.click();
    assert.equal(await faq.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS page rendering, images, navigation, carousel and FAQ at ${width}px${baseline ? '; baseline pixels identical' : ''}`);
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
