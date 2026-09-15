import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import worker from '../publishing/asset-router.mjs';
const router = { fetch(request, env) {
  return worker.fetch(request, { RUNTIME_MOUNT_PATHS: '["/rooflume/","/lp/roofing-01/","/templates/service/roofing/"]', ...env });
} };
import { resolveRuntimeMount } from '../src/utils/runtime-mount.mjs';

function loadLeadConfig(base, mode = 'live') {
  const source = readFileSync(new URL('../src/config/lead.ts', import.meta.url), 'utf8');
  const env = { BASE_URL: base, PUBLIC_LEAD_MODE: mode, PUBLIC_LEAD_PROJECT_ID: 'qa-project', PUBLIC_LEAD_FORM_ID: 'qa-form' };
  const compiled = ts.transpile(source.replaceAll('import.meta.env', JSON.stringify(env)), { module: ts.ModuleKind.CommonJS });
  const exports = {};
  new Function('exports', compiled)(exports);
  return exports;
}

const origin = 'https://roofing.example.test';
const metadata = { page_url: origin + '/', referrer: '', utm_source: 'search', submit_elapsed_ms: 3456 };
const payload = {
  project_id: 'qa-project', form_id: 'qa-form',
  fields: { name: 'Test Homeowner', phone: '8185550147', email: 'test@example.test', zip: '90210', message: 'Roof inspection', extra: ['one', 'two'] },
  metadata, submit_elapsed_ms: 3456, honeypot: 'bot.example',
  meta: metadata, website: 'bot.example',
};
function request(path = '/api/lead', options = {}) {
  return new Request(origin + path, {
    method: 'POST', body: JSON.stringify(payload), ...options,
    headers: { origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...options.headers },
  });
}
const noAssets = { fetch() { assert.fail('API requests must never reach ASSETS'); } };
const noGateway = { fetch() { assert.fail('Rejected requests must never reach the binding'); } };
async function rejected(input, status, binding = noGateway) {
  const response = await router.fetch(input, { ASSETS: noAssets, LEAD_GATEWAY: binding });
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { success: false, message: "We couldn't send your request. Please try again." });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  return response;
}

for (const path of ['/api/lead', '/rooflume/api/lead', '/lp/roofing-01/api/lead', '/templates/service/roofing/api/lead']) {
  test(`POST ${path} awaits binding, preserves exact JSON and safe browser context`, async () => {
    let received;
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    const input = request(path, { headers: {
      referer: origin + '/?utm_source=search', 'cf-connecting-ip': '192.0.2.1', 'user-agent': 'test-browser',
      cookie: 'private=value', authorization: 'Bearer do-not-forward', 'x-forwarded-for': 'spoofed',
    } });
    const raw = await input.clone().text();
    let settled = false;
    const pending = router.fetch(input, { ASSETS: noAssets, LEAD_GATEWAY: { async fetch(internal) {
      received = internal;
      await ready;
      return Response.json({ success: true, detail: 'private implementation detail' }, {
        headers: { 'set-cookie': 'private=value', 'x-internal': 'hidden', 'access-control-allow-origin': '*' },
      });
    } } }).then(response => { settled = true; return response; });
    while (!received) await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(new URL(received.url).pathname, '/v1/submit');
    assert.equal(received.method, 'POST');
    assert.equal(received.redirect, 'manual');
    assert.equal(await received.text(), raw);
    for (const header of ['origin', 'referer', 'cf-connecting-ip', 'user-agent']) assert.equal(received.headers.get(header), input.headers.get(header));
    for (const header of ['authorization', 'cookie', 'x-forwarded-for']) assert.equal(received.headers.get(header), null);
    release();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    for (const header of ['set-cookie', 'x-internal', 'access-control-allow-origin']) assert.equal(response.headers.get(header), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}

test('unsupported methods return 405 with Allow POST', async () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    const response = await rejected(request('/api/lead', { method, body: undefined }), 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
});
test('cross-origin, same-site cross-origin and absent/null origins fail closed', async () => {
  for (const headers of [
    { origin: 'https://other.example.test' }, { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
  ]) await rejected(request('/api/lead', { headers }), 403);
  const input = request(); input.headers.delete('origin');
  await rejected(input, 403);
});
test('only JSON objects with valid UTF-8 are accepted', async () => {
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
    await rejected(request('/api/lead', { headers: { 'content-type': contentType } }), 415);
  }
  for (const body of ['{invalid', '', 'null', '[]', '"string"', '123', new Uint8Array([0xff])]) {
    await rejected(request('/api/lead', { body }), 400);
  }
});
test('size protection checks both declared length and streamed bytes', async () => {
  await rejected(request('/api/lead', { headers: { 'content-length': String(32 * 1024 + 1) } }), 413);
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new TextEncoder().encode('😀'.repeat(4096))); },
      cancel() { cancelled = true; },
    });
    await rejected(request('/api/lead', { body, headers, duplex: 'half' }), 413);
    assert.equal(cancelled, true);
  }
});
test('missing or malformed binding fails safely', async () => {
  for (const binding of [null, {}, { fetch: true }]) await rejected(request(), 503, binding);
  const response = await router.fetch(request(), { ASSETS: noAssets });
  assert.equal(response.status, 503);
});
test('gateway rejection, redirect, malformed response and exceptions never leak', async () => {
  for (const [status, makeResponse] of [
    [502, () => { throw new Error('private implementation detail'); }],
    [502, () => new Response('private implementation detail', { status: 500 })],
    [429, () => new Response('private implementation detail', { status: 429 })],
    [502, () => Response.redirect('https://private.example.test')],
    [502, () => Response.json({ success: false, error: 'private implementation detail' })],
    [502, () => Response.json({ success: 'true' })],
    [502, () => new Response('{invalid')],
    [502, () => new Response(null, { status: 204 })],
    [502, () => Response.json({ success: true, data: 'x'.repeat(32 * 1024) })],
  ]) await rejected(request(), status, { fetch: makeResponse });
});
import './runtime-mount-check.mjs';

test('the same form build uses the submission mount for lead delivery and delayed navigation', async () => {
  const source = readFileSync(new URL('../src/scripts/lead-form.ts', import.meta.url), 'utf8');
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS });
  for (const configuredBase of ['/', '/lp/roofing-01/', '/campaign/', '/campaign']) {
    const exports = {};
    const window = { location: {}, setTimeout: callback => timers.push(callback), clearTimeout() {} };
    let timers;
    let requests;
    let success;
    let expectedLead;
    runInNewContext(compiled, {
      exports, window, performance, URLSearchParams, AbortController, Set,
      document: { referrer: '' },
      FormData: class extends Map { getAll(key) { return [this.get(key)]; } },
      CustomEvent: class {},
      require(id) {
        if (id === '../utils/runtime-mount.mjs') return { resolveRuntimeMount };
        if (id === '../config/site') return { site: { name: 'Test' } };
        if (id === '../config/lead') return loadLeadConfig(configuredBase);
        assert.fail(`Unexpected import: ${id}`);
      },
      async fetch(endpoint, options) {
        requests++;
        assert.equal(endpoint, expectedLead);
        assert.equal(options.mode, 'same-origin');
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        return { ok: true, json: async () => ({ success }) };
      },
    });
    // Reuse identical compiled code at workers.dev and custom-domain mounts,
    // with intentionally unrelated build bases.
    for (const host of ['https://worker.example.workers.dev', 'https://templates.example.test']) {
      for (const [path, mount] of [
        ['/', '/'],
        ['/rooflume', '/rooflume/'], ['/rooflume/', '/rooflume/'],
        ['/lp/roofing-01/', '/lp/roofing-01/'],
        ['/templates/service/roofing/', '/templates/service/roofing/'],
        ['/rooflume/ddd/', '/rooflume/ddd/'],
        ['/rooflume/api/lead', '/rooflume/'],
        ['/rooflume/thank-you/', '/rooflume/'],
      ]) {
        const url = host + path + '?utm_source=test#callback';
        const expected = mount + 'thank-you/';
        expectedLead = mount + 'api/lead';
        for (success of [true, false]) {
          const location = new URL(url);
          window.location = {
            pathname: location.pathname, search: location.search,
            get href() { return location.href; },
            set href(value) { location.href = new URL(value, location).href; },
          };
          timers = [];
          requests = 0;
          const button = { textContent: 'Submit' };
          const status = {};
          let submit;
          const form = Object.assign(new Map([['name', 'Test']]), {
            dataset: {}, querySelector: selector => selector === '.form-status' ? status : button,
            querySelectorAll: () => [], checkValidity: () => true,
            addEventListener(type, handler) { if (type === 'submit') submit = handler; },
            setAttribute() {}, removeAttribute() {}, reset() {}, dispatchEvent() {},
          });
          exports.connectLeadForm(form);
          await submit({ preventDefault() {} });
          assert.equal(requests, 1);
          assert.equal(timers.length, success ? 2 : 1, 'Only confirmed success schedules navigation');
          if (success) {
            window.location.pathname = '/changed-after-submission/';
            timers[1]();
          }
          assert.equal(window.location.href, success ? new URL(expected, url).href : url);
        }
      }
    }
  }
});
test('the same frontend configuration resolves endpoints from runtime paths regardless of build base', () => {
  const source = readFileSync(new URL('../src/config/lead.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /PUBLIC_LEAD_ENDPOINT|https?:\/\//);
  const client = readFileSync(new URL('../src/scripts/lead-form.ts', import.meta.url), 'utf8');
  assert.match(client, /mode: 'same-origin'/);
  assert.doesNotMatch(client, /https?:\/\//);
  for (const base of ['/', '/lp/roofing-01/', '/campaign/']) {
    for (const mode of ['live', 'demo']) {
      const exports = loadLeadConfig(base, mode);
      for (const [path, expected] of [
        ['/', '/api/lead'], ['/index.html', '/api/lead'],
        ['/rooflume', '/rooflume/api/lead'], ['/rooflume/', '/rooflume/api/lead'],
        ['/lp/roofing-01', '/lp/roofing-01/api/lead'], ['/lp/roofing-01/', '/lp/roofing-01/api/lead'],
        ['/templates/service/roofing/', '/templates/service/roofing/api/lead'],
        ['/rooflume/ddd', '/rooflume/ddd/api/lead'],
        ['//rooflume//', '/rooflume/api/lead'],
        ['/api/lead', '/api/lead'], ['/thank-you/', '/api/lead'],
        ['/rooflume/api/lead', '/rooflume/api/lead'],
        ['/rooflume/thank-you/', '/rooflume/api/lead'],
      ]) assert.equal(resolveRuntimeMount(path) + 'api/lead', expected);
      assert.equal(exports.hasLiveLeadService(), mode === 'live');
    }
  }
  const publishing = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(publishing.services.filter(service => service.binding === 'LEAD_GATEWAY').length, 1);
  assert.equal(publishing.assets.binding, 'ASSETS');
  assert.equal(publishing.assets.run_worker_first, true);
  assert.equal(publishing.keep_vars, true);
  assert.equal(publishing.vars?.RUNTIME_MOUNT_PATHS, undefined, 'Dashboard mounts must not be overwritten at deployment');
});
