import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../publishing/asset-router.mjs';
const router = { fetch(request, env) {
  return worker.fetch(request, { RUNTIME_MOUNT_PATHS: '["/rooflume/","/roofing/","/rooflume/hd/","/lp/roofing-01/","/templates/service/roofing/"]', ...env });
} };

const origin = 'https://roofing.example.test';
// Model actual file lookup, including Cloudflare's HTML canonical redirect.
const files = new Map([
  ['/', ['text/html', '<img src="/assets/roof.webp"><script src="/_astro/site.abcdefgh.js"></script><link href="/favicon.svg">']],
  ['/thank-you/', ['text/html', '<h1>Thank you</h1><img src="/assets/roof.webp">']],
  ['/404.html', ['text/html', '<h1>Page not found</h1><a href="/" data-runtime-mount-home>Back to Home</a><img src="/assets/roof.webp">']],
  ['/assets/roof.webp', ['image/webp', 'image']],
  ['/_astro/site.abcdefgh.js', ['text/javascript', 'export const ready = true;']],
  ['/_astro/site.abcdefgh.css', ['text/css', 'body{background:url(/assets/roof.webp)}']],
  ['/favicon.svg', ['image/svg+xml', '<svg/>']],
  ['/robots.txt', ['text/plain', 'User-agent: *']],
  ['/downloads/guide.pdf', ['application/pdf', 'pdf']],
]);
function assets(seen = []) {
  return { fetch(input) {
    const url = new URL(input.url);
    seen.push({ path: url.pathname, search: url.search, method: input.method });
    if (url.pathname === '/thank-you') return Response.redirect(origin + '/thank-you/', 307);
    const file = files.get(url.pathname);
    return new Response(input.method === 'HEAD' ? null : file?.[1] || 'Not found', {
      status: file ? 200 : 404,
      headers: {
        'content-type': file?.[0] || 'text/plain',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex,nofollow,noarchive,nosnippet',
        'content-security-policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
        etag: '"original"',
      },
    });
  } };
}

test('unknown children return real 404s without redirects or landing-page fallback', async () => {
  for (const prefix of ['', '/rooflume', '/lp/roofing-01', '/templates/service/roofing']) {
    for (const child of ['/ddd', '/ddd/', '/random/path/', '/test/', '/foo/', '/test/thank-you/', '/test/index.html']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await router.fetch(new Request(origin + prefix + child, { method }), { ASSETS: assets() });
        assert.equal(response.status, 404, prefix + child);
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await response.text();
        if (method === 'HEAD') assert.equal(body, '');
        else if (!child.endsWith('.html')) {
          assert.match(body, /Page not found/);
          assert.ok(body.includes(`href="${prefix}/"`));
          assert.ok(body.includes(`src="${prefix}/assets/roof.webp"`));
        }
      }
    }
  }
});

test('runtime JSON and text values enable mounts immediately; no rebuild or cached discovery', async () => {
  const env = { ASSETS: assets() };
  for (const value of [undefined, '["/rooflume/"]', [], ['/lp/roofing-01'], '["/rooflume/","/rooflume/hd/"]', '["/"]']) {
    env.RUNTIME_MOUNT_PATHS = value;
    const approved = value === undefined ? [] : typeof value === 'string' ? JSON.parse(value) : value;
    for (const prefix of ['', '/rooflume', '/lp/roofing-01', '/unconfigured']) {
      const enabled = !prefix || approved.some(path => path.replace(/\/$/, '') === prefix);
      for (const suffix of ['/', '/thank-you/']) {
        const response = await worker.fetch(new Request(origin + prefix + suffix), env);
        assert.equal(response.status, enabled ? 200 : 404, prefix + suffix);
      }
    }
  }
});

test('invalid runtime values reject the entire nested list while root remains available', async () => {
  for (const value of ['', 'not-json', 'null', '"/rooflume/"', {}, null, 1,
    ...['/rooflume//', '//outside.test/', 'https://outside.test/', '/a/../rooflume/', '/a/%2e%2e/',
      '/rooflume/?q=x', '/rooflume/#x', '/rooflume\\child/', '/rooflume/%2Fchild/', '/api/', '/assets/nested/',
      '/_astro/', '/thank-you/', '/index.html/', '/space here/', 42].map(path => JSON.stringify(['/rooflume/', path]))]) {
    const env = { RUNTIME_MOUNT_PATHS: value, ASSETS: assets(), LEAD_GATEWAY: { fetch: () => Response.json({ success: true }) } };
    for (const path of ['/', '/thank-you/']) assert.equal((await worker.fetch(new Request(origin + path), env)).status, 200);
    for (const path of ['/rooflume', '/rooflume/', '/rooflume/thank-you/']) {
      assert.equal((await worker.fetch(new Request(origin + path), env)).status, 404);
    }
    for (const prefix of ['', '/rooflume']) {
      const response = await worker.fetch(new Request(origin + prefix + '/api/lead', {
        method: 'POST', body: '{}', headers: { origin, 'content-type': 'application/json' },
      }), env);
      assert.equal(response.status, prefix ? 404 : 200);
    }
  }
});

test('longest mount and segment boundaries prevent child/sibling aliases and gateway access', async () => {
  for (const path of ['/rooflumee/', '/rooflume/hd/ddd/', '/rooflume/test/api/lead', '/unconfigured/api/lead']) {
    const api = path.endsWith('/api/lead');
    const response = await router.fetch(new Request(origin + path, api ? {
      method: 'POST', body: '{}', headers: { origin, 'content-type': 'application/json' },
    } : {}), { ASSETS: assets(), LEAD_GATEWAY: { fetch() { assert.fail('Unknown mount reached gateway'); } } });
    assert.equal(response.status, 404);
    if (!api) assert.ok((await response.text()).includes(`href="${path.startsWith('/rooflume/hd/') ? '/rooflume/hd/' : '/'}"`));
  }
});

test('binding fallback cannot turn unknown documents into landing pages or redirects', async () => {
  for (const status of [200, 301, 308, 404]) {
    for (const path of ['/rooflume/ddd', '/rooflume/ddd/', '/unknown/']) {
      const response = await router.fetch(new Request(origin + path), { ASSETS: { fetch(input) {
        assert.equal(new URL(input.url).pathname, '/404.html', 'Unknown document must not reach the landing lookup');
        return new Response(status === 200 ? '<h1>Page not found</h1>' : null, {
          status, headers: { 'content-type': 'text/html', location: '/' },
        });
      } } });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('location'), null);
    }
  }
});

test('404 rendering follows only internal HTML canonicalization and preserves the page assets', async () => {
  const html = '<html><head><link rel="stylesheet" href="/_astro/site.abcdefgh.css"></head><body><h1>Page not found</h1><img src="/assets/roof.webp"><a href="/" data-runtime-mount-home>Back to Home</a></body></html>';
  for (const prefix of ['', '/rooflume', '/lp/roofing-01']) {
    for (const target of ['/404', '/404/', '/404/index.html']) {
      for (const redirectStatus of [301, 302, 303, 307, 308]) {
        for (const status of [200, 404]) {
          for (const method of ['GET', 'HEAD']) {
            const calls = [];
            const response = await router.fetch(new Request(origin + prefix + '/ddd/?source=test', { method }), {
              ASSETS: { fetch(input) {
                const path = new URL(input.url).pathname;
                calls.push(path);
                assert.equal(input.method, 'GET', 'Even HEAD needs the real page headers');
                assert.equal(input.redirect, 'manual', 'Redirects must remain inside ASSETS');
                if (path === '/404.html') return new Response(null, { status: redirectStatus, headers: { location: target } });
                assert.equal(path, target);
                return new Response(html, { status, headers: {
                  'content-type': 'text/html',
                  'content-security-policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
                  etag: '"original"', 'content-length': String(html.length),
                } });
              } },
            });
            assert.deepEqual(calls, ['/404.html', target]);
            assert.equal(response.status, 404);
            assert.equal(response.headers.get('location'), null);
            assert.equal(response.headers.get('etag'), null);
            assert.equal(response.headers.get('content-length'), null);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(response.headers.get('content-security-policy'), "base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
            const expected = html.replaceAll('="/_astro/', `="${prefix}/_astro/`).replaceAll('="/assets/', `="${prefix}/assets/`).replace('href="/" data-runtime-mount-home', `href="${prefix}/" data-runtime-mount-home`);
            assert.equal(await response.text(), method === 'HEAD' ? '' : expected);
          }
        }
      }
    }
  }
});

test('404 asset redirect loops and unrelated destinations never escape into public routing or another design', async () => {
  for (const target of ['/404.html', '/', '/thank-you/', 'https://other.example.test/404', 'http://[invalid']) {
    let calls = 0;
    const response = await router.fetch(new Request(origin + '/rooflume/ddd/'), { ASSETS: { fetch(input) {
      calls++;
      assert.equal(new URL(input.url).pathname, '/404.html');
      return new Response('Redirect body must not be rendered', { status: 307, headers: { location: target } });
    } } });
    assert.equal(calls, 1);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
    assert.equal(await response.text(), '', 'The Astro asset is the sole 404 design');
  }
});

for (const prefix of ['/rooflume', '/lp/roofing-01', '/templates/service/roofing']) {
  test(`GET/HEAD ${prefix} canonicalizes before asset redirects and retains host/query`, async () => {
    for (const host of [origin, 'https://worker.example.workers.dev']) {
      for (const method of ['GET', 'HEAD']) {
        for (const query of ['', '?source=test&next=%2Felsewhere%2F']) {
          const input = new Request(host + prefix + query, { method });
          const response = await router.fetch(input, { ASSETS: { fetch() {
            assert.fail('Mount canonicalization must happen before the asset binding');
          } } });
          assert.equal(response.status, 308);
          assert.equal(response.headers.get('location'), prefix + '/' + query);
          assert.equal(new URL(response.headers.get('location'), input.url).origin, host);
          assert.equal(await response.text(), '');
          assert.equal(response.headers.get('x-robots-tag'), 'noindex,nofollow,noarchive,nosnippet');
          assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
          assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
          assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
        }
      }
    }
  });
}

test('root and static file redirects retain their original behavior', async () => {
  for (const path of ['/', '/favicon.svg', '/assets/missing.webp', '/thank-you']) {
    const target = path === '/thank-you' ? '/thank-you/' : '/';
    const response = await router.fetch(new Request(origin + path), {
      ASSETS: { fetch: () => new Response(null, { status: 301, headers: { location: target } }) },
    });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), target);
  }
});

for (const prefix of ['', '/rooflume', '/roofing', '/rooflume/hd', '/lp/roofing-01', '/templates/service/roofing']) {
  for (const suffix of ['/', ...(prefix ? ['/thank-you'] : []), '/thank-you/']) {
    const path = prefix + suffix;
    test(`GET ${path} serves the correct page without redirecting`, async () => {
      const seen = [];
      const input = new Request(origin + path + '?source=test');
      const response = await router.fetch(input, { ASSETS: assets(seen) });
      const canonical = suffix.startsWith('/thank-you') ? '/thank-you/' : '/';
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('location'), null);
      assert.equal(input.url, origin + path + '?source=test');
      assert.equal(seen.at(-1).path, canonical);
      assert.ok(seen.every(call => call.search === '?source=test' && call.method === 'GET'));
      const body = await response.text();
      assert.equal(body.includes('<h1>Thank you</h1>'), canonical === '/thank-you/');
      assert.ok(body.includes(`src="${prefix}/assets/roof.webp"`));
      if (canonical === '/') {
        assert.ok(body.includes(`src="${prefix}/_astro/site.abcdefgh.js"`));
        assert.ok(body.includes(`href="${prefix}/favicon.svg"`));
      }
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex,nofollow,noarchive,nosnippet');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
      if (prefix) assert.equal(response.headers.get('etag'), null);
    });
  }
  test(`static files and missing assets remain correct at ${prefix || '/'}`, async () => {
    for (const [path, [type, content]] of files) {
      if (type === 'text/html') continue;
      const seen = [];
      const response = await router.fetch(new Request(origin + prefix + path), { ASSETS: assets(seen) });
      assert.equal(response.status, 200);
      assert.equal(seen.at(-1).path, path);
      assert.equal(response.headers.get('content-type'), type);
      assert.equal(await response.text(), type === 'text/css' ? content.replace('/assets/', prefix + '/assets/') : content);
      assert.equal(response.headers.get('cache-control'), path.startsWith('/_astro/')
        ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    }
    for (const path of ['/assets/missing.webp', '/assets/missing', '/_astro/missing.abcdefgh.js', '/favicon-missing.svg', '/downloads/missing.pdf', '/api/unknown']) {
      const seen = [];
      const response = await router.fetch(new Request(origin + prefix + path), { ASSETS: assets(seen) });
      assert.equal(response.status, 404, prefix + path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(seen.every(call => call.path !== '/'), 'Missing files must not become the LP');
    }
  });
}

test('root assets take priority; HEAD and non-GET semantics are preserved', async () => {
  const seen = [];
  const response = await router.fetch(new Request(origin + '/rooflume/', { method: 'HEAD' }), { ASSETS: assets(seen) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.ok(seen.every(call => call.method === 'HEAD'));
  const calls = [];
  const exact = await router.fetch(new Request(origin + '/downloads/guide.pdf'), { ASSETS: assets(calls) });
  assert.equal(exact.status, 200);
  assert.equal(calls.length, 1);
  const postCalls = [];
  const post = await router.fetch(new Request(origin + '/rooflume/', { method: 'POST' }), { ASSETS: assets(postCalls) });
  assert.equal(post.status, 404);
  assert.equal(postCalls.length, 1);
});

for (const prefix of ['/rooflume', '/lp/roofing-01', '/templates/service/roofing']) {
  test(`nested API security checks fail closed at ${prefix}`, async () => {
    for (const [status, options, binding] of [
      [405, { method: 'GET', body: undefined }],
      [403, { headers: { origin: 'https://other.example.test' } }],
      [415, { headers: { 'content-type': 'text/plain' } }],
      [400, { body: '{invalid' }],
      [413, { body: JSON.stringify({ data: 'x'.repeat(32768) }) }],
      [503, {}, {}],
      [502, {}, { fetch: () => Response.redirect('https://other.example.test') }],
    ]) {
      const input = new Request(origin + prefix + '/api/lead', {
        method: 'POST', body: '{}', ...options,
        headers: { origin, 'content-type': 'application/json', ...options.headers },
      });
      const response = await router.fetch(input, {
        ASSETS: { fetch() { assert.fail('API must not reach assets'); } },
        LEAD_GATEWAY: binding ?? { fetch() { assert.fail('Rejected request must not reach binding'); } },
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { success: false, message: "We couldn't send your request. Please try again." });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
  });
}
