import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function collect(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (entry.name.endsWith('.js')) result.push(path);
  }
  return result;
}

for (const file of await collect(fileURLToPath(new URL('../src/js', import.meta.url)))) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write(check.stderr);
    process.exit(check.status || 1);
  }
}
console.log('All frontend JavaScript files passed syntax checks.');
