import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from '../lib/index.js';

function tool() {
  let registered;
  apply({ tools: { register(value) { registered = value; } } }, Config({
    providers: { gitea: { baseUrl: 'https://git.example/git/api/v1/', tokenRef: 'test-token' } },
    maxPageSize: 20,
  }));
  return registered;
}
const base = { provider: 'gitea', owner: 'some owner', repo: 'my/repo' };
const exec = () => ({ signal: new AbortController().signal });

test('workflow run list uses Gitea filters, limit pagination and preserves run identifiers', async t => {
  const data = { total_count: 1, workflow_runs: [{ id: 801, run_number: 42, status: 'completed', conclusion: 'failure', head_sha: 'abc' }] };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.pathname, '/git/api/v1/repos/some%20owner/my%2Frepo/actions/runs');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      page: '2', limit: '10', branch: 'feature/a', event: 'push', status: 'failure', actor: 'alice', head_sha: 'abc',
    });
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.get('Authorization'), 'token test-token');
    assert.equal(init.body, undefined);
    return Response.json(data);
  });
  const registered = tool();
  const args = { ...base, action: 'workflow_run_list', page: 2, per_page: 10, branch: 'feature/a', event: 'push', status: 'failure', actor: 'alice', head_sha: 'abc' };
  assert.deepEqual(await registered.execute(args, exec()), { provider: 'gitea', action: args.action, data });
  assert.equal(registered.presentCall(args).kind, 'read');
});

test('run detail uses API id and preserves timing and outcome', async t => {
  const data = { id: 801, run_number: 42, status: 'completed', conclusion: 'success', started_at: '2026-10-19T00:00:00Z' };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://git.example/git/api/v1/repos/some%20owner/my%2Frepo/actions/runs/801');
    assert.equal(init.method, 'GET');
    return Response.json(data);
  });
  assert.deepEqual((await tool().execute({ ...base, action: 'workflow_run_get', run_id: 801 }, exec())).data, data);
});

test('run jobs preserve steps and runner information with default page size', async t => {
  const data = { total_count: 1, jobs: [{ id: 900, run_id: 801, status: 'in_progress', runner_id: 4, runner_name: 'linux', steps: [{ name: 'Build', status: 'in_progress' }] }] };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.pathname, '/git/api/v1/repos/some%20owner/my%2Frepo/actions/runs/801/jobs');
    assert.deepEqual(Object.fromEntries(url.searchParams), { page: '1', limit: '20', status: 'in_progress' });
    assert.equal(init.method, 'GET');
    return Response.json(data);
  });
  assert.deepEqual((await tool().execute({ ...base, action: 'workflow_job_list', run_id: 801, status: 'in_progress' }, exec())).data, data);
});

test('invalid workflow requests fail before making an API request', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
  const registered = tool();
  for (const action of ['workflow_run_get', 'workflow_job_list']) {
    for (const run_id of [undefined, 0, -1, 1.5]) {
      const args = { ...base, action };
      if (run_id !== undefined) args.run_id = run_id;
      await assert.rejects(registered.execute(args, exec()), /run_id/);
    }
  }
  await assert.rejects(registered.execute({ ...base, action: 'workflow_run_list', provider: 'github' }, exec()), /Gitea only/);
  await assert.rejects(registered.execute({ ...base, action: 'workflow_run_list', per_page: 21 }, exec()), /per_page/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

for (const status of [403, 404]) {
  test(`workflow HTTP ${status} remains an error, not an empty run list`, async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Access or endpoint unavailable' }, { status }));
    await assert.rejects(tool().execute({ ...base, action: 'workflow_run_list' }, exec()), new RegExp(`gitea workflow_run_list failed with HTTP ${status}: Access or endpoint unavailable`));
  });
}

test('workflow requests retain session cancellation', async t => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled by session'));
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    init.signal.throwIfAborted();
    throw new Error('expected an aborted signal');
  });
  await assert.rejects(tool().execute({ ...base, action: 'workflow_run_list' }, { signal: controller.signal }), /cancelled by session/);
});
