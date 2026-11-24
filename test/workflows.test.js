import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from '../lib/index.js';

function tool() {
  let registered;
  apply({ tools: { register(value) { registered = value; } } }, Config({
    providers: {
      github: { baseUrl: 'https://github.example/api/v3/', tokenRef: 'github-token' },
      gitea: { baseUrl: 'https://git.example/git/api/v1/', tokenRef: 'test-token' },
    },
    maxPageSize: 20,
  }));
  return registered;
}
const exec = () => ({ signal: new AbortController().signal });

for (const provider of ['github', 'gitea']) {
  const base = { provider, owner: 'some owner', repo: 'my/repo' };
  const apiRoot = provider === 'github' ? 'https://github.example/api/v3' : 'https://git.example/git/api/v1';
  const pageSizeKey = provider === 'github' ? 'per_page' : 'limit';

  test(`${provider} workflow run list uses filters, pagination and preserves run identifiers`, async t => {
    const data = { total_count: 1, workflow_runs: [{ id: 801, run_number: 42, status: 'completed', conclusion: 'failure', head_sha: 'abc' }] };
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(url.origin + url.pathname, `${apiRoot}/repos/some%20owner/my%2Frepo/actions/runs`);
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        page: '2', [pageSizeKey]: '10', branch: 'feature/a', event: 'push', status: 'failure', actor: 'alice', head_sha: 'abc',
      });
      assert.equal(init.method, 'GET');
      assert.equal(init.headers.get('Authorization'), provider === 'github' ? 'Bearer github-token' : 'token test-token');
      assert.equal(init.headers.get('Accept'), provider === 'github' ? 'application/vnd.github+json' : 'application/json');
      assert.equal(init.body, undefined);
      return Response.json(data);
    });
    const registered = tool();
    const args = { ...base, action: 'workflow_run_list', page: 2, per_page: 10, branch: 'feature/a', event: 'push', status: 'failure', actor: 'alice', head_sha: 'abc' };
    assert.deepEqual(await registered.execute(args, exec()), { provider, action: args.action, data });
    assert.equal(registered.presentCall(args).kind, 'read');
  });

  test(`${provider} run list defaults pagination and omits unset filters`, async t => {
    const data = { total_count: 0, workflow_runs: [] };
    t.mock.method(globalThis, 'fetch', async url => {
      assert.deepEqual(Object.fromEntries(url.searchParams), { page: '1', [pageSizeKey]: '20' });
      return Response.json(data);
    });
    assert.deepEqual((await tool().execute({ ...base, action: 'workflow_run_list' }, exec())).data, data);
  });

  test(`${provider} run detail uses API id and preserves timing and outcome`, async t => {
    const data = { id: 801, run_number: 42, status: 'completed', conclusion: 'success', run_started_at: '2026-10-19T00:00:00Z' };
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(String(url), `${apiRoot}/repos/some%20owner/my%2Frepo/actions/runs/801`);
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      return Response.json(data);
    });
    const registered = tool();
    const args = { ...base, action: 'workflow_run_get', run_id: 801 };
    assert.deepEqual((await registered.execute(args, exec())).data, data);
    assert.equal(registered.presentCall(args).kind, 'read');
  });

  for (const explicitPage of [false, true]) {
    test(`${provider} jobs preserve steps and runners with ${explicitPage ? 'explicit' : 'default'} pagination`, async t => {
      const data = { total_count: 1, jobs: [{ id: 900, run_id: 801, run_attempt: 2, status: 'completed', conclusion: 'failure', runner_id: 4, runner_name: 'linux', steps: [{ name: 'Build', status: 'completed', conclusion: 'failure', number: 1 }] }] };
      const filters = provider === 'gitea' ? { status: 'failure' } : {};
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(url.origin + url.pathname, `${apiRoot}/repos/some%20owner/my%2Frepo/actions/runs/801/jobs`);
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          page: explicitPage ? '3' : '1', [pageSizeKey]: explicitPage ? '5' : '20', ...filters,
        });
        assert.equal(init.method, 'GET');
        assert.equal(init.body, undefined);
        return Response.json(data);
      });
      const registered = tool();
      const args = { ...base, action: 'workflow_job_list', run_id: 801, ...filters, ...(explicitPage ? { page: 3, per_page: 5 } : {}) };
      assert.deepEqual((await registered.execute(args, exec())).data, data);
      assert.equal(registered.presentCall(args).kind, 'read');
    });
  }

  test(`${provider} invalid workflow requests fail before making an API request`, async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
    const registered = tool();
    for (const action of ['workflow_run_get', 'workflow_job_list']) {
      for (const run_id of [undefined, 0, -1, 1.5]) {
        const args = { ...base, action };
        if (run_id !== undefined) args.run_id = run_id;
        await assert.rejects(registered.execute(args, exec()), /run_id/);
      }
    }
    if (provider === 'github') {
      await assert.rejects(registered.execute({ ...base, action: 'workflow_job_list', run_id: 801, status: 'failure' }, exec()), /does not support status filtering/);
    }
    await assert.rejects(registered.execute({ ...base, action: 'workflow_run_list', per_page: 21 }, exec()), /per_page/);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  for (const status of [403, 404]) {
    for (const action of ['workflow_run_list', 'workflow_run_get', 'workflow_job_list']) {
      test(`${provider} ${action} HTTP ${status} remains an error`, async t => {
        t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Access or endpoint unavailable' }, { status }));
        await assert.rejects(tool().execute({ ...base, action, run_id: 801 }, exec()), new RegExp(`${provider} ${action} failed with HTTP ${status}: Access or endpoint unavailable`));
      });
    }
  }

  test(`${provider} workflow requests retain session cancellation`, async t => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by session'));
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      init.signal.throwIfAborted();
      throw new Error('expected an aborted signal');
    });
    await assert.rejects(tool().execute({ ...base, action: 'workflow_run_list' }, { signal: controller.signal }), /cancelled by session/);
  });
}
