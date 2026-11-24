import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from '../lib/index.js';

const instances = [
  { origin: 'https://git.one.example', baseUrl: 'https://api.one.example/api/v1', tokenRef: 'one' },
  { origin: 'https://git.two.example/forge', baseUrl: 'https://git.two.example/forge/api/v1', tokenRef: 'two' },
];
const args = { provider: 'gitea', action: 'repository_get', owner: 'owner', repo: 'repo' };
const exec = () => ({ agent: { id: 'agent' }, signal: new AbortController().signal });
function setup(config, origin, options = {}) {
  let tool;
  const calls = [];
  const ctx = {
    tools: { register(value) { tool = value; } },
    workingDirectory: { async ensure(agent, signal) { assert.equal(agent.id, 'agent'); signal.throwIfAborted(); return '/session/current'; } },
    subprocess: {
      async resolveExecutable(name) { assert.equal(name, 'git'); return '/usr/bin/git'; },
      spawn(spec) {
        calls.push(spec);
        assert.equal(spec.cwd, '/session/current');
        assert.deepEqual(spec.argv, ['/usr/bin/git', 'remote', 'get-url', 'origin']);
        return {
          done: Promise.resolve({ exitCode: options.exitCode ?? 0 }),
          collected: { stdout: { readFrom() { return { text: origin(), lossy: options.lossy ?? false }; } } },
        };
      },
    },
  };
  apply(ctx, config);
  return { tool, calls };
}
function config(list = instances) { return Config({ providers: { gitea: { instances: list, tokenRef: 'legacy' } } }); }

for (const origin of ['https://git.one.example/owner/repo.git', 'git@git.one.example:owner/repo.git', 'ssh://git@git.one.example:22/owner/repo.git']) {
  test(`selects matching credentials for ${origin}`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(String(url), 'https://api.one.example/api/v1/repos/owner/repo');
      assert.equal(init.headers.get('Authorization'), 'token one');
      return Response.json({ name: 'repo' });
    });
    await setup(config(), () => origin).tool.execute(args, exec());
  });
}

test('selects another instance and the most specific path prefix', async t => {
  const list = [...instances, { origin: 'git@git.two.example:forge/team', baseUrl: 'https://team.example/api/v1', tokenRef: 'team' }];
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push([String(url), init.headers.get('Authorization')]); return Response.json([]); });
  let origin = 'https://git.two.example/forge/owner/repo.git';
  const { tool } = setup(config(list), () => origin);
  await tool.execute(args, exec());
  origin = 'git@git.two.example:forge/team/repo.git';
  await tool.execute(args, exec());
  assert.deepEqual(requests, [
    ['https://git.two.example/forge/api/v1/repos/owner/repo', 'token two'],
    ['https://team.example/api/v1/repos/owner/repo', 'token team'],
  ]);
});

test('scp host-only prefix matches SSH and HTTPS clone URLs', async t => {
  const list = [{ ...instances[0], origin: 'git@git.one.example:' }];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  const { tool } = setup(config(list), () => 'https://git.one.example/owner/repo.git');
  await tool.execute(args, exec());
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('custom SSH ports match only their explicit prefix', async t => {
  const list = [{ ...instances[0], origin: 'ssh://git@git.one.example:2222' }];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  await setup(config(list), () => 'ssh://git@git.one.example:2222/owner/repo.git').tool.execute(args, exec());
  await assert.rejects(setup(config(list), () => 'git@git.one.example:owner/repo.git').tool.execute(args, exec()), /No configured/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('unmatched, ambiguous, unavailable and truncated origins fail before HTTP', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP'); });
  for (const origin of ['https://git.one.example.evil/owner/repo', 'https://git.two.example/forge-other/owner/repo']) {
    await assert.rejects(setup(config(), () => origin).tool.execute(args, exec()), /No configured/);
  }
  await assert.rejects(setup(config([instances[0], { ...instances[0], origin: 'git@git.one.example:' + 'owner' }, { ...instances[0], origin: 'https://git.one.example/owner' }]), () => 'git@git.one.example:owner/repo').tool.execute(args, exec()), /Multiple Gitea/);
  await assert.rejects(setup(config(), () => '', { exitCode: 2 }).tool.execute(args, exec()), /Cannot read repository origin/);
  await assert.rejects(setup(config(), () => 'https://git.one.example/a/b', { lossy: true }).tool.execute(args, exec()), /size limit/);
  await assert.rejects(setup(config(), () => '').tool.execute(args, { signal: new AbortController().signal }), /requires an agent/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('next call reads changed instances while PR preflight and comment share one snapshot', async t => {
  let list = instances;
  const cfg = config();
  cfg.providers.gitea.instances = { get: () => list };
  const { tool, calls } = setup(cfg, () => 'https://git.one.example/owner/repo.git');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push([String(url), init.headers.get('Authorization')]);
    list = [{ ...instances[0], baseUrl: 'https://new.example/api/v1', tokenRef: 'new' }];
    return Response.json({ number: 1 });
  });
  await tool.execute({ ...args, action: 'pull_request_comment', number: 1, body: 'comment' }, exec());
  await tool.execute({ ...args, action: 'repository_list' }, exec());
  assert.deepEqual(requests, [
    ['https://api.one.example/api/v1/repos/owner/repo/pulls/1', 'token one'],
    ['https://api.one.example/api/v1/repos/owner/repo/issues/1/comments', 'token one'],
    ['https://new.example/api/v1/user/repos?page=1&per_page=50', 'token new'],
  ]);
  assert.equal(calls.length, 2);
});

test('multi-instance selection retains session cancellation before reading origin', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP'); });
  const controller = new AbortController();
  controller.abort(new Error('cancelled by session'));
  const { tool, calls } = setup(config(), () => 'https://git.one.example/a/b');
  await assert.rejects(tool.execute(args, { agent: { id: 'agent' }, signal: controller.signal }), /cancelled by session/);
  assert.equal(calls.length, 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('empty instance list retains single-instance mode without workspace services', async t => {
  let tool;
  apply({ tools: { register(value) { tool = value; } } }, config([]));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://gitea.com/api/v1/repos/owner/repo');
    assert.equal(init.headers.get('Authorization'), 'token legacy');
    return Response.json({});
  });
  await tool.execute(args, { signal: new AbortController().signal });
});
