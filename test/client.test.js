import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Run the shipped module and its page callbacks without a browser or real credentials.
const source = await readFile(process.env.CLIENT_UNDER_TEST ?? new URL('../client.js', import.meta.url), 'utf8');
function mountPage() {
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
        gitea: { baseUrl: 'https://gitea.example/api/v1', tokenRef: 'test-gitea' },
      },
      requestTimeoutMs: 30000, maxPageSize: 50,
    },
  };
  let result = true;
  let duringSave;
  const writes = [];
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
    nodes, writes,
    save: () => nodes('button')[0].props.onClick(),
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
  page.onSave(() => assert.equal(page.nodes('button')[0].props.disabled, true));
  await page.save();
  assert.equal(page.nodes('input').length, 6, 'successful save must not show unavailable');
  assert.equal(page.nodes('button')[0].props.disabled, false);
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

for (const failure of [false, new Error('network failure')]) {
  test(`failed save retains editable draft (${String(failure)})`, async () => {
    const page = mountPage();
    page.edit(5, '75');
    page.setResult(failure);
    await page.save();
    assert.equal(page.nodes('input')[5].props.value, 75);
    assert.equal(page.nodes('button')[0].props.disabled, false);
    assert.ok(page.nodes('p').some(node => node.props.className === 'dsh-git-error'));
  });
}
