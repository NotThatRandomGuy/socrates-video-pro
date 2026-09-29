import { spawnSync } from 'node:child_process';
for (const test of ['scripts/check.mjs', 'tests/smoke.mjs', 'tests/interact.mjs', 'tests/canvas.mjs', 'tests/fileproto.mjs']) {
  const result = spawnSync(process.execPath, [test], { stdio: 'inherit', timeout: 240000 });
  if (result.status !== 0) { console.error(result.error || `${test} failed`); process.exit(1); }
}
