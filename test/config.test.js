import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from '../lib/index.js';

for (const provider of ['github', 'gitea']) {
  test(`${provider} reads saved volatile config on the next call without re-registering`, async t => {
    const values = { baseUrl: 'https://old.example/api', tokenRef: '', requestTimeoutMs: 3000, maxPageSize: 10 };
    const live = key => ({ get: () => values[key] });
    let tool;
    let registrations = 0;
    apply({ tools: { register(value) { tool = value; registrations++; } } }, {
      providers: { ...Config({}).providers, [provider]: { baseUrl: live('baseUrl'), tokenRef: live('tokenRef') } },
      requestTimeoutMs: live('requestTimeoutMs'), maxPageSize: live('maxPageSize'),
    });
    const requests = [];
    const timeouts = [];
    t.mock.method(AbortSignal, 'timeout', ms => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      requests.push({ url: String(url), auth: init.headers.get('Authorization') });
      return Response.json([]);
    });
    const args = { provider, action: 'repository_list' };
    const exec = { signal: new AbortController().signal };
    await assert.rejects(tool.execute(args, exec), /tokenRef/);
    values.tokenRef = 'first-token';
    await tool.execute(args, exec);
    Object.assign(values, { tokenRef: 'rotated-token', baseUrl: 'https://new.example/api', requestTimeoutMs: 6000, maxPageSize: 5 });
    await tool.execute(args, exec);
    const prefix = provider === 'github' ? 'Bearer' : 'token';
    assert.deepEqual(requests, [
      { url: 'https://old.example/api/user/repos?page=1&per_page=10', auth: `${prefix} first-token` },
      { url: 'https://new.example/api/user/repos?page=1&per_page=5', auth: `${prefix} rotated-token` },
    ]);
    assert.deepEqual(timeouts, [3000, 6000]);
    await assert.rejects(tool.execute({ ...args, per_page: 6 }, exec), /per_page must be <= 5/);
    values.tokenRef = '';
    await assert.rejects(tool.execute(args, exec), /tokenRef/);
    assert.equal(requests.length, 2);
    assert.equal(registrations, 1);
    assert.equal(tool.timeoutMs, undefined, 'a static tool deadline must not override the live HTTP timeout');
  });
}
