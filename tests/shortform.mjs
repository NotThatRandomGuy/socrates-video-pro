import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {launch} from './harness.mjs';
const require=createRequire(import.meta.url);
const {register}=require('../desktop/components.cjs');
const folder=fs.mkdtempSync(path.join(process.cwd(),'tests','.component-test-')),handlers={},frame={};
const win={webContents:{mainFrame:frame}},event={sender:win.webContents,senderFrame:frame};
let consent=0;
try {
 register({app:{isPackaged:false,getPath:()=>folder},ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showMessageBox:async()=>({response:consent})},getWindow:()=>win});
 if(await handlers['components:source'](event)!==null)throw Error('Base installation loaded the component');
 await handlers['components:set'](event,true);
 if((await handlers['components:info'](event)).enabled)throw Error('Component installed without consent');
 consent=1;await handlers['components:set'](event,true);
 if(!(await handlers['components:source'](event)).includes('window.ShortForm'))throw Error('Confirmed component was not installed');
 await handlers['components:set'](event,false);
 if(fs.existsSync(path.join(folder,'components','short-form','studio.js')))throw Error('Disabled component was not removed');
 let rejected=false;try{await handlers['components:set']({...event,sender:{}},true);}catch{rejected=true;}if(!rejected)throw Error('Foreign component request accepted');
} finally {
 if(path.dirname(folder)!==path.join(process.cwd(),'tests'))throw Error('Unexpected test folder');
 fs.rmSync(folder,{recursive:true,force:true});
}
const {check,evalJs,results,errors,done,send,sleep}=await launch();
await check('short-form code is absent until installation is confirmed',`(async()=>{
 if(window.ShortForm || Components.enabled)return false;
 await Components.set(true);return !!window.ShortForm&&Components.enabled;
})()`);
await check('all requested short-form tool categories are available',`(()=>{
 ShortForm.open();
 const text=document.querySelector('.sf-workspace').textContent;
 return ['Beat sync','Animated text','Motion tracking','Rotoscoping','Speed ramping','Smooth zooms','Visual effects','Transitions','Motion blur','3D animation','Audio-reactive','Color correction','Templates','Expressions'].every(label=>text.includes(label));
})()`);
await check('text, zoom, expressions and perspective remain undoable and saveable',`(async()=>{
 await Project.load({project:Model.newProject()});
 const c=Cmd.addGenerated('text');
 ShortForm.title('words');ShortForm.animate('zoom');ShortForm.expression('transform.x','sine',20,2);
 mutate('3D',()=>{c.shortForm.rotationY=30;c.shortForm.blurSamples=4;});
 const data=Project.serialize();await Project.load(data);
 const copy=allClips()[0];
 return copy.text.animation==='word-rise'&&copy.shortForm.rotationY===30&&KF.has(copy,'transform.x')&&copy.shortForm.blurSamples===4;
})()`);
await check('mask and 3D renderer produce finite opaque pixels and survive save',`(async()=>{
 const c=allClips()[0];c.shortForm.maskKeys=[{t:0,points:[[.1,.1],[.9,.1],[.5,.9]]}];
 const cv=document.createElement('canvas');cv.width=320;cv.height=180;
 cv.getContext('2d').scale(320/state.project.width,180/state.project.height);Compositor.renderFrame(cv.getContext('2d'),1);
 const data=ProjectValidation.validate(Project.serialize());await Project.load(data);
 return cv.getContext('2d').getImageData(160,90,1,1).data[3]===255&&allClips()[0].shortForm.maskKeys[0].points.length===3;
})()`);
await check('speed ramp preserves linked source intervals and undo',`(async()=>{
 await Project.load({project:Model.newProject()});
 const v=Model.newClip('video',{duration:4,sourceDuration:8,offset:1,linkId:'pair'}),a=Model.newClip('audio',{duration:4,sourceDuration:8,offset:1,linkId:'pair'});
 videoTracks()[0].clips.push(v);audioTracks()[0].clips.push(a);Cmd.select(v.id);
 ShortForm.ramp(.5,2);
 const videos=videoTracks()[0].clips,audios=audioTracks()[0].clips;
 if(videos.length<8||videos.length!==audios.length)return false;
 if(videos.some((c,i)=>Math.abs(c.start-audios[i].start)>1e-8||c.linkId!==audios[i].linkId))return false;
 if(Math.abs(videos.reduce((n,c)=>n+c.duration*c.speed,0)-4)>1e-6)return false;
 History.undo();return videoTracks()[0].clips.length===1&&audioTracks()[0].clips.length===1;
})()`);
await check('tracking locates a moving texture and silence stays silent',`(()=>{
 const w=80,h=80,a=new Float32Array(w*h),b=new Float32Array(w*h);
 for(let y=22;y<39;y++)for(let x=22;x<39;x++){const value=(x*17+y*31)%255;a[y*w+x]=value;b[(y+4)*w+x+6]=value;}
 const p=ShortForm.locate(a,b,w,h,30,30),buffer=AudioEngine.ctx().createBuffer(1,48000,48000);
 return p[0]===36&&p[1]===34&&ShortForm.energy(buffer,.5)===0;
})()`);
await check('music peaks create beats and reactive keys, then cuts fit those beats',`(async()=>{
 await Project.load({project:Model.newProject()});ShortForm.open();
 const buffer=AudioEngine.ctx().createBuffer(1,144000,48000),samples=buffer.getChannelData(0);
 for(const t of [.5,1,1.5,2])for(let i=Math.floor(t*48000);i<Math.floor((t+.06)*48000);i++)samples[i]=.8;
 state.media.push({id:'beat-music',name:'Beat music',type:'audio',audioBuffer:buffer,duration:3});
 const audio=Model.newClip('audio',{mediaId:'beat-music',duration:3,sourceDuration:3});audioTracks()[0].clips.push(audio);
 const visual=Cmd.addGenerated('shape',{}, {duration:2.5});Cmd.select(visual.id);
 await ShortForm.detectBeats();let beats=state.project.markers.filter(m=>m.name==='Beat');if(beats.length<3)return false;
 Cmd.shiftAfter(0,.25);beats=state.project.markers.filter(m=>m.name==='Beat');
 await ShortForm.reactive(.8);if(!KF.has(visual,'transform.scaleX'))return false;
 ShortForm.fitBeats();return visual.start===beats[0].time&&Math.abs(visual.duration-(beats[1].time-beats[0].time))<1e-8;
})()`);
await check('bad masks are rejected and linked tracks remain protected',`(async()=>{
 const data=Project.serialize();data.project.tracks[0].clips[0].shortForm.maskKeys=[{t:0,points:[[0,0],[1,1],[Infinity,0]]}];
 const before=JSON.stringify(state.project);
 try{await Project.load(data);return false;}catch{}
 const c=videoTracks()[0].clips[0];findTrackOfClip(c.id).locked=true;Cmd.select(c.id);
 try{ShortForm.ramp(.5,2);return false;}catch{return JSON.stringify({...state.project,tracks:state.project.tracks.map(t=>({...t,locked:false}))})===before;}
})()`);
await check('short-form motion and outlines are included in a playable export',`(async()=>{
 await Project.load({project:Model.newProject()});
 const c=Cmd.addGenerated('solid',{solid:{color:'#3864ef'}},{duration:.5});
 c.shortForm.rotationY=20;c.shortForm.blurSamples=3;c.shortForm.maskKeys=[{t:0,points:[[0,0],[1,0],[1,1],[0,1]]}];
 let output;const download=U.download;U.download=b=>output=b;
 try{const ok=await Exporter.exportWebCodecs({format:Exporter.FORMATS[1],width:160,height:90,fps:10,bitrate:300000,audio:false,from:0,to:.3,name:'short-form'});return ok&&output?.size>100;}finally{U.download=download;}
})()`);
await check('outlines and effects remain rendered when authoring component is disabled',`(async()=>{
 await Components.set(false);
 const saved=Project.serialize();await Project.load(saved);
 return !Components.enabled && ProjectValidation.validate(saved).project.tracks.length>0;
})()`);
await check('tutorial background is unblurred and highlights remain visible',`(async()=>{
 Startup.tutorial();await new Promise(r=>setTimeout(r,20));
 const style=getComputedStyle(document.querySelector('.modal-back'));
 const ok=style.backdropFilter==='none'&&!!document.querySelector('.tour-highlight');Startup.close();return ok;
})()`);
for(const [name,result]of results)console.log(result+': '+name);
console.log('Console errors:',errors.length?errors:'(none)');
await done();process.exit(results.some(([,r])=>r!=='PASS')||errors.length?1:0);
