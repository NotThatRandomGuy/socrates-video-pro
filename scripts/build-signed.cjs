'use strict';
const { build, Platform, Arch } = require('electron-builder');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
if (process.platform !== 'win32') throw Error('Local Authenticode signing requires Windows');
const root=path.resolve(__dirname,'..'), gitArgs=['-c','safe.directory='+root.replaceAll('\\','/')];
const git=(...args)=>execFileSync('git',[...gitArgs,...args],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const commit=git('rev-parse','HEAD');
if(git('status','--porcelain'))throw Error('Commit source changes before making signed release packages');
build({ targets: Platform.WINDOWS.createTarget(['nsis','portable'], Arch.x64), publish:'never', config: { win: { signExecutable: true, signtoolOptions: { sign: path.join(__dirname,'windows-sign.cjs'), signingHashAlgorithms:['sha256'] } } } }).then(()=>{
  if(git('rev-parse','HEAD')!==commit||git('status','--porcelain'))throw Error('Source changed during packaging; rebuild before release');
  fs.writeFileSync(path.join(root,'dist','signed-build.json'),JSON.stringify({commit,version:require('../package.json').version},null,2));
}).catch(e=>{ console.error(e);process.exitCode=1; });
