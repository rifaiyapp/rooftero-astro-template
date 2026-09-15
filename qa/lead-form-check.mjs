import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

// Serve built artifacts only; gateway requests are intercepted, so no test leads are sent.
const root = resolve(process.env.QA_DIST || 'dist');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  if (!file.startsWith(root + '/' ) && !file.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const endpoint = base + '/api/lead';
const values = { name: 'Test Homeowner', phone: '(818) 555-0147', email: 'test@example.com', zip: '90210-1234', message: 'Please inspect my roof.\nThank you.' };
const error = "We couldn't send your request. Please try again.";
try {
  const page = await browser.newPage();
  let calls = [];
  let respond;
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.route(endpoint, async route => {
    assert.equal(route.request().method(), 'POST');
    assert.equal(route.request().headers()['content-type'], 'application/json');
    calls.push(route.request().postDataJSON());
    await respond(route);
  });
  const open = async (query = '') => {
    calls = [];
    await page.goto(base + '/' + query, { referer: 'https://example.com/campaign' });
    await page.waitForFunction(() => document.querySelector('#callback').dataset.leadConnected);
  };
  const fill = async () => { for (const [key, value] of Object.entries(values)) await page.locator(`[name="${key}"]`).fill(value); };
  const submit = () => page.locator('#callback').evaluate(form => form.requestSubmit());
  const status = () => page.locator('.form-status').textContent();
  const waitStatus = text => page.waitForFunction(text => document.querySelector('.form-status').textContent === text, text);

  await open('?utm_source=google&utm_medium=cpc&utm_campaign=roof%20repair&utm_term=local&utm_content=hero');
  assert.deepEqual(await page.locator('#callback [name]').evaluateAll(inputs => inputs.map(i => i.name)), ['website', ...Object.keys(values)]);
  const hp = page.locator('[name="website"]');
  assert.equal(await hp.getAttribute('type'), 'text');
  assert.equal(await hp.getAttribute('tabindex'), '-1');
  assert.equal(await hp.locator('..').getAttribute('aria-hidden'), 'true');
  assert.equal(await hp.locator('..').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
  await page.locator('[name="name"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.name), 'phone');
  await submit();
  assert.equal(calls.length, 0);
  await fill();
  for (const [key, invalid] of [['email', 'invalid'], ['phone', 'abc'], ['zip', '123'], ['name', '   ']]) {
    await page.locator(`[name="${key}"]`).fill(invalid);
    await submit();
    assert.equal(calls.length, 0);
    await page.locator(`[name="${key}"]`).fill(values[key]);
  }
  let release;
  respond = async route => { await new Promise(done => { release = done; }); await route.fulfill({ json: { success: true } }); };
  await page.evaluate(() => { window.leadEvents = 0; document.addEventListener('rooflume:lead-submitted', () => window.leadEvents++); });
  await submit();
  await page.waitForFunction(() => document.querySelector('button[type="submit"]').disabled);
  await submit();
  assert.equal(await page.locator('[name="name"]').inputValue(), values.name);
  while (!release) await new Promise(done => setTimeout(done, 10));
  assert.equal(calls.length, 1);
  const elapsed = calls[0].meta.submit_elapsed_ms;
  assert.ok(Number.isInteger(elapsed) && elapsed > 0);
  assert.ok(elapsed <= await page.evaluate(() => Math.ceil(performance.now())));
  assert.deepEqual(calls[0], {
    project_id: 'qa-project', form_id: 'qa-form', fields: values, website: '',
    metadata: calls[0].meta, submit_elapsed_ms: elapsed, honeypot: '',
    meta: { page_url: page.url(), utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'roof repair', utm_term: 'local', utm_content: 'hero', referrer: await page.evaluate(() => document.referrer), submit_elapsed_ms: elapsed },
  });
  release();
  await waitStatus('Thanks, Test! A Rooflume roofing specialist will call you shortly.');
  assert.equal(await page.locator('[name="name"]').inputValue(), '');
  assert.equal(await page.locator('button[type="submit"]').textContent(), 'Get Free Inspection');
  await submit();
  assert.equal(calls.length, 1);
  assert.equal(await page.evaluate(() => window.leadEvents), 1);
  await page.waitForURL(base + '/thank-you/');
  assert.equal(await page.locator('h1').count(), 1);

  for (const [label, handler] of [
    ['API rejection', route => route.fulfill({ json: { success: false, detail: 'private backend error' } })],
    ['HTTP error', route => route.fulfill({ status: 500, json: { success: true } })],
    ['malformed JSON', route => route.fulfill({ body: '{invalid' })],
    ['wrong shape', route => route.fulfill({ json: { success: 'true' } })],
    ['null response', route => route.fulfill({ body: 'null' })],
    ['network error', route => route.abort('failed')],
    ['timeout', async route => { await new Promise(done => setTimeout(done, 16000)); await route.abort().catch(() => {}); }],
  ]) {
    respond = handler;
    await open();
    await fill();
    await submit();
    await waitStatus(error);
    assert.equal(await status(), error);
    assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
    for (const [key, value] of Object.entries(values)) assert.equal(await page.locator(`[name="${key}"]`).inputValue(), value);
    assert.equal(calls.length, 1);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) assert.equal(calls[0].meta[key], '');
    console.log(`PASS ${label}: retained inputs, generic error, retry enabled, one request`);
  }
  respond = route => route.fulfill({ json: { success: true } });
  await hp.evaluate(el => { el.value = 'bot.example'; });
  await page.locator('#callback').evaluate(form => {
    for (const value of ['one', 'two']) { const input = document.createElement('input'); input.name = 'extra'; input.value = value; form.append(input); }
  });
  await submit();
  await waitStatus('Thanks, Test! A Rooflume roofing specialist will call you shortly.');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].website, 'bot.example');
  assert.equal(calls[1].honeypot, 'bot.example');
  assert.equal('website' in calls[1].fields, false);
  assert.deepEqual(calls[1].fields.extra, ['one', 'two']);
  console.log('PASS success, validation, payload, UTMs, referrer, honeypot, dynamic/repeated fields, duplicate prevention and retry');
  if (process.env.QA_BASELINE) {
    const before = await browser.newPage({ reducedMotion: 'reduce' });
    const after = await browser.newPage({ reducedMotion: 'reduce' });
    await before.route(base + '/**', async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ path: resolve(process.env.QA_BASELINE, '.' + (path === '/' ? '/index.html' : path)) });
    });
    for (const width of [1440, 390]) {
      for (const target of [before, after]) {
        await target.setViewportSize({ width, height: 1000 });
        await target.goto(base, { waitUntil: 'networkidle' });
        await target.evaluate(() => document.fonts.ready);
      }
      const original = await before.locator('#callback').screenshot({ animations: 'disabled' });
      const updated = await after.locator('#callback').screenshot({ animations: 'disabled' });
      assert.ok(original.equals(updated), `Form pixels differ at ${width}px`);
      console.log(`PASS unchanged form screenshot at ${width}px`);
    }
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
