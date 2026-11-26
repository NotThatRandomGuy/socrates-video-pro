import fs from 'node:fs';
import {launch} from './harness.mjs';
const {check,evalJs,results,errors,done}=await launch();
for(const tag of ['v1.0.0','v1.1.0','v1.2.0','v1.2.5']) {
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/'+tag+'.json','utf8'));
 await evalJs('window.archive='+JSON.stringify(fixture));
 await check(tag+' project retains every original field through opening and saving',`(async()=>{
   function contains(actual,expected) {
     if(expected===null || typeof expected!=='object')return actual===expected;
     return Object.entries(expected).every(([key,value])=>contains(actual?.[key],value));
   }
   await Project.load(archive);
   const original=archive.project;
   if(!contains(state.project,original))return false;
   const saved=Project.serialize();
   await Project.load(JSON.parse(JSON.stringify(saved)));
   return contains(state.project,original) && saved.media.filter(m=>m.tags.includes('archive')).length===3
     && (Array.isArray(archive.luts)?saved.legacyLUTNames.includes('old-look.cube'):true);
 })()`);
}
await check('extension metadata survives reopen and save',`(async()=>{
 const data=Project.serialize();data.extension={labels:['keep'],nested:{value:123}};
 data.view.extraPanel='saved';data.media[0].customMetadata={note:'preserved'};
 await Project.load(data);const saved=Project.serialize();
 return saved.extension.nested.value===123 && saved.view.extraPanel==='saved' && saved.media[0].customMetadata.note==='preserved';
})()`);
for(const [name,result]of results)console.log(result+': '+name);
console.log('Console errors:',errors.length?errors:'(none)');
await done();process.exit(results.some(([,r])=>r!=='PASS')||errors.length?1:0);
