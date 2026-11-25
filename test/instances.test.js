import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { apply, Config, inject } from '../lib/index.js';

const require = createRequire(import.meta.url);
const { Context } = createRequire(require.resolve('@deepseek-ai/dsh-tools'))('@deepseek-ai/cordis');

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
    get(name) { return this[name]; },
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

test('Cordis activates with only tools and resolves workspace services when needed', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  let tool;
  ctx.provide('tools', { register(value) { tool = value; } });
  const cfg = config([]);
  const fiber = ctx.plugin({ inject, apply }, cfg);
  await fiber.await();
  assert.ok(tool, 'the plugin must register its tool without workspace services');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await tool.execute(args, exec());
  cfg.providers.gitea.instances = { get: () => instances };
  await assert.rejects(tool.execute(args, exec()), /requires an agent, workingDirectory and subprocess/);
  ctx.provide('workingDirectory', { async ensure() { return '/session/current'; } });
  await assert.rejects(tool.execute(args, exec()), /requires an agent, workingDirectory and subprocess/);
  ctx.provide('subprocess', {
    async resolveExecutable() { return '/usr/bin/git'; },
    spawn() {
      return {
        done: Promise.resolve({ exitCode: 0 }),
        collected: { stdout: { readFrom() { return { text: 'git@git.one.example:owner/repo.git', lossy: false }; } } },
      };
    },
  });
  await tool.execute(args, exec());
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(String(fetchMock.mock.calls[1].arguments[0]), 'https://api.one.example/api/v1/repos/owner/repo');
});

test('GitHub calls ignore configured Gitea instances and need no workspace services', async t => {
  const cfg = config();
  cfg.providers.github.tokenRef = { get: () => 'github-token' };
  let tool;
  apply({
    tools: { register(value) { tool = value; } },
    get() { throw new Error('GitHub must not look up workspace services'); },
  }, cfg);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push([String(url), init.headers.get('Authorization')]);
    return Response.json({});
  });
  for (const action of ['repository_get', 'repository_list', 'workflow_run_list']) {
    const result = await tool.execute({ ...args, provider: 'github', action }, { signal: new AbortController().signal });
    assert.equal(result.provider, 'github');
  }
  assert.deepEqual(requests, [
    ['https://api.github.com/repos/owner/repo', 'Bearer github-token'],
    ['https://api.github.com/user/repos?page=1&per_page=50', 'Bearer github-token'],
    ['https://api.github.com/repos/owner/repo/actions/runs?page=1&per_page=50', 'Bearer github-token'],
  ]);
});

test('Gitea mismatch on a GitHub origin identifies the selected provider without blocking GitHub', async t => {
  const cfg = config();
  cfg.providers.github.tokenRef = { get: () => 'github-token' };
  // The diagnostic should use the normalized origin without URL credentials.
  const { tool, calls } = setup(cfg, () => 'https://user:secret@github.com/owner/repo.git');
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://api.github.com/repos/owner/repo');
    assert.equal(init.headers.get('Authorization'), 'Bearer github-token');
    return Response.json({ name: 'repo' });
  });
  await assert.rejects(tool.execute(args, exec()), error => {
    assert.match(error.message, /provider=gitea: No configured Gitea instance/);
    assert.match(error.message, /"github.com\/owner\/repo"/);
    assert.match(error.message, /provider="github"/);
    assert.ok(!error.message.includes('secret'));
    return true;
  });
  assert.equal(fetchMock.mock.callCount(), 0);
  await tool.execute({ ...args, provider: 'github' }, exec());
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(calls.length, 1, 'only the Gitea call reads origin');
});

for (const origin of ['https://github.com/owner/repo.git', 'git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo.git', 'git://github.com/owner/repo.git']) {
  test(`automatically detects GitHub without matching Gitea instances: ${origin}`, async t => {
    const cfg = config();
    cfg.providers.github.tokenRef = { get: () => 'github-token' };
    const { tool, calls } = setup(cfg, () => origin);
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(String(url), 'https://api.github.com/repos/owner/repo');
      assert.equal(init.headers.get('Authorization'), 'Bearer github-token');
      return Response.json({});
    });
    assert.equal((await tool.execute({ action: args.action, owner: args.owner, repo: args.repo }, exec())).provider, 'github');
    assert.equal(calls.length, 1);
  });
}

test('automatic detection selects Gitea credentials and rereads origin on the next call', async t => {
  const cfg = config();
  cfg.providers.github.tokenRef = { get: () => 'github-token' };
  let origin = 'git@git.two.example:forge/owner/repo.git';
  const { tool, calls } = setup(cfg, () => origin);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push([String(url), init.headers.get('Authorization')]);
    return Response.json([]);
  });
  const input = { action: 'repository_list' };
  assert.equal((await tool.execute(input, exec())).provider, 'gitea');
  origin = 'https://github.com/owner/repo.git';
  assert.equal((await tool.execute(input, exec())).provider, 'github');
  assert.deepEqual(requests, [
    ['https://git.two.example/forge/api/v1/user/repos?page=1&per_page=50', 'token two'],
    ['https://api.github.com/user/repos?page=1&per_page=50', 'Bearer github-token'],
  ]);
  assert.equal(calls.length, 2);
});

test('automatic detection fails closed for unknown, ambiguous and unavailable origins', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP'); });
  const input = { action: args.action, owner: args.owner, repo: args.repo };
  for (const origin of ['https://github.com.evil/owner/repo', 'https://unknown.example/owner/repo']) {
    await assert.rejects(setup(config(), () => origin).tool.execute(input, exec()), /Automatic provider detection: No configured/);
    await assert.rejects(setup(config([]), () => origin).tool.execute(input, exec()), /Cannot detect provider/);
  }
  await assert.rejects(setup(config([instances[0], instances[0]]), () => 'git@git.one.example:owner/repo').tool.execute(input, exec()), /Multiple Gitea/);
  await assert.rejects(setup(config(), () => '', { exitCode: 2 }).tool.execute(input, exec()), /Cannot read repository origin/);
  await assert.rejects(setup(config(), () => '').tool.execute(input, { signal: new AbortController().signal }), /requires an agent/);
  await assert.rejects(setup(config(), () => '').tool.execute({ ...input, provider: 'other' }, exec()), /provider/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('automatically detected provider applies platform-specific validation before HTTP', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP'); });
  const { tool } = setup(config(), () => 'git@github.com:owner/repo.git');
  await assert.rejects(tool.execute({ owner: args.owner, repo: args.repo, action: 'workflow_job_list', run_id: 1, status: 'queued' }, exec()), /GitHub workflow_job_list does not support status/);
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
