import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from '../lib/index.js';

const providers = ['gitea', 'github'];
const actions = [
  'pull_request_list', 'pull_request_get', 'pull_request_files', 'pull_request_diff',
  'pull_request_create', 'pull_request_update', 'pull_request_close', 'pull_request_reopen',
  'pull_request_comment_list', 'pull_request_comment', 'pull_request_merge',
];
const writes = new Set([
  'pull_request_create', 'pull_request_update', 'pull_request_close',
  'pull_request_reopen', 'pull_request_comment', 'pull_request_merge',
]);
const base = { owner: 'some owner', repo: 'my/repo' };
const repoPath = '/git/api/v1/repos/some%20owner/my%2Frepo';
const exec = () => ({ signal: new AbortController().signal });

function tool(config = Config({
  providers: {
    gitea: { baseUrl: 'https://gitea.example/git/api/v1/', tokenRef: 'gitea-token' },
    github: { baseUrl: 'https://github.example/git/api/v1/', tokenRef: 'github-token' },
  },
  maxPageSize: 20,
})) {
  let registered;
  apply({ tools: { register(value) { registered = value; } } }, config);
  return registered;
}

function checkRequest(url, init, provider, path, method = 'GET') {
  const parsed = new URL(url);
  assert.equal(parsed.origin, `https://${provider}.example`);
  assert.equal(parsed.pathname, `${repoPath}${path}`);
  assert.equal(init.method, method);
  assert.equal(init.headers.get('Authorization'), provider === 'github' ? 'Bearer github-token' : 'token gitea-token');
  if (method === 'GET') assert.equal(init.body, undefined);
  return parsed;
}

const rawPull = {
  id: 8001, number: 42, title: 'Keep provider fields', body: '',
  head: { sha: 'head-sha', ref: 'feature/a', repo: { id: 2 } },
  base: { sha: 'base-sha', ref: 'main' }, mergeable: false, merged: false,
  user: { login: 'alice', id: 17 }, provider_extra: { preserved: true },
};

test('PR schema exposes all actions and branch, merge and expected SHA fields', () => {
  const registered = tool();
  for (const action of actions) assert.ok(registered.parameters.properties.action.enum.includes(action), action);
  for (const field of ['head', 'base', 'head_sha']) assert.equal(registered.parameters.properties[field].type, 'string');
  assert.deepEqual([...registered.parameters.properties.merge_method.enum].sort(), [
    'merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only',
  ].sort());
});

test('PR presentation marks exactly the six mutations as writes', () => {
  const registered = tool();
  for (const provider of providers) {
    for (const action of actions) {
      assert.equal(registered.presentCall({ ...base, provider, action, number: 42 }).kind,
        writes.has(action) ? 'other' : 'read', `${provider} ${action}`);
    }
  }
});

for (const provider of providers) {
  test(`${provider} PR list encodes paths, maps base and pagination, and preserves raw JSON`, async t => {
    const data = [rawPull];
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      calls++;
      const parsed = checkRequest(url, init, provider, '/pulls');
      assert.deepEqual(Object.fromEntries(parsed.searchParams), {
        page: '2', [provider === 'gitea' ? 'limit' : 'per_page']: '10',
        state: 'all', [provider === 'gitea' ? 'base_branch' : 'base']: 'release/next',
      });
      return Response.json(data);
    });
    const args = { ...base, provider, action: 'pull_request_list', page: 2, per_page: 10, state: 'all', base: 'release/next' };
    assert.deepEqual(await tool().execute(args, exec()), { provider, action: args.action, data });
    assert.equal(calls, 1, 'one requested page, no automatic pagination');
  });

  test(`${provider} PR detail preserves head/base, mergeability and provider metadata`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const parsed = checkRequest(url, init, provider, '/pulls/42');
      assert.equal(parsed.search, '');
      return Response.json(rawPull);
    });
    assert.deepEqual((await tool().execute({ ...base, provider, action: 'pull_request_get', number: 42 }, exec())).data, rawPull);
  });

  test(`${provider} PR files preserve full entries and use default page size`, async t => {
    const data = [{ filename: 'src/a.js', status: 'renamed', previous_filename: 'src/b.js', patch: '@@ -1 +1 @@\n-old\n+new', additions: 1, provider_extra: 123 }];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const parsed = checkRequest(url, init, provider, '/pulls/42/files');
      assert.deepEqual(Object.fromEntries(parsed.searchParams), {
        page: '1', [provider === 'gitea' ? 'limit' : 'per_page']: '20',
      });
      return Response.json(data);
    });
    assert.deepEqual((await tool().execute({ ...base, provider, action: 'pull_request_files', number: 42 }, exec())).data, data);
  });

  test(`${provider} PR files map an explicitly requested page`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const parsed = checkRequest(url, init, provider, '/pulls/42/files');
      assert.deepEqual(Object.fromEntries(parsed.searchParams), {
        page: '3', [provider === 'gitea' ? 'limit' : 'per_page']: '7',
      });
      return Response.json([]);
    });
    await tool().execute({ ...base, provider, action: 'pull_request_files', number: 42, page: 3, per_page: 7 }, exec());
  });

  test(`${provider} diff returns exact text including JSON-looking strings; Accept stays scoped`, async t => {
    const registered = tool();
    let jsonAccept;
    let expectedDiff;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      if (expectedDiff !== undefined) {
        const parsed = checkRequest(url, init, provider, provider === 'gitea' ? '/pulls/42.diff' : '/pulls/42');
        assert.equal(parsed.search, '');
        assert.equal(init.headers.get('Accept'), provider === 'github' ? 'application/vnd.github.diff' : jsonAccept);
        return new Response(expectedDiff, { headers: { 'Content-Type': 'text/plain' } });
      }
      checkRequest(url, init, provider, '/pulls/42');
      if (jsonAccept === undefined) {
        jsonAccept = init.headers.get('Accept');
        assert.ok(jsonAccept);
        assert.notEqual(jsonAccept, 'application/vnd.github.diff');
      } else assert.equal(init.headers.get('Accept'), jsonAccept);
      return Response.json(rawPull);
    });
    await registered.execute({ ...base, provider, action: 'pull_request_get', number: 42 }, exec());
    for (const diff of ['diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n', '{"looks":"like JSON"}', 'null', '']) {
      expectedDiff = diff;
      assert.equal((await registered.execute({ ...base, provider, action: 'pull_request_diff', number: 42 }, exec())).data, diff);
    }
    expectedDiff = undefined;
    await registered.execute({ ...base, provider, action: 'pull_request_get', number: 42 }, exec());
  });

  for (const entry of [
    { action: 'pull_request_create', method: 'POST', path: '/pulls', fields: { title: 'New PR', head: 'alice:feature/a', base: 'main', body: '' }, body: { title: 'New PR', head: 'alice:feature/a', base: 'main', body: '' } },
    { action: 'pull_request_create', method: 'POST', path: '/pulls', fields: { title: 'New PR', head: 'feature/a', base: 'main' }, body: { title: 'New PR', head: 'feature/a', base: 'main' } },
    { action: 'pull_request_update', method: 'PATCH', path: '/pulls/42', fields: { title: 'Updated', body: '', base: 'release/next' }, body: { title: 'Updated', body: '', base: 'release/next' } },
    { action: 'pull_request_update', method: 'PATCH', path: '/pulls/42', fields: { body: '' }, body: { body: '' } },
    { action: 'pull_request_update', method: 'PATCH', path: '/pulls/42', fields: { base: 'release/next' }, body: { base: 'release/next' } },
    { action: 'pull_request_close', method: 'PATCH', path: '/pulls/42', fields: {}, body: { state: 'closed' } },
    { action: 'pull_request_reopen', method: 'PATCH', path: '/pulls/42', fields: {}, body: { state: 'open' } },
  ]) {
    test(`${provider} ${entry.action} sends ${JSON.stringify(entry.body)}`, async t => {
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        checkRequest(url, init, provider, entry.path, entry.method);
        assert.deepEqual(JSON.parse(init.body), entry.body);
        return Response.json(rawPull);
      });
      assert.deepEqual((await tool().execute({ ...base, provider, number: 42, action: entry.action, ...entry.fields }, exec())).data, rawPull);
    });
  }

  for (const action of ['pull_request_comment_list', 'pull_request_comment']) {
    test(`${provider} ${action} checks PR before accessing Issue comments`, async t => {
      const calls = [];
      const data = action === 'pull_request_comment_list'
        ? [{ id: 123, body: 'Discussion', user: { login: 'alice', id: 9 }, html_url: 'https://example/comment', provider_extra: true }]
        : { id: 124, body: 'Discussion', user: { login: 'alice', id: 9 }, provider_extra: true };
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        calls.push({ path: new URL(url).pathname, signal: init.signal });
        if (calls.length === 1) {
          checkRequest(url, init, provider, '/pulls/42');
          return Response.json(rawPull);
        }
        const parsed = checkRequest(url, init, provider, '/issues/42/comments', action === 'pull_request_comment' ? 'POST' : 'GET');
        if (action === 'pull_request_comment') assert.deepEqual(JSON.parse(init.body), { body: 'Discussion' });
        else assert.deepEqual(Object.fromEntries(parsed.searchParams), {
          page: '2', [provider === 'gitea' ? 'limit' : 'per_page']: '7',
        });
        assert.equal(init.signal.aborted, false);
        return Response.json(data);
      });
      const args = { ...base, provider, action, number: 42, ...(action === 'pull_request_comment' ? { body: 'Discussion' } : { page: 2, per_page: 7 }) };
      assert.deepEqual(await tool().execute(args, exec()), { provider, action, data });
      assert.deepEqual(calls.map(call => call.path), [`${repoPath}/pulls/42`, `${repoPath}/issues/42/comments`]);
    });

    test(`${provider} ${action} does not access comments when PR guard fails`, async t => {
      const fetchMock = t.mock.method(globalThis, 'fetch', async (url, init) => {
        checkRequest(url, init, provider, '/pulls/42');
        return Response.json({ message: 'Not a pull request' }, { status: 404 });
      });
      await assert.rejects(tool().execute({ ...base, provider, action, number: 42, body: 'Discussion' }, exec()), /404.*Not a pull request/);
      assert.equal(fetchMock.mock.callCount(), 1);
    });

    test(`${provider} ${action} propagates cancellation after the PR guard`, async t => {
      const controller = new AbortController();
      let calls = 0;
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        calls++;
        if (calls === 1) {
          checkRequest(url, init, provider, '/pulls/42');
          controller.abort(new Error('cancelled after PR lookup'));
          return Response.json(rawPull);
        }
        assert.equal(init.signal.aborted, true);
        init.signal.throwIfAborted();
      });
      await assert.rejects(tool().execute({ ...base, provider, action, number: 42, body: 'Discussion' }, { signal: controller.signal }), /cancelled after PR lookup/);
      assert.ok(calls <= 2, 'cancellation must never trigger a retry');
    });
  }

  const methods = provider === 'gitea' ? ['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'] : ['merge', 'rebase', 'squash'];
  for (const merge_method of methods) {
    test(`${provider} merge ${merge_method} maps expected SHA and branch retention`, async t => {
      const data = { sha: 'result-sha', merged: true, message: 'Merged', provider_extra: { intact: true } };
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        checkRequest(url, init, provider, '/pulls/42/merge', provider === 'gitea' ? 'POST' : 'PUT');
        assert.deepEqual(JSON.parse(init.body), provider === 'gitea'
          ? { Do: merge_method, head_commit_id: 'expected-sha', delete_branch_after_merge: false }
          : { merge_method, sha: 'expected-sha' });
        return Response.json(data);
      });
      assert.deepEqual((await tool().execute({ ...base, provider, action: 'pull_request_merge', number: 42, merge_method, head_sha: 'expected-sha' }, exec())).data, data);
    });
  }

  test(`${provider} merge without expected SHA omits guard field and preserves empty response as null`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      checkRequest(url, init, provider, '/pulls/42/merge', provider === 'gitea' ? 'POST' : 'PUT');
      assert.deepEqual(JSON.parse(init.body), provider === 'gitea'
        ? { Do: 'merge', delete_branch_after_merge: false } : { merge_method: 'merge' });
      return new Response(null, { status: 204 });
    });
    assert.equal((await tool().execute({ ...base, provider, action: 'pull_request_merge', number: 42, merge_method: 'merge' }, exec())).data, null);
  });

  test(`${provider} invalid PR arguments fail before HTTP`, async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
    const registered = tool();
    const invalid = [];
    for (const action of actions.filter(action => !['pull_request_list', 'pull_request_create'].includes(action))) {
      for (const number of [undefined, 0, -1, 1.5]) {
        invalid.push([{ action, number, body: 'Comment', merge_method: 'merge' }, /number/]);
      }
    }
    for (const field of ['owner', 'repo']) invalid.push([{ action: 'pull_request_list', [field]: '' }, new RegExp(field)]);
    for (const field of ['title', 'head', 'base']) {
      for (const value of [undefined, '', '   ']) {
        invalid.push([{ action: 'pull_request_create', title: 'Title', head: 'feature', base: 'main', [field]: value }, new RegExp(field)]);
      }
    }
    invalid.push([{ action: 'pull_request_list', state: 'invalid' }, /state/]);
    invalid.push([{ action: 'pull_request_update', number: 42 }, /title|body|base|field/i]);
    for (const field of ['title', 'base']) invalid.push([{ action: 'pull_request_update', number: 42, [field]: '   ' }, new RegExp(field)]);
    invalid.push([{ action: 'pull_request_merge', number: 42, merge_method: 'merge', head_sha: '' }, /head_sha/]);
    for (const body of [undefined, '', '   ']) invalid.push([{ action: 'pull_request_comment', number: 42, body }, /body/]);
    for (const merge_method of [undefined, '', 'invalid']) invalid.push([{ action: 'pull_request_merge', number: 42, merge_method }, /merge_method/]);
    for (const action of ['pull_request_list', 'pull_request_files', 'pull_request_comment_list']) {
      for (const page of [0, -1, 1.5]) invalid.push([{ action, number: 42, page }, /page/]);
      for (const per_page of [0, -1, 1.5, 21]) invalid.push([{ action, number: 42, per_page }, /per_page/]);
    }
    for (const [args, error] of invalid) {
      const input = Object.fromEntries(Object.entries({ ...base, provider, ...args }).filter(([, value]) => value !== undefined));
      await assert.rejects(registered.execute(input, exec()), error, JSON.stringify(args));
    }
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  for (const status of [403, 404, 405, 409]) {
    test(`${provider} merge HTTP ${status} keeps server error visible`, async t => {
      const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Permission, protection or stale SHA failure' }, { status }));
      await assert.rejects(tool().execute({ ...base, provider, action: 'pull_request_merge', number: 42, merge_method: 'merge', head_sha: 'stale-sha' }, exec()), new RegExp(`${status}.*Permission, protection or stale SHA failure`));
      assert.equal(fetchMock.mock.callCount(), 1);
    });
  }

  test(`${provider} PR diff preserves HTTP failures instead of returning error text as success`, async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Diff unavailable' }, { status: 404 }));
    await assert.rejects(tool().execute({ ...base, provider, action: 'pull_request_diff', number: 42 }, exec()), /404.*Diff unavailable/);
  });

  test(`${provider} PR requests retain session cancellation`, async t => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by session'));
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      init.signal.throwIfAborted();
      throw new Error('expected an aborted signal');
    });
    await assert.rejects(tool().execute({ ...base, provider, action: 'pull_request_get', number: 42 }, { signal: controller.signal }), /cancelled by session/);
  });
}

for (const provider of providers) {
  test(`${provider} comment guard and comment request share one volatile configuration snapshot`, async t => {
    const values = { baseUrl: 'https://old.example/api', tokenRef: 'old-token', requestTimeoutMs: 3000, maxPageSize: 20 };
    const live = key => ({ get: () => values[key] });
    const registered = tool({
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
      const parsed = new URL(url);
      requests.push({ endpoint: `${parsed.origin}${parsed.pathname}`, query: Object.fromEntries(parsed.searchParams), auth: init.headers.get('Authorization') });
      if (requests.length === 1) {
        Object.assign(values, { baseUrl: 'https://new.example/api', tokenRef: 'new-token', requestTimeoutMs: 6000, maxPageSize: 5 });
        return Response.json(rawPull);
      }
      return Response.json([]);
    });
    await registered.execute({ ...base, provider, action: 'pull_request_comment_list', number: 42 }, exec());
    const auth = provider === 'github' ? 'Bearer old-token' : 'token old-token';
    assert.deepEqual(requests, [
      { endpoint: 'https://old.example/api/repos/some%20owner/my%2Frepo/pulls/42', query: {}, auth },
      { endpoint: 'https://old.example/api/repos/some%20owner/my%2Frepo/issues/42/comments', query: { page: '1', [provider === 'gitea' ? 'limit' : 'per_page']: '20' }, auth },
    ]);
    assert.deepEqual(timeouts, [3000, 3000]);
  });
}

test('GitHub rejects unsupported merge methods before HTTP', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
  for (const merge_method of ['rebase-merge', 'fast-forward-only']) {
    await assert.rejects(tool().execute({ ...base, provider: 'github', action: 'pull_request_merge', number: 42, merge_method }, exec()), /merge_method|support|GitHub/i);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('GitHub HTTP 200 merged=false reports the merge failure and server message', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ sha: null, merged: false, message: 'Head branch was modified. Review and try again.' }));
  await assert.rejects(tool().execute({ ...base, provider: 'github', action: 'pull_request_merge', number: 42, merge_method: 'squash' }, exec()), /Head branch was modified\. Review and try again\./);
  assert.equal(fetchMock.mock.callCount(), 1);
});
