import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {launch} from './harness.mjs';
const require=createRequire(import.meta.url),Core=require('../js/core/update-core.js');
const {kindFor,verifyManifest}=require('../desktop/updates.cjs');
assert(Core.newer('1.2.10','1.2.5'));assert(!Core.newer('1.2.5','1.2.10'));
assert(!Core.parts('1.2.11-beta'));assert(!Core.parts('1.02.10'));
for(const [os,arch,env,expected] of [['win32','x64',{},'setup'],['win32','x64',{PORTABLE_EXECUTABLE_DIR:'x'},'portable'],['linux','x64',{},'deb'],['linux','x64',{APPIMAGE:'x'},'appimage'],['darwin','arm64',{},'arm64'],['darwin','x64',{},'x64'],['linux','arm64',{},null]])assert.equal(kindFor(os,arch,env),expected);
const manifest=fs.readFileSync('tests/fixtures/1.2.5-SHA256SUMS.txt'),signature=fs.readFileSync('dist/release/1.2.5/SHA256SUMS.txt.sig'),cert=fs.readFileSync('signing/release-signing.cer');
assert(verifyManifest(manifest,signature,cert).has('Socrates-Video-Pro-1.2.5-Setup-x64.exe'));
assert.throws(()=>verifyManifest(Buffer.concat([manifest,Buffer.from('tampered')]),signature,cert));
const {check,evalJs,results,errors,done}=await launch();
await check('offline update checks preserve dirty work and remain usable',`(async()=>{
 const original=fetch,project=state.project;state.dirty=true;window.fetch=async()=>{throw Error('offline');};
 try{await Updates.check(true);return state.project===project&&state.dirty&&!document.querySelector('.modal-back');}finally{window.fetch=original;}
})()`);
await evalJs(`window.fakeRelease={tag_name:'v1.3.0',html_url:UpdateCore.repo+'/releases/tag/v1.3.0',draft:false,prerelease:false,assets:[],body:'Friendly new features and fixes'};`);
await check('background update check only fetches metadata and shows a quiet button',`(async()=>{
 const original=fetch;let count=0;window.fetch=async()=>{count++;return {ok:true,json:async()=>fakeRelease};};
 try{const pending=Updates.check(true);await new Promise(r=>setTimeout(r,20));document.querySelector('.modal-head .mini')?.click();await pending;return count===1&&!document.querySelector('.modal-back');}finally{window.fetch=original;}
})()`);
await check('skip is version specific and opt-out survives settings round trips',`(()=>{
 const p=UpdateCore.preferences({enabled:false,skipped:['1.3.0'],remindUntil:0});
 if(UpdateCore.shouldNotify(p,'1.3.0'))return false;
 p.enabled=true;
 return !UpdateCore.shouldNotify(p,'1.3.0')&&UpdateCore.shouldNotify(p,'1.3.1')&&!UpdateCore.shouldNotify({...p,remindUntil:Date.now()+10000},'1.3.1');
})()`);
await check('untrusted and preview releases are rejected',`(()=>{
 for(const data of [{...fakeRelease,prerelease:true},{...fakeRelease,html_url:'https://example.com'},{...fakeRelease,tag_name:'v1.3.0-beta'}]){
  try{UpdateCore.release(data);return false;}catch{}
 }return true;
})()`);
console.log('Updater verification and preferences passed.');
for(const [name,result]of results)console.log(result+': '+name);
console.log('Console errors:',errors.length?errors:'(none)');
await done();process.exit(results.some(([,r])=>r!=='PASS')||errors.length?1:0);
