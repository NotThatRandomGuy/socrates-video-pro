import { launch } from './harness.mjs';
const {check,evalJs,results,errors,done}=await launch();
await check('welcome offers each entry point and survives repeated opening', `(async()=>{
  Startup.show({first:true}); await new Promise(r=>setTimeout(r,20));
  const labels=[...document.querySelectorAll('.welcome button')].map(b=>b.textContent);
  const ok=['Create New Project','Open Existing Project','Open File in Editor','Take the tutorial'].every(s=>labels.includes(s));
  Startup.show(); await new Promise(r=>setTimeout(r,20));
  const single=document.querySelectorAll('.modal-back').length===1; Startup.close(); return ok&&single;
})()`);
await check('tutorial next back and skip preserve the project', `(async()=>{
  const original=JSON.stringify(Project.serialize().project); Startup.tutorial();
  const click=label=>[...document.querySelectorAll('.modal-foot button')].find(b=>b.textContent===label).click();
  click('Next'); await new Promise(r=>setTimeout(r,0));
  click('Back'); await new Promise(r=>setTimeout(r,0));
  click('Skip tutorial'); await new Promise(r=>setTimeout(r,0));
  return !document.querySelector('.modal-back')&&!document.querySelector('.tour-highlight')&&JSON.stringify(state.project)===original;
})()`);
await check('all generated kinds, crop, LUT, curves and master mix survive downloaded save and reopen', `(async()=>{
  await Project.load({project:Model.newProject()});
  for(const kind of ['text','shape','sticker','solid','adjustment']) Cmd.addGenerated(kind,{}, {start:0});
  const c=allClips()[0],fx=Model.newEffect('blur');c.effects.push(fx);
  KF.set(c,KF.fxPath(fx,'radius'),0,2);KF.set(c,KF.fxPath(fx,'radius'),2,20);
  Cmd.cropCanvas({x:10,y:20,width:600,height:400});Cmd.addMarker(2,'Scene');
  state.masterVolume=.37;state.muted=true;
  const expected=Project.serialize();let saved;
  const download=U.download;U.download=b=>saved=b;
  try{if(!Project.save())return false;}finally{U.download=download;}
  await Project.load({project:Model.newProject()});
  const file=new File([saved],'roundtrip.vep.json',{type:'application/json'});
  if(!await Project.openFile(file))return false;
  return JSON.stringify(state.project)===JSON.stringify(expected.project)&&state.masterVolume===.37&&state.muted&&KF.fxValue(allClips()[0],allClips()[0].effects[0],'radius',1)===11;
})()`);
await check('serialize returns an independent project snapshot', `(()=>{
  const snapshot=Project.serialize(),width=snapshot.project.width;
  state.project.width+=2;const ok=snapshot.project.width===width;state.project.width=width;return ok;
})()`);
await check('BOM project files open and legacy defaults migrate', `(async()=>{
  const p=Model.newProject();p.tracks[0].clips=[{id:'legacy',kind:'shape',effects:[{id:'old-fx',type:'blur',params:{radius:3}}]}];
  const file=new File(['\\ufeff'+JSON.stringify({project:p})],'old.json');
  return await Project.openFile(file)&&findClip('legacy').effects[0].enabled&&findClip('legacy').shape.points===5;
})()`);
await check('malformed and future projects preserve current edit and undo', `(async()=>{
  Cmd.addGenerated('text');const before=JSON.stringify(state.project);
  for(const damage of [
    d=>d.version=99,d=>d.luts=[42],d=>d.mix={volume:3,muted:false},
    d=>d.project.tracks[0].clips[0].keyframes=null,
    d=>d.project.tracks[0].clips[0].transitionIn.duration=-2,
    d=>d.project.tracks[0].clips.push(null)
  ]){
    const data=Project.serialize();damage(data);
    try{await Project.load(data);return false;}catch{}
    if(JSON.stringify(state.project)!==before||!History.canUndo())return false;
  }return true;
})()`);
await check('legacy clip references become relinkable missing media', `(async()=>{
  const p=Model.newProject();p.tracks[0].clips.push(Model.newClip('video',{mediaId:'lost-source',name:'Original movie'}));
  await Project.load({project:p});
  return findMedia('lost-source')?.missing&&findMedia('lost-source').type==='video';
})()`);
await check('save failure leaves dirty work intact', `(()=>{
  state.dirty=true;const download=U.download;U.download=()=>{throw Error('download unavailable');};
  try{return Project.save()===false&&state.dirty;}finally{U.download=download;}
})()`);
await check('opening during export preserves the edit', `(async()=>{
  const original=state.project;state.exporting='webcodecs';
  try{await Project.load({project:Model.newProject()});return false;}catch{return state.project===original;}finally{state.exporting=false;}
})()`);
await check('tutorial can finish every step and reopen', `(async()=>{
  Startup.close();const tour=Startup.tutorial();
  for(let i=0;i<Startup.steps.length;i++){
    const label=i===Startup.steps.length-1?'Finish':'Next';
    [...document.querySelectorAll('.modal-foot button')].find(b=>b.textContent===label).click();
    await new Promise(r=>setTimeout(r,0));
  }
  await tour;return !document.querySelector('.tour-highlight')&&!document.querySelector('.modal-back');
})()`);
await check('cancelled welcome file picker returns to welcome without changing the edit', `(async()=>{
  const pick=U.pickFiles,original=state.project;U.pickFiles=async()=>[];
  try{
    Startup.show();document.querySelectorAll('.welcome-actions button')[2].click();
    await new Promise(r=>setTimeout(r,20));
    return !!document.querySelector('.welcome')&&state.project===original;
  }finally{U.pickFiles=pick;Startup.close();}
})()`);
await check('first startup tutorial preference persists', `(async()=>{
  await DB.set('tutorial-offered',false);await Startup.init(false);
  if(!document.querySelector('.welcome-first'))return false;
  Startup.close();await Startup.init(false);
  const ok=!document.querySelector('.welcome-first')&&!!document.querySelector('.welcome-tutorial');
  Startup.close();return ok;
})()`);
console.log('1.2.5 project and startup regressions');
for(const [name,result]of results)console.log(result+': '+name);
console.log('Console errors:',errors.length?errors:'(none)');
await done();process.exit(results.some(([,r])=>r!=='PASS')||errors.length?1:0);
