import { copyFile, mkdir, readdir } from 'node:fs/promises';

async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = `${source}/${entry.name}`;
    const to = `${target}/${entry.name}`;
    if (entry.isDirectory()) await copyTree(from, to);
    else await copyFile(from, to);
  }
}

await mkdir('lib', { recursive: true });
await copyFile('lib/client/index.js', 'lib/client.js');

for (const file of ['index.js', 'client.js', 'probe-index.js']) {
  await copyFile(`lib/${file}`, file);
}

await mkdir('.release/lib', { recursive: true });
await copyFile('lib/index.js', '.release/lib/index.js');
await copyFile('lib/client.js', '.release/lib/client.js');
await copyTree('lib/types', '.release/lib/types');
await copyFile('package.json', '.release/package.json');

for (const file of ['index.js', 'client.js']) {
  await copyFile(file, `.release/${file}`);
}
