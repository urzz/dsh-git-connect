import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Run the shipped module and its page callbacks without a browser or real credentials.
const source = await readFile(new URL('../lib/client/index.js', import.meta.url), 'utf8');
function mountPage(instances) {
  let state;
  let effect;
  let listener;
  let Page;
  let plugin;
  let snapshot = {
    status: 'ready', writable: true, revision: 1,
    value: {
      providers: {
        github: { baseUrl: 'https://api.github.com', tokenRef: 'test-github' },
        gitea: { baseUrl: 'https://gitea.example/api/v1', tokenRef: 'test-gitea', ...(instances === undefined ? {} : { instances }) },
      },
      requestTimeoutMs: 30000, maxPageSize: 50,
    },
  };
  let result = true;
  let duringSave;
  const writes = [];
  const checks = [];
  let checkResponse = { ok: true, value: { login: 'test-user' } };
  let checkTransport;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      state ??= initial;
      return [state, update => { state = typeof update === 'function' ? update(state) : update; }];
    },
    useEffect(callback) { effect ??= callback; },
  };
  const form = {
    getSnapshot: () => snapshot,
    subscribe(callback) { listener = callback; return () => { listener = undefined; }; },
    async mutate(operations, revision) {
      writes.push({ operations, revision });
      duringSave?.();
      if (result instanceof Error) throw result;
      if (!result) return false;
      assert.equal(revision, snapshot.revision, 'writes must use the current accepted revision');
      const value = structuredClone(snapshot.value);
      for (const { path, value: replacement } of operations) {
        let parent = value;
        for (const key of path.slice(0, -1)) parent = parent[key];
        parent[path.at(-1)] = replacement;
      }
      snapshot = { ...snapshot, value, revision: revision + 1 };
      // The real ConfigForm publishes before mutate resolves.
      listener?.();
      return true;
    },
  };
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(module) { plugin = module.factory(() => React); } } },
    console: { error() {} },
  });
  plugin.apply({
    effect(callback) { callback(); },
    locale: { register() {}, bind: () => key => key },
    configForms: { get: () => form },
    connection: { rpc: { async call(prefix, method, input) {
      checks.push({ prefix, method, input });
      return checkTransport ? checkTransport() : checkResponse;
    } } },
    slots: {
      inject(name, callback) { callback(); },
      register(options, component) { Page = component; },
    },
  });
  function render(node = Page()) {
    if (node == null || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return render(node.type(node.props));
    return { ...node, children: node.children.flat().map(child => render(child)) };
  }
  function nodes(type, node = render()) {
    if (node == null || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...node.children.flatMap(child => nodes(type, child))];
  }
  Page();
  effect();
  return {
    nodes, writes, checks,
    test: (index = 0) => nodes('button').filter(node => node.children.includes('test'))[index].props.onClick(),
    setCheckResponse(value) { checkResponse = value; },
    setCheckTransport(value) { checkTransport = value; },
    saveButton: () => nodes('button').find(node => node.props.className === 'dsh-git-save'),
    save: () => nodes('button').find(node => node.props.className === 'dsh-git-save').props.onClick(),
    click(label, index = 0) { nodes('button').filter(node => node.children.includes(label))[index].props.onClick(); },
    edit(index, value) { nodes('input')[index].props.onChange({ target: { value } }); },
    setResult(value) { result = value; },
    onSave(callback) { duringSave = callback; },
    publish(value) { snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }; listener?.(); },
    get snapshot() { return snapshot; },
  };
}

test('saving unchanged configuration leaves all fields visible and permits another save', async () => {
  const page = mountPage();
  assert.equal(page.nodes('input').length, 6);
  page.onSave(() => assert.equal(page.saveButton().props.disabled, true));
  await page.save();
  assert.equal(page.nodes('input').length, 6, 'successful save must not show unavailable');
  assert.equal(page.saveButton().props.disabled, false);
  assert.ok(page.nodes('span').some(node => node.children.includes('saved')));
  await page.save();
  assert.deepEqual(page.writes.map(write => write.revision), [1, 2]);
});

test('editing after save retains other provider fields and uses the new revision', async () => {
  const page = mountPage();
  page.edit(5, '75');
  await page.save();
  assert.equal(page.nodes('input')[5]?.props.value, 75);
  page.edit(4, '45000');
  await page.save();
  assert.equal(page.snapshot.value.maxPageSize, 75);
  assert.equal(page.snapshot.value.requestTimeoutMs, 45000);
  assert.equal(page.snapshot.value.providers.github.tokenRef, 'test-github');
  assert.deepEqual(page.writes.map(write => write.revision), [1, 2]);
});

test('accepted snapshots refresh a clean form and do not overwrite a local draft', () => {
  const page = mountPage();
  page.publish({ ...page.snapshot.value, maxPageSize: 60 });
  assert.equal(page.nodes('input')[5].props.value, 60);
  page.edit(5, '70');
  page.publish({ ...page.snapshot.value, maxPageSize: 80 });
  assert.equal(page.nodes('input')[5].props.value, 70);
});

test('legacy Gitea configuration saves an empty instances list and retains its connection', async () => {
  const page = mountPage();
  page.edit(2, 'https://legacy.example/api/v1');
  await page.save();
  assert.equal(page.snapshot.value.providers.gitea.baseUrl, 'https://legacy.example/api/v1');
  assert.equal(page.snapshot.value.providers.gitea.tokenRef, 'test-gitea');
  assert.deepEqual(Array.from(page.snapshot.value.providers.gitea.instances), []);
});

for (const origin of ['https://git.example.com', 'git@git.example.com:', 'ssh://git@git.example.com:2222']) {
  test(`adding and editing a Gitea instance preserves its clone prefix (${origin})`, async () => {
    const page = mountPage([]);
    page.click('addInstance');
    page.edit(2, origin);
    page.edit(3, 'https://git.example.com/api/v1');
    page.edit(4, 'instance-token');
    await page.save();
    const operation = page.writes[0].operations.find(({ path }) => path.join('.') === 'providers.gitea.instances');
    assert.equal(operation.op, 'set');
    assert.equal(page.writes[0].revision, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(operation.value)), [{ origin, baseUrl: 'https://git.example.com/api/v1', tokenRef: 'instance-token' }]);
    assert.equal(page.snapshot.value.providers.gitea.tokenRef, 'test-gitea');
    assert.equal(page.nodes('input')[2].props.value, origin);
    page.edit(4, 'replacement-token');
    await page.save();
    assert.equal(page.snapshot.value.providers.gitea.instances[0].tokenRef, 'replacement-token');
    assert.deepEqual(page.writes.map(write => write.revision), [1, 2]);
  });
}

test('adding and removing instances preserves siblings and restores legacy fields when empty', async () => {
  const original = [{ origin: 'https://first.example', baseUrl: 'https://first.example/api/v1', tokenRef: 'first-token' }];
  const page = mountPage(original);
  page.click('addInstance');
  page.edit(5, 'git@second.example:');
  page.edit(6, 'https://second.example/api/v1');
  page.edit(7, 'second-token');
  page.click('removeInstance');
  assert.equal(page.nodes('input')[2].props.value, 'git@second.example:');
  assert.equal(original[0].origin, 'https://first.example', 'draft changes must not mutate the accepted snapshot');
  await page.save();
  assert.equal(page.snapshot.value.providers.gitea.instances.length, 1);
  assert.equal(page.snapshot.value.providers.gitea.instances[0].tokenRef, 'second-token');
  page.click('removeInstance');
  assert.equal(page.nodes('input').length, 6);
  assert.equal(page.nodes('input')[2].props.value, 'https://gitea.example/api/v1');
  assert.equal(page.nodes('input')[3].props.value, 'test-gitea');
  await page.save();
  assert.equal(page.snapshot.value.providers.gitea.instances.length, 0);
  assert.deepEqual(page.writes.map(write => write.revision), [1, 2]);
});

test('rejected instance save retains the complete draft for retry', async () => {
  const page = mountPage([]);
  page.click('addInstance');
  page.edit(2, 'ssh://git@git.example.com:2222');
  page.edit(3, 'https://git.example.com/api/v1');
  page.edit(4, 'draft-token');
  page.setResult(false);
  await page.save();
  assert.equal(page.nodes('input')[4].props.value, 'draft-token');
  assert.equal(page.snapshot.value.providers.gitea.instances.length, 0);
  page.setResult(true);
  await page.save();
  assert.equal(page.snapshot.value.providers.gitea.instances[0].tokenRef, 'draft-token');
  assert.deepEqual(page.writes.map(write => write.revision), [1, 1]);
});

for (const failure of [false, new Error('network failure')]) {
  test(`failed save retains editable draft (${String(failure)})`, async () => {
    const page = mountPage();
    page.edit(5, '75');
    page.setResult(failure);
    await page.save();
    assert.equal(page.nodes('input')[5].props.value, 75);
    assert.equal(page.saveButton().props.disabled, false);
    assert.ok(page.nodes('p').some(node => node.props.className === 'dsh-git-error'));
  });
}


test('checks use unsaved instance inputs without writing configuration; tokens stay masked', async () => {
  const page = mountPage([{ origin: 'git@one.example:', baseUrl: 'https://one.example/api/v1', tokenRef: 'one' }]);
  page.edit(3, 'https://draft.example/api/v1');
  page.edit(4, 'draft-token');
  assert.equal(page.nodes('input')[4].props.type, 'password');
  await page.test();
  assert.equal(page.writes.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(page.checks[0])), {
    prefix: '/git-connect', method: 'connection-test',
    input: { baseUrl: 'https://draft.example/api/v1', tokenRef: 'draft-token', timeoutMs: 30000 },
  });
  assert.ok(page.nodes('span').some(node => node.children.includes('connected test-user')));
  page.edit(4, 'changed');
  assert.ok(!page.nodes('span').some(node => node.children.includes('connected test-user')));
});

test('checks display Host failures and allow retry', async () => {
  const page = mountPage([]);
  page.setCheckResponse({ ok: false, error: { code: 'authentication', message: 'Token rejected' } });
  await page.test();
  assert.ok(page.nodes('span').some(node => node.children.includes('failures.authentication')));
  page.setCheckResponse({ ok: true, value: { login: 'retry-user' } });
  await page.test();
  assert.ok(page.nodes('span').some(node => node.children.includes('connected retry-user')));
});

test('an earlier check cannot replace a newer result', async () => {
  const page = mountPage([]);
  let finishFirst;
  page.setCheckTransport(() => new Promise(resolve => { finishFirst = resolve; }));
  const first = page.test();
  assert.ok(page.nodes('button').some(node => node.children.includes('testing') && node.props.disabled));
  page.edit(2, 'https://new.example/api/v1');
  page.setCheckTransport(() => ({ ok: true, value: { login: 'new-user' } }));
  await page.test();
  finishFirst({ ok: true, value: { login: 'old-user' } });
  await first;
  assert.ok(page.nodes('span').some(node => node.children.includes('connected new-user')));
});
