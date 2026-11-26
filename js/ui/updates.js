'use strict';
const Updates = (() => {
  const desktop=window.desktopUpdates;
  const key='socrates-update-preferences';
  let prefs=UpdateCore.preferences(),latest=null,info={version:APP_VERSION,kind:'web'},checking=false,button,reminder,downloading=false;
  function localPreferences() { try{return UpdateCore.preferences(JSON.parse(localStorage.getItem(key)||'{}'));}catch{return UpdateCore.preferences();} }
  async function persist() {
    if(desktop)prefs=await desktop.preferences(prefs);
    else localStorage.setItem(key,JSON.stringify(prefs));
    badge();scheduleReminder();
  }
  function badge() {
    if(button)button.hidden=!latest || !UpdateCore.newer(latest.version,info.version) || !UpdateCore.shouldNotify(prefs,latest.version);
  }
  function scheduleReminder() {
    clearTimeout(reminder);
    if(prefs.enabled && prefs.remindUntil>Date.now())reminder=setTimeout(()=>{badge();scheduleReminder();},Math.min(2147483647,prefs.remindUntil-Date.now()+100));
  }
  async function check(manual=false) {
    if(checking || (!manual && !prefs.enabled))return;
    checking=true;
    try {
      if(desktop)latest=await desktop.check();
      else {
        const response=await fetch('https://api.github.com/repos/NotThatRandomGuy/socrates-video-pro/releases/latest',{signal:AbortSignal.timeout(10000),cache:'no-store'});
        if(!response.ok)throw Error();
        latest=UpdateCore.release(await response.json());
      }
      badge();
      if(manual) {
        if(state.exporting || document.querySelector('.modal-back'))UI.toast('Update check complete. You can open Updates from Help when you are ready.');
        else if(UpdateCore.newer(latest.version,info.version))await show();
        else UI.toast('You are using the latest stable release. Happy editing!');
      }
    } catch {
      if(manual)UI.toast('We could not check for updates right now. Please try again whenever you like. Your editor is ready to use.',6000);
    } finally {checking=false;}
  }
  async function releaseNotes() {
    if(desktop)await desktop.releaseNotes();else if(latest)window.open(latest.url,'_blank','noopener,noreferrer');
  }
  function instructions(kind) {
    const text={
      portable:'Your verified portable app is ready. When you are finished editing, close the current app and replace its executable with the new one. Keep the adjacent SocratesVideoPro-data folder to preserve recovery and preferences.',
      appimage:'Your verified AppImage is ready. When you are finished editing, close this app and launch the new AppImage. Your user configuration and recovery stay in the same location.',
      deb:'Your verified Debian package is ready. When you are finished editing, open it with your package manager to install it. Your project files and user configuration stay in place.',
      arm64:'Your verified Apple silicon disk image is ready. When you are finished editing, close the app, open the disk image, and drag the app to Applications. macOS may ask you to approve the first launch.',
      x64:'Your verified Intel Mac disk image is ready. When you are finished editing, close the app, open the disk image, and drag the app to Applications. macOS may ask you to approve the first launch.',
      setup:'Your signed Windows installer is ready. Please save your project before opening it. You choose when to finish editing and close the current app.'
    };return text[kind]||'You can find the available downloads on the release page.';
  }
  async function updateNow() {
    if(state.exporting)return UI.toast('Please finish your export first. Your update can wait.');
    if(desktop) {
      if(downloading)return;
      downloading=true;
      const controller=new AbortController();
      const status=U.el('p',{role:'status'},'Downloading your update and checking its signature. You can keep this window open, or cancel and return to your edit.');
      const waiting=UI.modal('Your optional update',status,[{label:'Cancel download',value:'cancel'}],{signal:controller.signal});
      let finished=false;
      waiting.then(()=>{if(!finished)desktop.cancel().catch(()=>{});});
      try {
        const result=await desktop.download();finished=true;controller.abort();
        if(!result || result.cancelled)return;
        const action=await UI.modal('Your verified update is ready',U.el('p',{},instructions(result.kind)),[{label:'Keep editing'},{label:result.kind==='setup'?'Open installer':'Show downloaded file',primary:true,value:'open'}]);
        if(action==='open')await desktop.install();
      } catch(error){finished=true;controller.abort();UI.toast(error.message,6500);}
      finally{downloading=false;}
      return;
    }
    if(location.protocol==='http:' || location.protocol==='https:') {
      try {
        const url=new URL('js/core/version.js',location.href);url.searchParams.set('update-check',Date.now());
        const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
        const source=await response.text();
        const version=/const APP_VERSION = '([0-9.]+)'/.exec(source)?.[1];
        if(response.ok && UpdateCore.newer(version,APP_VERSION)) {
          if(state.dirty && !Project.save())return;
          const ok=await UI.confirm('Reload when you are ready','A newer editor is available on this site. Please keep the saved project file. Would you like to reload now?','Reload editor');
          if(ok) {
            if(state.exporting || state.playing || state.dirty || Recorder.recording)return UI.toast('Please save any new edits and finish playback, recording, or export before reloading.');
            const snapshot=ProjectValidation.validate(Project.serialize());
            if(await DB.set('autosave',snapshot)!=='autosave')return UI.toast('We could not save a recovery checkpoint. Please keep your downloaded project and continue editing until you are ready to reopen it.');
            if(state.exporting || state.playing || state.dirty || Recorder.recording)return UI.toast('Your edit changed while preparing the update. Please save it before trying again.');
            location.reload();
          }
          return;
        }
      }catch{}
    }
    await UI.modal('Your update is ready to explore',U.el('p',{},'The newest release is available on GitHub. For a downloaded web edition, save your project, download the new web archive, extract it separately, and open your saved project there. For a hosted editor, reload after the site has been updated and your project is saved.'),[{label:'Keep editing'},{label:'View downloads',primary:true,value:true}]).then(ok=>ok?releaseNotes():null);
  }
  async function show() {
    if(state.exporting)return UI.toast('Your export comes first. You can open Updates again when it finishes.');
    if(document.querySelector('.modal-back'))return UI.toast('Please close the current dialog, then open Updates again.');
    if(!latest)return check(true);
    const remind=U.el('select',{'aria-label':'Remind me later'},[[3600000,'In 1 hour'],[86400000,'Tomorrow'],[604800000,'In 1 week']].map(([value,label])=>U.el('option',{value,selected:value===604800000},label)));
    const disabled=U.el('input',{type:'checkbox',checked:!prefs.enabled});
    const guidance=U.el('p',{class:'update-guidance'},'You can check manually and turn notifications back on in Help → Update settings.');
    disabled.onchange=async()=>{prefs.enabled=!disabled.checked;try{await persist();}catch{UI.toast('We could not save that preference. Please try again.');}};
    const body=U.el('div',{class:'update-panel'},
      U.el('h2',{},'A new update is available!'),
      U.el('p',{},'Socrates Video Pro '+latest.version+' is now available. You are currently using version '+info.version+'.'),
      U.el('section',{class:'update-notes'},U.el('strong',{},"What’s new"),U.el('pre',{},latest.notes||'Improvements and fixes are included in this release.'),U.el('button',{onclick:releaseNotes},'View full release notes')),
      U.el('p',{},'Updating is entirely optional. You are welcome to keep using your current version for as long as you wish.'),
      U.el('label',{class:'update-reminder'},'Remind me later',remind),
      U.el('label',{class:'update-optout'},disabled,"Don’t notify me about future updates"),guidance);
    const choice=await UI.modal('Socrates Video Pro Updates',body,[
      {label:'Close',value:'close'},{label:'Remind Me Later',value:'later'},
      {label:'Skip This Update',value:'skip'},{label:'Update Now',primary:true,value:'update'}
    ],{width:640});
    if(choice==='update')return updateNow();
    if(choice==='skip')prefs.skipped=[...new Set([...prefs.skipped,latest.version])];
    else if(choice==='later'){prefs.remindUntil=Date.now()+Number(remind.value);prefs.dismissed='';}
    else prefs.dismissed=latest.version;
    try{await persist();}catch{UI.toast('We could not save your update preferences.');}
  }
  async function settings() {
    const enabled=U.el('input',{type:'checkbox',checked:prefs.enabled});
    const body=U.el('div',{},U.el('p',{},'Your software. Your projects. Your choice.'),U.el('label',{class:'update-optout'},enabled,'Check for new releases in the background'),U.el('p',{},'Downloads and installation always wait for your permission. You can check manually at any time.'));
    const choice=await UI.modal('Update settings',body,[{label:'Cancel'},{label:'Save preferences',primary:true}]);
    if(choice){prefs.enabled=enabled.checked;prefs.dismissed='';await persist();}
  }
  async function init() {
    button=U.el('button',{id:'btnUpdateAvailable',hidden:true,onclick:()=>show()},'Update available');
    document.getElementById('btnHelp').before(button);
    try{if(desktop){info=await desktop.info();prefs=UpdateCore.preferences(info.preferences);}else prefs=localPreferences();}catch{}
    // Network access is deliberately detached from editor startup.
    setTimeout(()=>check(),15000);
    setInterval(()=>check(),6*60*60*1000);
    scheduleReminder();
  }
  return {init,check,show,settings,updateNow,instructions};
})();
