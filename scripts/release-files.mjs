import fs from 'node:fs';
export const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const base = 'Socrates-Video-Pro-' + version;
export const windows = ['Setup','Portable'].map(kind => base + '-' + kind + '-x64.exe');
export const packaged = [base + '-Linux-x86_64.AppImage', base + '-Linux-amd64.deb',
  base + '-macOS-arm64.dmg', base + '-macOS-x64.dmg', 'Socrates-Video-Pro-Web.zip'];
export const signedFiles = [...windows, ...packaged, 'release-signing.cer', 'release-public-key.pem'].sort();
export const expected = [...signedFiles, 'SHA256SUMS.txt', 'SHA256SUMS.txt.sig'];
