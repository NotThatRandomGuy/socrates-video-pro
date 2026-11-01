import fs from 'node:fs';
import path from 'node:path';
import { createHash, verify, X509Certificate } from 'node:crypto';
const dir = path.resolve(process.argv[2] || 'dist/release');
const cert = new X509Certificate(fs.readFileSync(path.join(dir,'release-signing.cer')));
const manifest = fs.readFileSync(path.join(dir,'SHA256SUMS.txt'));
if (!verify('sha256', manifest, cert.publicKey, fs.readFileSync(path.join(dir,'SHA256SUMS.txt.sig')))) throw Error('Invalid release signature');
for (const line of manifest.toString('utf8').trim().split('\n')) {
  const match = /^([a-f0-9]{64})  ([\w .-]+)$/.exec(line); if (!match || path.basename(match[2]) !== match[2]) throw Error('Invalid manifest entry');
  const digest = createHash('sha256').update(fs.readFileSync(path.join(dir,match[2]))).digest('hex');
  if (digest !== match[1]) throw Error('Checksum mismatch: ' + match[2]);
}
console.log('Release signature and every file hash verified. Certificate SHA-256: ' + cert.fingerprint256);
