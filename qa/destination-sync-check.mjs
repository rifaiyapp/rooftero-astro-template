import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = resolve(root, 'tmp');
mkdirSync(temporaryRoot, { recursive: true });
const originalProject = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8'));
const mappings = [
  ['rooflume-astro-template', 'rooflume', '/'],
  ['rooftero-astro-template', 'rooftero', '/'],
  ['vantoro-astro-template', 'vantoro', '/'],
  ['plumbero-astro-template', 'plumbero', '/'],
  ['shibga-roofing-lp-01', 'shibga-roofing-lp-01', '/lp/roofing-01/'],
  ['customer-roofing', 'customer-roofing', '/'],
];

function fixture(t, remote, overrides = {}) {
  const directory = mkdtempSync(join(temporaryRoot, 'destination-test-'));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(temporaryRoot + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const env = { ...process.env };
  // Isolate fixture Git from the real checkout, global origin and build settings.
  for (const key of Object.keys(env)) {
    if (/^GIT_/i.test(key) || ['CODEX_GITHUB_REPOSITORY', 'GITHUB_REPOSITORY', 'CLOUDFLARE_WORKER_NAME', 'DEPLOYMENT_BASE_PATH'].includes(key)) delete env[key];
  }
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(directory, 'empty-gitconfig') }, overrides);
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  const git = args => execFileSync('git', args, { cwd: directory, env, stdio: 'pipe' });
  git(['init', '--quiet']);
  if (remote) git(['remote', 'add', 'origin', remote]);
  mkdirSync(join(directory, 'scripts'));
  copyFileSync(join(root, 'scripts/sync-destination.mjs'), join(directory, 'scripts/sync-destination.mjs'));
  // Keep CRLF and formatting on a no-op run; also repair stale master settings.
  const project = structuredClone(originalProject);
  project.name = 'old-template-identity';
  project.deployment.basePath = '/old-destination/';
  writeFileSync(join(directory, 'project.config.json'), JSON.stringify(project, null, 2).replaceAll('\n', '\r\n') + '\r\n');
  const originalPublishing = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
  writeFileSync(join(directory, 'wrangler.jsonc'), '// Preserve publishing comments.\r\n' + originalPublishing);
  const protectedFiles = ['src/config/site.ts', 'src/config/lead.ts', 'src/pages/index.astro', 'src/styles/global.css'];
  for (const file of protectedFiles) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    copyFileSync(join(root, file), join(directory, file));
  }
  const read = file => readFileSync(join(directory, file), 'utf8');
  const run = () => execFileSync(process.execPath, [join(directory, 'scripts/sync-destination.mjs')], {
    // Invocation directory must never select a different repository's origin.
    cwd: root, env, encoding: 'utf8', stdio: 'pipe',
  });
  const check = (repository, worker, basePath) => {
    run();
    assert.equal(JSON.parse(read('project.config.json')).name, repository);
    assert.equal(JSON.parse(read('project.config.json')).deployment.basePath, basePath);
    assert.equal(read('wrangler.jsonc').match(/"name": "([^"]+)"/)[1], worker);
    assert.ok(read('wrangler.jsonc').startsWith('// Preserve publishing comments.\r\n'));
    assert.equal(read('wrangler.jsonc'), '// Preserve publishing comments.\r\n' + originalPublishing.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${worker}"`), 'Destination sync must preserve assets and Service Bindings');
    assert.deepEqual(JSON.parse(read('project.config.json')), {
      ...project, name: repository, deployment: { ...project.deployment, basePath },
    });
    for (const file of protectedFiles) assert.equal(read(file), readFileSync(join(root, file), 'utf8'));
    const files = ['project.config.json', 'wrangler.jsonc'];
    const before = files.map(file => {
      utimesSync(join(directory, file), new Date('2000-01-01'), new Date('2000-01-01'));
      return { content: read(file), mtime: statSync(join(directory, file)).mtimeMs };
    });
    run();
    files.forEach((file, index) => {
      assert.equal(read(file), before[index].content, 'Repeated sync changed content');
      assert.equal(statSync(join(directory, file)).mtimeMs, before[index].mtime, 'Repeated sync rewrote a file');
    });
  };
  return { check, read, run };
}

for (const [repository, worker, basePath] of mappings) {
  for (const owner of ['template-owner', 'destination-owner']) {
    test(`${owner}/${repository} adopts identity and is idempotent`, t => {
      const remote = owner === 'template-owner'
        ? `https://github.com/${owner}/${repository}.git`
        : `git@github.com:${owner}/${repository}.git`;
      fixture(t, remote, {
        CODEX_GITHUB_REPOSITORY: 'stale-owner/rooflume-astro-template',
        GITHUB_REPOSITORY: 'stale-owner/old-copy',
        CLOUDFLARE_WORKER_NAME: 'rooflume',
      }).check(repository, worker, basePath);
    });
  }
}

test('SSH URL and non-GitHub origin use the repository name', t => {
  fixture(t, 'ssh://git@code.example.test/team/vantoro-astro-template.git/').check('vantoro-astro-template', 'vantoro', '/');
});
test('templates always use root despite an old base-path override', t => {
  fixture(t, 'https://github.com/template-owner/rooftero-astro-template.git', { DEPLOYMENT_BASE_PATH: '/old/' }).check('rooftero-astro-template', 'rooftero', '/');
});
test('ordinary destinations retain an explicit base-path override', t => {
  fixture(t, 'https://github.com/destination-owner/custom-roofing.git', { DEPLOYMENT_BASE_PATH: '/campaign/' }).check('custom-roofing', 'custom-roofing', '/campaign/');
});
test('without origin, explicit repository fallback has precedence', t => {
  fixture(t, null, { CODEX_GITHUB_REPOSITORY: 'destination-owner/rooftero-astro-template', GITHUB_REPOSITORY: 'stale-owner/old-copy' }).check('rooftero-astro-template', 'rooftero', '/');
});
test('without origin or Codex fallback, GitHub repository is used', t => {
  fixture(t, null, { GITHUB_REPOSITORY: 'destination-owner/vantoro-astro-template' }).check('vantoro-astro-template', 'vantoro', '/');
});
test('without repository identity, files stay untouched', t => {
  const copy = fixture(t, null, { CLOUDFLARE_WORKER_NAME: 'rooflume' });
  const before = [copy.read('wrangler.jsonc'), copy.read('project.config.json')];
  assert.match(copy.run(), /repository identity unavailable/);
  assert.deepEqual([copy.read('wrangler.jsonc'), copy.read('project.config.json')], before);
});
test('build lifecycle retains automatic destination synchronization', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.prebuild, pkg.scripts['sync:destination']);
  assert.equal(pkg.scripts.prebuild, 'node scripts/sync-destination.mjs');
});
