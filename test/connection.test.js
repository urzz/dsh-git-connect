import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { apply, Config, testConnection } from '../lib/index.js';

const draft = { baseUrl: 'https://git.example/forge/api/v1/', tokenRef: 'draft-secret', timeoutMs: 1000 };
const signal = () => new AbortController().signal;

function setup(config = Config({})) {
  let route;
  apply({
    tools: { register() {} },
    inject(deps, callback) {
      assert.deepEqual(deps, ['connection']);
      callback({ connection: { fetch: { register(value) { route = value; } } } });
    },
  }, config);
  assert.equal(route.path, '/api/git-connect/connection-test');
  assert.deepEqual(route.methods, ['POST']);
  assert.equal(route.requestBody, 'buffered');
  return route;
}

function request(payload = draft) {
  return new Request('http://localhost/api/git-connect/connection-test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
}

async function server(t, listener) {
  const http = createServer(listener);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => { http.closeAllConnections(); http.close(); });
  return `http://127.0.0.1:${http.address().port}`;
}

test('exact API route tests the unsaved draft without changing saved credentials or returning secrets', async t => {
  const config = Config({ providers: { gitea: { tokenRef: 'saved-secret', baseUrl: 'https://saved.example/api/v1' } } });
  const route = setup(config);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://git.example/forge/api/v1/user');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'token draft-secret');
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ login: 'alice', token: 'upstream-secret', email: 'private@example.com' });
  });
  const result = await (await route.fetch(request())).json();
  assert.deepEqual(result, { ok: true, value: { login: 'alice' } });
  assert.equal(config.providers.gitea.tokenRef.get(), 'saved-secret');
  assert.equal(config.providers.gitea.baseUrl.get(), 'https://saved.example/api/v1');
  assert.doesNotMatch(JSON.stringify(result), /secret|email/);
});

test('Cordis activates tools without Connection and registers the API route when the service arrives', async t => {
  const require = createRequire(import.meta.url);
  const { Context } = createRequire(require.resolve('@deepseek-ai/dsh-tools'))('@deepseek-ai/cordis');
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  let registered = 0;
  ctx.provide('tools', { register() { registered++; } });
  const fiber = ctx.plugin({ inject: ['tools'], apply }, Config({}));
  await fiber.await();
  assert.equal(registered, 1);
  let route;
  let resolveRegistration;
  const registration = new Promise(resolve => { resolveRegistration = resolve; });
  ctx.provide('connection', { fetch: { register(value) { route = value; resolveRegistration(); } } });
  await registration;
  assert.equal(route.path, '/api/git-connect/connection-test');
  assert.equal((await (await route.fetch(request({}))).json()).error.code, 'validation');
});

test('malformed JSON is rejected before contacting Gitea', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected'); });
  const route = setup();
  const response = await route.fetch(new Request('http://localhost' + route.path, { method: 'POST', body: '{' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'validation');
  assert.equal(fetch.mock.callCount(), 0);
});

test('rejects malformed drafts, non-HTTP URLs, userinfo, query/hash and invalid timeouts without requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected'); });
  const invalid = [null, [], 'draft', {},
    ...['', 'bad', 'file:///tmp/test', 'https://user:pass@git.example', 'https://@git.example', 'https:@git.example', 'https://git.example\\path',
      'https://git.example/?secret=foo', 'https://git.example/#foo', 'https://git.example/?', 'https://git.example/#']
      .map(baseUrl => ({ ...draft, baseUrl })),
    ...['', ' \n', 'secret\r\nheader:value'].map(tokenRef => ({ ...draft, tokenRef })),
    ...[undefined, 0, 999, 1.2, '1000', 2147483648].map(timeoutMs => ({ ...draft, timeoutMs })),
  ];
  for (const value of invalid) assert.equal((await testConnection(value, signal())).error.code, 'validation');
  assert.equal(fetch.mock.callCount(), 0);
});

for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [404, 'http'], [500, 'http'], [301, 'redirect'], [307, 'redirect']]) {
  test(`HTTP ${status} has a safe ${code} result`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('draft-secret upstream detail', { status }));
    const result = await testConnection(draft, signal());
    assert.equal(result.error.code, code);
    assert.equal(result.error.details.status, status);
    assert.doesNotMatch(JSON.stringify(result), /secret|upstream detail/);
  });
}

test('network failures do not expose exception messages or credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('draft-secret https://sensitive.example'); });
  const result = await testConnection(draft, signal());
  assert.equal(result.error.code, 'network');
  assert.doesNotMatch(JSON.stringify(result), /secret|sensitive/);
});

test('requires valid JSON with an authenticated login', async t => {
  const responses = [new Response('not JSON'), Response.json({}), Response.json({ login: '' }), Response.json({ login: 1 })];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  for (let i = 0; i < 4; i++) assert.equal((await testConnection(draft, signal())).error.code, 'response');
});

test('a real HTTP /user request sends the draft token and returns login only', async t => {
  const baseUrl = await server(t, (req, res) => {
    assert.equal(req.url, '/forge/api/v1/user');
    assert.equal(req.headers.authorization, 'token draft-secret');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ login: 'alice', token: 'hidden' }));
  });
  assert.deepEqual(await testConnection({ ...draft, baseUrl: `${baseUrl}/forge/api/v1` }, signal()), { ok: true, value: { login: 'alice' } });
});

test('real redirects never forward the token to another origin', async t => {
  let leaked = 0;
  const target = await server(t, (_req, res) => { leaked++; res.end('{}'); });
  const baseUrl = await server(t, (_req, res) => { res.writeHead(302, { Location: `${target}/user` }); res.end(); });
  assert.equal((await testConnection({ ...draft, baseUrl }, signal())).error.code, 'redirect');
  assert.equal(leaked, 0);
});

test('deadline covers response body reads and is distinct from caller cancellation', async t => {
  const baseUrl = await server(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
  });
  assert.equal((await testConnection({ ...draft, baseUrl }, signal())).error.code, 'timeout');
  const controller = new AbortController();
  const pending = testConnection({ ...draft, baseUrl, timeoutMs: 30000 }, controller.signal);
  controller.abort(new Error('secret cancellation detail'));
  const result = await pending;
  assert.equal(result.error.code, 'cancelled');
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('already cancelled requests make no HTTP call', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected'); });
  const controller = new AbortController();
  controller.abort();
  assert.equal((await testConnection(draft, controller.signal)).error.code, 'cancelled');
  assert.equal(fetch.mock.callCount(), 0);
});
