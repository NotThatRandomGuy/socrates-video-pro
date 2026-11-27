'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
function register({app,ipcMain,dialog,getWindow,smoke=false}) {
  const root=path.join(app.getPath('userData'),'components');
  const settings=path.join(root,'settings.json');
  const payload=app.isPackaged?path.join(process.resourcesPath,'short-form-payload','studio.js'):path.join(__dirname,'..','components','short-form','studio.js');
  const installed=path.join(root,'short-form','studio.js');
  let config={enabled:false,decided:smoke,installer:''};
  try{const value=JSON.parse(fs.readFileSync(settings,'utf8'));config={enabled:value?.enabled===true,decided:smoke||value?.decided===true,installer:typeof value?.installer==='string'?value.installer:''};}catch{}
  function save(){
    fs.mkdirSync(root,{recursive:true});const temp=settings+'.'+randomUUID();
    fs.writeFileSync(temp,JSON.stringify(config));fs.renameSync(temp,settings);
  }
  function sync(){
    const source=fs.readFileSync(payload);
    if(config.enabled){fs.mkdirSync(path.dirname(installed),{recursive:true});const temp=installed+'.'+randomUUID();fs.writeFileSync(temp,source);fs.renameSync(temp,installed);}
    return source;
  }
  // The Windows installer writes an explicit choice, including on upgrades.
  if(app.isPackaged && process.platform==='win32' && !smoke) {
    const marker=path.join(process.resourcesPath,'short-form-choice.json');
    try {
      const token=fs.statSync(marker).mtimeMs.toString();
      if(config.installer!==token){const choice=JSON.parse(fs.readFileSync(marker,'utf8'));if(typeof choice.enabled==='boolean'){config={enabled:choice.enabled,decided:true,installer:token};sync();save();if(!config.enabled)fs.rmSync(installed,{force:true});}}
    }catch{}
  }
  for(const [name,fn] of Object.entries({
    info:()=>({enabled:config.enabled,decided:config.decided}),
    set:async(enabled)=>{
      if(typeof enabled!=='boolean')throw Error('Please choose whether to install Short Form Studio');
      if(enabled && !config.enabled) {
        const answer=await dialog.showMessageBox(getWindow(),{type:'question',buttons:['Keep the base editor','Install Short Form Studio'],defaultId:0,cancelId:0,message:'Would you like to install the optional short-form tools?',detail:'Includes beat editing, animated titles, tracking, manual rotoscoping, speed ramps, effects, and templates.'});
        if(answer.response!==1)return {enabled:false,decided:config.decided};
      }
      const previous={...config};
      try{config.enabled=enabled;config.decided=true;sync();save();if(!enabled)fs.rmSync(installed,{force:true});}
      catch(error){config=previous;throw error;}
      return {enabled:config.enabled,decided:true};
    },
    source:()=>{
      if(!config.enabled)return null;
      const expected=sync(),actual=fs.readFileSync(installed);
      if(createHash('sha256').update(actual).digest('hex')!==createHash('sha256').update(expected).digest('hex'))throw Error('Please reinstall Short Form Studio');
      return actual.toString('utf8');
    }
  }))ipcMain.handle('components:'+name,async(event,value)=>{
    const win=getWindow();
    if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted component request');
    return fn(value);
  });
}
module.exports={register};
