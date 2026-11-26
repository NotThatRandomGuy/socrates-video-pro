'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash,verify,X509Certificate,randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const Core=require('../js/core/update-core.js');
const API='https://api.github.com/repos/NotThatRandomGuy/socrates-video-pro/releases/latest';

function verifyManifest(manifest,signature,certificate) {
  const cert=new X509Certificate(certificate);
  if(!verify('sha256',manifest,cert.publicKey,signature)) throw Error('The update signature could not be verified');
  const hashes=new Map();
  for(const line of manifest.toString('utf8').trim().split('\n')) {
    const match=/^([a-f0-9]{64})  ([\w.-]+)$/.exec(line);
    if(!match || hashes.has(match[2])) throw Error('The download list is invalid');
    hashes.set(match[2],match[1]);
  }
  return hashes;
}
function kindFor(platform,arch,env) {
  if(platform==='darwin')return arch==='arm64'?'arm64':arch==='x64'?'x64':null;
  if(platform==='win32')return arch==='x64'?(env.PORTABLE_EXECUTABLE_DIR?'portable':'setup'):null;
  return platform==='linux' && arch==='x64'?(env.APPIMAGE?'appimage':'deb'):null;
}
function register({app,ipcMain,dialog,shell,getWindow}) {
  const entry=require('node:url').pathToFileURL(path.join(__dirname,'..','index.html')).href;
  const prefsPath=path.join(app.getPath('userData'),'update-preferences.json');
  const kind=kindFor(process.platform,process.arch,process.env);
  let prefs=Core.preferences(),latest=null,pending=null,downloaded=null;
  try{prefs=Core.preferences(JSON.parse(fs.readFileSync(prefsPath,'utf8')));}catch{}
  async function request(url,signal,limit=2*1024*1024) {
    const response=await fetch(url,{signal:signal || AbortSignal.timeout(12000),headers:{Accept:'application/vnd.github+json'}});
    if(!response.ok)throw Error('The update service is unavailable right now');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Update information is too large');chunks.push(chunk);}
    return Buffer.concat(chunks);
  }
  async function safeToInstall() {
    const win=getWindow();
    if(!win || win.isDestroyed())throw Error('Please reopen the editor to continue');
    const busy=await win.webContents.executeJavaScript("state.dirty || !!state.exporting || state.playing || Recorder.recording");
    if(busy)throw Error('Please save your project and finish playback, recording, or export before opening the update');
    return win;
  }
  const handlers={
    info:()=>({version:app.getVersion(),kind,preferences:prefs}),
    preferences:value=>{
      prefs=Core.preferences(value);
      const temp=prefsPath+'.tmp';
      fs.mkdirSync(path.dirname(prefsPath),{recursive:true});
      fs.writeFileSync(temp,JSON.stringify(prefs));fs.renameSync(temp,prefsPath);
      return prefs;
    },
    check:async()=>{
      latest=Core.release(JSON.parse((await request(API)).toString('utf8')));
      return latest;
    },
    notes:async()=>{if(latest)await shell.openExternal(latest.url);},
    cancel:()=>{pending?.abort();return true;},
    download:async()=>{
      if(pending)throw Error('An update download is already in progress');
      if(!latest || !Core.newer(latest.version,app.getVersion()) || !kind)throw Error('Please check for an update first');
      const release=latest, name=Core.assetName(release.version,kind);
      const asset=release.assets.find(a=>a.name===name);
      if(!asset)throw Error('A download for this edition is not available yet');
      const win=getWindow();
      if(!win || await win.webContents.executeJavaScript("!!state.exporting"))throw Error('Please finish your export first');
      const controller=pending=new AbortController();
      let temporary;
      try {
        const choice=await dialog.showSaveDialog(win,{title:'Save your optional update',defaultPath:path.join(app.getPath('downloads'),name),buttonLabel:'Download update'});
        if(choice.canceled || controller.signal.aborted)return {cancelled:true};
        if(path.resolve(choice.filePath)===path.resolve(process.execPath) || (process.env.APPIMAGE && path.resolve(choice.filePath)===path.resolve(process.env.APPIMAGE))
          || (process.env.PORTABLE_EXECUTABLE_FILE && path.resolve(choice.filePath)===path.resolve(process.env.PORTABLE_EXECUTABLE_FILE)))throw Error('Please save the update separately from your current application');
        temporary=choice.filePath+'.'+randomUUID()+'.partial'+path.extname(name);
        const fetchAsset=async assetName=>{
          const item=release.assets.find(a=>a.name===assetName);
          if(!item)throw Error('This release is missing its signed download list');
          return request(item.browser_download_url,controller.signal);
        };
        const timer=setTimeout(()=>controller.abort(),15*60*1000);
        try {
          const manifest=await fetchAsset('SHA256SUMS.txt'),signature=await fetchAsset('SHA256SUMS.txt.sig');
          const hashes=verifyManifest(manifest,signature,fs.readFileSync(path.join(__dirname,'..','signing','release-signing.cer')));
          const hash=hashes.get(name);if(!hash)throw Error('The update is missing from the signed download list');
          const response=await fetch(asset.browser_download_url,{signal:controller.signal});
          if(!response.ok)throw Error('The download is unavailable right now');
          const handle=await fs.promises.open(temporary,'wx');
          const digest=createHash('sha256');let size=0;
          try{for await(const chunk of response.body){
            size+=chunk.length;if(size>asset.size)throw Error('The update download has an unexpected size');
            digest.update(chunk);await handle.writeFile(chunk);
          }}finally{await handle.close();}
          if(size!==asset.size || digest.digest('hex')!==hash)throw Error('The downloaded update did not pass verification');
          if(kind==='setup' || kind==='portable') {
            const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',(app.isPackaged ? path.join(process.resourcesPath,'app.asar.unpacked','desktop','verify-update.ps1') : path.join(__dirname,'verify-update.ps1')),'-FilePath',temporary],{windowsHide:true,timeout:30000});
            const cert=new X509Certificate(fs.readFileSync(path.join(__dirname,'..','signing','release-signing.cer')));
            if(result.stdout.trim()!==cert.fingerprint.replaceAll(':',''))throw Error('The Windows update has an unexpected signer');
          }
          // The save dialog authorizes replacing only the selected destination.
          await fs.promises.rename(temporary,choice.filePath);temporary=null;
          if(kind==='appimage')await fs.promises.chmod(choice.filePath,0o755);
          downloaded={path:choice.filePath,hash,kind};
          return {name,kind,verified:true};
        } finally {clearTimeout(timer);}
      } finally {
        if(temporary)await fs.promises.rm(temporary,{force:true}).catch(()=>{});
        pending=null;
      }
    },
    install:async()=>{
      if(!downloaded)throw Error('Please download and verify an update first');
      const win=await safeToInstall(),file=downloaded;
      if(createHash('sha256').update(await fs.promises.readFile(file.path)).digest('hex')!==file.hash)throw Error('The saved update has changed. Please download it again');
      if(file.kind==='setup') {
        const answer=await dialog.showMessageBox(win,{type:'question',buttons:['Keep editing','Open installer'],defaultId:0,cancelId:0,message:'Would you like to open the verified installer?',detail:'Your editor will stay open. You can choose when to close it and complete installation.'});
        if(answer.response!==1)return false;
        await safeToInstall();
        const result=await shell.openPath(file.path);if(result)throw Error(result);
      } else {
        // Portable applications, AppImage, DEB and DMG are handed to the user.
        shell.showItemInFolder(file.path);
      }
      return true;
    }
  };
  for(const [name,handler] of Object.entries(handlers))ipcMain.handle('updates:'+name,async(event,value)=>{
    const win=getWindow();
    if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==entry)throw Error('Untrusted update request');
    try{return await handler(value);}catch(error){throw Error(error.name==='AbortError'?'The update was cancelled or the connection timed out. You can try again whenever you like.':(error.code || error instanceof TypeError ? 'We could not complete the update right now. Please check your connection or download folder and try again whenever you like.' : error.message));}
  });
}
module.exports={register,verifyManifest,kindFor};
