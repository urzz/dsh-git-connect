import { copyFile } from 'node:fs/promises';

for (const file of ['index.js', 'client.js', 'probe-index.js']) {
  await copyFile(`dist/${file}`, file);
}

for (const file of ['index.js', 'client.js']) {
  await copyFile(file, `.release/${file}`);
}
