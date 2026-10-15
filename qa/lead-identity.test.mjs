import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import router from '../publishing/asset-router.mjs';
import { leadIdentity } from '../src/config/lead-worker.mjs';

const origin = 'https://keydiv.com';
const mount = '/templates/rooftero/';
const payload = {
  project_id: leadIdentity.projectId,
  form_id: leadIdentity.formId,
  fields: { name: 'Test Lead', phone: '1234567890', email: 'qa@example.test' },
  meta: { submit_elapsed_ms: 6000 },
  honeypot: '',
};
const request = (path, patch = {}) => new Request(origin + path, {
  method: 'POST', headers: {
    origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin',
  },
  body: JSON.stringify({ ...payload, ...patch }),
});

test('build-time browser/server IDs match; private service binding is preserved', () => {
  const leadSource = readFileSync(new URL('../src/config/lead.ts', import.meta.url), 'utf8');
  assert.match(leadSource, new RegExp("projectId:\\s*'" + leadIdentity.projectId + "'"));
  assert.match(leadSource, new RegExp("formId:\\s*'" + leadIdentity.formId + "'"));
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.keep_vars, true);
  assert.deepEqual(config.services, [{ binding: 'LEAD_GATEWAY', service: 'lead-gateway' }]);
});

for (const path of ['/api/lead', mount + 'api/lead']) {
  test('valid lead forwards once through the private gateway at ' + path, async () => {
    let count = 0;
    const env = {
      RUNTIME_MOUNT_PATHS: JSON.stringify([mount]),
      ASSETS: { fetch() { assert.fail('Lead request reached assets'); } },
      LEAD_GATEWAY: { async fetch(internal) {
        count++;
        assert.equal(new URL(internal.url).pathname, '/v1/submit');
        assert.equal(internal.method, 'POST');
        assert.equal(internal.headers.get('origin'), origin);
        assert.deepEqual(await internal.json(), payload);
        return Response.json({ success: true });
      } },
    };
    const response = await router.fetch(request(path), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(count, 1);
  });

  test('forged website/form identities cannot access Gateway at ' + path, async () => {
    const env = {
      RUNTIME_MOUNT_PATHS: JSON.stringify([mount]),
      ASSETS: { fetch() { assert.fail('Lead request reached assets'); } },
      LEAD_GATEWAY: { fetch() { assert.fail('Forged lead reached Gateway'); } },
    };
    for (const patch of [
      { project_id: 'other-site' },
      { form_id: 'other-form' },
      { project_id: 'other-site', form_id: 'other-form' },
    ]) {
      const response = await router.fetch(request(path, patch), env);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).success, false);
    }
  });
}
