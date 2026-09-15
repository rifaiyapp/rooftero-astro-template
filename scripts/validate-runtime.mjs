import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const config = JSON.parse(await read('project.config.json'));
const pkg = JSON.parse(await read('package.json'));
assert.equal(config.profile, 'private-demo', 'Review profile gates explicitly before changing profiles');
assert.equal(config.factoryVersion, '4.7');
assert.equal(pkg.engines.node, '>=22.12.0 <25');
assert.equal(pkg.engines.npm, '11.x');
assert.ok(!pkg.dependencies.wrangler && !pkg.devDependencies.wrangler);
for (const path of ['DESIGN.md', 'docs/KEYDIV-UI-DESIGN.md', 'docs/DISTRIBUTION.md', 'AGENTS.md', 'scripts/codex-cloud-setup.sh', 'scripts/codex-cloud-maintenance.sh']) {
  assert.ok((await read(path)).trim(), `Missing runtime: ${path}`);
}
const agents = await read('AGENTS.md');
assert.equal(agents.split('## Keydiv strict final-response contract').length - 1, 1);
assert.equal(agents.split('## Keydiv UI/UX design runtime').length - 1, 1);
for (const path of ['scripts/codex-cloud-setup.sh', 'scripts/codex-cloud-maintenance.sh']) {
  assert.ok(!(await read(path)).includes('\r'), 'Cloud shell scripts must use LF');
}
const html = await read('dist/index.html');
assert.match(html, /name="robots" content="noindex,nofollow,noarchive,nosnippet"/);
assert.doesNotMatch(html, /rel="canonical"/);
assert.doesNotMatch(html, /Welcome to Astro|astro\.build\/chat/);
assert.ok(!(await readdir('dist')).some(name => /^sitemap/i.test(name)));
assert.match(await read('dist/robots.txt'), /Allow: \//);
const headers = await read('dist/_headers');
for (const required of ['X-Robots-Tag: noindex,nofollow,noarchive,nosnippet', 'X-Content-Type-Options: nosniff', 'frame-ancestors', 'Referrer-Policy:', 'Permissions-Policy:']) assert.ok(headers.includes(required));
assert.doesNotMatch(headers, /immutable|max-age=31536000/);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.match(html, /id="main-content"/);
assert.match(html, /id="callback"/);
console.log('Runtime, static output, private-demo and security baseline passed.');
