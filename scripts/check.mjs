import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
for (const dir of ['js', 'desktop', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(dir, { recursive: true }).filter(f => /\.(?:js|mjs|cjs)$/.test(f))) {
    if (file.includes('.chrome-profile')) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' });
    if (result.status) process.exit(result.status);
  }
}
console.log('All JavaScript syntax checks passed.');
