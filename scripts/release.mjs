// Signing remains local. GitHub credentials come from the existing credential helper,
// remain in memory, and are never written to files or printed.
import fs from 'node:fs';
import { version, windows, packaged, signedFiles, expected } from './release-files.mjs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,X509Certificate} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),repo='NotThatRandomGuy/socrates-video-pro';
const tag='v'+version;
const args=['-c','safe.directory='+root.replaceAll('\\','/')];
const credential=execFileSync('git',[...args,'credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true});
const token=credential.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);if(!token)throw Error('GitHub authentication is required');
async function api(route,options={}){
  const url=route.startsWith('https://')?route:'https://api.github.com/repos/'+repo+'/'+route;
  if(!['api.github.com','uploads.github.com'].includes(new URL(url).hostname))throw Error('Unexpected GitHub endpoint');
  const response=await fetch(url,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...options.headers}});
  if(!response.ok)throw Error('GitHub request failed ('+response.status+'): '+route.replace(/\?.*/,''));
  return response;
}
// Drafts are visible in the authenticated release list, but tag lookup can return 404.
const releases=await (await api('releases?per_page=100')).json();
const release=releases.find(r=>r.tag_name===tag);if(!release?.draft)throw Error('Only a draft release can be finalized');
const dir=path.join(root,'dist','release',version);fs.mkdirSync(dir,{recursive:true});
if(fs.readdirSync(dir).some(n=>!expected.includes(n)))throw Error('Staging folder contains files from another release; use an empty dist/release folder');
if(process.argv[2]==='stage'){
  const built=JSON.parse(fs.readFileSync(path.join(root,'dist','signed-build.json'),'utf8'));
  const head=execFileSync('git',[...args,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(built.commit!==head||built.version!==version)throw Error('Rebuild signed Windows packages from the release commit');
  for(const name of packaged){
    const asset=release.assets.find(a=>a.name===name);
    if(!asset)throw Error('Missing CI package '+name);
    const response=await api('releases/assets/'+asset.id,{headers:{Accept:'application/octet-stream'}});
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==asset.size || asset.digest!=='sha256:'+createHash('sha256').update(bytes).digest('hex'))throw Error('GitHub package checksum mismatch: '+name);
    fs.writeFileSync(path.join(dir,name),bytes);console.log('Downloaded '+name);
  }
  for(const name of windows){fs.copyFileSync(path.join(root,'dist',name),path.join(dir,name));}
  const certificate=new X509Certificate(fs.readFileSync(path.join(root,'signing','release-signing.cer')));
  fs.copyFileSync(path.join(root,'signing','release-signing.cer'),path.join(dir,'release-signing.cer'));
  fs.writeFileSync(path.join(dir,'release-public-key.pem'),certificate.publicKey.export({type:'spki',format:'pem'}));
  const files=signedFiles;
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),files.map(n=>createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')+'  '+n).join('\n')+'\n');
  console.log('Prepared release files. Sign SHA256SUMS.txt locally, then run publish.');
}else if(process.argv[2]==='publish'){
  execFileSync(process.execPath,[path.join(root,'scripts','verify-release.mjs'),dir],{stdio:'inherit'});
  const local=execFileSync('git',[...args,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),ref=await(await api('git/ref/tags/'+tag)).json();
  if(ref.object.sha!==local)throw Error('Local checkout does not match the release tag');
  const runs=await(await api('actions/runs?head_sha='+local)).json();
  if(!runs.workflow_runs.some(r=>r.head_branch===tag&&r.conclusion==='success'))throw Error('Tagged release checks have not succeeded');
  const names=fs.readdirSync(dir);for(const name of expected)if(!names.includes(name))throw Error('Missing release artifact '+name);
  for(const name of names.filter(n=>n.endsWith('.exe'))){
    const thumb=execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts','verify-windows.ps1'),'-FilePath',path.join(dir,name)],{encoding:'utf8',windowsHide:true}).trim();
    if(thumb!==fs.readFileSync(path.join(root,'signing/thumbprint.txt'),'utf8').trim())throw Error('Wrong Windows signer');
  }
  for(const name of names){
    const old=release.assets.find(a=>a.name===name);
    const content=fs.readFileSync(path.join(dir,name));
    if(old?.digest==='sha256:'+createHash('sha256').update(content).digest('hex'))continue;
    if(old)await api('releases/assets/'+old.id,{method:'DELETE'});
    const url=release.upload_url.split('{')[0]+'?name='+encodeURIComponent(name);
    await api(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:content});console.log('Uploaded '+name);
  }
  const published=await api('releases/'+release.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,make_latest:'true'})});
  console.log('Published '+(await published.json()).html_url);
}else throw Error('Use stage or publish');
