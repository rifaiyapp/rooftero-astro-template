import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import router from '../publishing/asset-router.mjs';

// Exercise one live fixture build through the real Worker and a local-only
// Service Binding mock. Requests outside the mounted route deliberately fail.
const root = resolve(process.env.QA_DIST || 'tmp/form-live-dist');
const built404 = await readFile(resolve(root, '404.html'), 'utf8');
const securityHeaders = Object.fromEntries((await readFile(resolve(root, '_headers'), 'utf8'))
  .split(/\r?\n/).filter(line => /^\s+[^:]+:/.test(line)).map(line => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
let mount = '';
let calls = [];
let outside = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    if (mount && url.pathname !== mount && !url.pathname.startsWith(mount + '/')) {
      outside.push(url.pathname);
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) });
    const response = await router.fetch(request, {
      RUNTIME_MOUNT_PATHS: JSON.stringify(mount ? [mount + '/'] : []),
      ASSETS: { async fetch(input) {
        let path = new URL(input.url).pathname;
        // Model Cloudflare's default HTML handling, not a raw filesystem read.
        if (path === '/404.html') return Response.redirect(base + '/404', 307);
        if (path === '/404') path = '/404.html';
        // Reproduce the live no-slash redirect before consulting static files.
        if (mount && path === mount) return Response.redirect(base, 301);
        const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
        if (!file.startsWith(root + sep)) return new Response(null, { status: 403 });
        try {
          return new Response(await readFile(file), { headers: { ...securityHeaders, 'content-type': mime[extname(file)] || 'application/octet-stream' } });
        } catch { return new Response(null, { status: 404 }); }
      } },
      LEAD_GATEWAY: { async fetch(internal) {
        assert.equal(internal.method, 'POST');
        assert.equal(new URL(internal.url).pathname, '/v1/submit');
        assert.equal(internal.headers.get('origin'), base);
        calls.push({ path: url.pathname, payload: await internal.json() });
        return Response.json({ success: true });
      } },
    });
    res.writeHead(response.status, Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500).end();
    console.error(error);
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await mkdir('qa/runtime-output', { recursive: true });
  for (mount of ['', '/rooflume', '/lp/roofing-01', '/templates/service/roofing']) {
    for (const slash of mount ? ['', '/'] : ['/']) {
      const mobile = mount === '/rooflume' && slash === '/';
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 1000 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      calls = [];
      outside = [];
      const requestedUrl = base + mount + slash + '?utm_source=runtime#callback';
      const pageUrl = base + mount + '/?utm_source=runtime#callback';
      const response = await page.goto(requestedUrl, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(page.url(), pageUrl);
      const redirect = response.request().redirectedFrom();
      if (mount && !slash) {
        assert.ok(redirect, 'No-slash mount must redirect to its slash variant');
        const canonical = await redirect.response();
        assert.equal(canonical.status(), 308);
        assert.equal(canonical.headers().location, mount + '/?utm_source=runtime');
      } else assert.equal(redirect, null);
      await page.waitForFunction(() => document.querySelector('#callback').dataset.leadConnected);
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).length), 0);
      if (mount === '/rooflume') await page.screenshot({ path: `qa/runtime-output/mounted-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' });
      for (const [name, value] of Object.entries({ name: 'Test Homeowner', phone: '8185550147', email: 'test@example.test', zip: '90210', message: 'Fixture only' })) {
        await page.locator(`#callback [name="${name}"]`).fill(value);
      }
      await page.locator('#callback').evaluate(form => {
        form.querySelector('[name="website"]').value = 'fixture-honeypot';
        form.requestSubmit();
      });
      await page.waitForFunction(() => document.querySelector('.form-status').textContent.startsWith('Thanks,'));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].path, mount + '/api/lead');
      const payload = calls[0].payload;
      assert.equal(payload.fields.name, 'Test Homeowner');
      assert.equal(payload.honeypot, 'fixture-honeypot');
      assert.equal(payload.metadata.page_url, pageUrl);
      assert.equal(payload.metadata.utm_source, 'runtime');
      assert.ok(payload.submit_elapsed_ms > 0);
      assert.deepEqual(outside, []);
      await page.waitForURL(base + mount + '/thank-you/');
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal((await page.request.get(page.url())).status(), 200);
      assert.deepEqual(outside, [], 'Thank-you navigation must stay inside the Worker mount');
      for (const child of ['ddd', 'ddd/', 'random/path/', 'test/', 'test/index.html']) {
        const missing = await page.goto(base + mount + '/' + child, { waitUntil: 'networkidle' });
        assert.equal(missing.status(), 404);
        assert.equal(missing.request().redirectedFrom(), null);
        assert.equal(missing.headers()['cache-control'], 'no-store');
        assert.equal(missing.headers()['x-robots-tag'], 'noindex,nofollow,noarchive,nosnippet');
        const returnedHtml = await missing.text();
        assert.equal(mount ? returnedHtml.replaceAll(`="${mount}/`, '="/') : returnedHtml, built404,
          '404 response must be the complete built Astro page, with only mount-aware URLs changed');
        assert.equal(await page.locator('h1').textContent(), 'Page not found');
        assert.equal(await page.locator('main').evaluate(main => getComputedStyle(main).backgroundColor), 'rgb(6, 31, 73)',
          'The existing global design stylesheet must load');
        const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
        assert.ok(stylesheets.length > 0);
        let fontCount = 0;
        for (const href of stylesheets) {
          assert.ok(new URL(href).pathname.startsWith(mount + '/_astro/'));
          const css = await page.request.get(href);
          assert.equal(css.status(), 200);
          assert.match(css.headers()['content-type'], /text\/css/);
          // Preserve font references and prove the linked font files are served.
          for (const match of (await css.text()).matchAll(/url\(["']?([^\s"')]+\.woff2)["']?\)/g)) {
            const fontUrl = new URL(match[1], href);
            assert.ok(['/assets/', '/_astro/'].some(directory => fontUrl.pathname.startsWith(mount + directory)));
            const font = await page.request.get(fontUrl.href);
            assert.equal(font.status(), 200);
            assert.match(font.headers()['content-type'], /font\/woff2/);
            fontCount++;
          }
        }
        assert.ok(fontCount > 0, 'The built stylesheet must retain its self-hosted fonts');
        assert.equal(await page.locator('.button[data-runtime-mount-home]').getAttribute('href'), mount + '/');
        assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).length), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      if (mount === '/rooflume') await page.screenshot({ path: `qa/runtime-output/not-found-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' });
      await page.locator('.button[data-runtime-mount-home]').click();
      await page.waitForURL(base + mount + '/');
      assert.equal(calls.length, 1, '404 navigation must never submit another lead');
      assert.deepEqual(outside, [], '404 assets and home navigation must stay in the mount');
      await context.close();
      console.log(`PASS compiled LP, canonicalization, protected submission, thank-you and branded 404 at ${mount + slash}`);
    }
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
