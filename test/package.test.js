import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Git-source package contains every declared entry without running a build', async () => {
  // Include new, nonignored files during development; CI uses the committed tree.
  // Crucially, ignored local build outputs cannot make this check pass.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const deleted = new Set(execFileSync('git', ['ls-files', '--deleted', '-z'], {
    cwd: root, encoding: 'utf8',
  }).split('\0'));
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-git-package-test-'));
  try {
    for (const file of files.filter(file => !deleted.has(file))) {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, file), target);
    }
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(directory, '.npm-cache') },
    }));
    const packedFiles = new Set(packed.files.map(file => file.path));
    const required = [manifest.main, manifest.types, manifest.dsh.bundle.patch, 'locale/en.json', 'locale/zh.json', 'icon.svg'];
    for (const entry of Object.values(manifest.exports)) {
      for (const value of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        if (!value.includes('*')) required.push(value);
      }
    }
    for (const file of required) {
      assert.ok(packedFiles.has(file.replace(/^\.\//, '')), `Git-source package is missing ${file}`);
    }
    assert.ok(packedFiles.has(manifest.icon.replace(/^\.\//, '')), 'declared icon must be shipped');
    assert.equal(manifest.devDependencies['@deepseek-ai/dsh-tools'], manifest.peerDependencies['@deepseek-ai/dsh-tools']);
    assert.equal(manifest.exports['./src/*'], undefined, 'unpublished sources must not be exported');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('dsh-git-package-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
