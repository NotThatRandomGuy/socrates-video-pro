import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'dist', 'web');
fs.mkdirSync(out, { recursive: true });
for (const file of ['index.html', 'css', 'js', 'assets', 'README.md', 'LICENSE']) fs.cpSync(path.join(root, file), path.join(out, file), { recursive: true });
fs.mkdirSync(path.join(out, 'tests'), { recursive: true });
fs.copyFileSync(path.join(root, 'tests', 'screenshot.png'), path.join(out, 'tests', 'screenshot.png'));
console.log('Static web app built in dist/web');
