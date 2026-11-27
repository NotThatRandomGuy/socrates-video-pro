'use strict';
const Components=(()=>{
  let config={enabled:false,decided:false},loaded=false;
  const key='socrates-short-form-component';
  async function load(){
    if(loaded || !config.enabled)return;
    if(window.desktopComponents){
      const source=await desktopComponents.source();
      if(!source)throw Error('Short Form Studio is unavailable');
      const script=document.createElement('script');script.textContent=source;document.head.append(script);
    }else await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='components/short-form/studio.js';script.onload=resolve;script.onerror=()=>reject(Error('Could not load Short Form Studio'));document.head.append(script);});
    if(!window.ShortForm)throw Error('Could not start Short Form Studio');
    loaded=true;
  }
  async function set(enabled){
    if(window.desktopComponents)config=await desktopComponents.set(enabled);
    else{config={enabled,decided:true};localStorage.setItem(key,JSON.stringify(config));}
    if(!config.enabled)window.ShortForm?.close();
    await load();return config.enabled;
  }
  async function choose(){
    if(state.exporting)return UI.toast('Please finish your export first');
    const input=U.el('input',{type:'checkbox',checked:config.enabled});
    const body=U.el('div',{},U.el('p',{},'Would you like to add Short Form Studio? You can change this choice later in Help → Optional components.'),U.el('label',{class:'update-optout'},input,'Install Short Form Studio'),U.el('p',{},'Includes beat sync, animated titles, tracking, manual rotoscoping, speed ramps, zooms, shakes, effects, masks, motion blur, 3D perspective, audio reaction, color tools, templates, and expressions.'));
    const ok=await UI.modal('Optional components',body,[{label:'Keep current setup'},{label:'Confirm component choice',primary:true}]);
    try {if(ok)await set(input.checked); else if(!config.decided)await set(false);}
    catch(error){UI.toast('Could not save your component choice. '+error.message,6500);}
    return config.enabled;
  }
  async function open(){
    if(!config.enabled){if(!await choose())return;}
    await load();ShortForm.open();
  }
  async function init(){
    try{
      if(window.desktopComponents)config=await desktopComponents.info();
      else {const stored=JSON.parse(localStorage.getItem(key)||'{}');config={enabled:stored?.enabled===true,decided:stored?.decided===true};}
      if(!config.decided)await choose();
      await load();
    }catch(error){UI.toast(error.message,6000);}
    const button=U.el('button',{id:'btnShortForm',onclick:()=>open().catch(e=>UI.toast(e.message,6000))},'Short Form');
    document.getElementById('btnAddText').after(button);
  }
  return {init,choose,open,set,get enabled(){return config.enabled;}};
})();
