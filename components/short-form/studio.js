'use strict';
window.ShortForm=(()=>{
  let panel=null,busy=false,cancel=false;
  function close(){panel?.remove();panel=null;cancel=true;}
  function clip(){
    const c=primaryClip();
    if(!c)throw Error('Select a clip on the timeline first');
    if(findTrackOfClip(c.id)?.locked)throw Error('Please unlock the selected track first');
    if(state.exporting)throw Error('Please finish your export first');
    return c;
  }
  function edit(label,fn){Player.pause();mutate(label,fn);Compositor.clearCaches();Events.emit('timeline:refresh');Player.requestRender();}
  function keys(c,path,values){
    KF.clear(c,path);
    for(const [time,value,ease='ease-in-out']of values)KF.set(c,path,time,value,ease);
  }
  function active(c,project){return !cancel && state.project===project && findClip(c.id)===c && !findTrackOfClip(c.id)?.locked;}
  function message(error){UI.toast(error.message||String(error),6500);}
  function button(label,action){return U.el('button',{onclick:async()=>{
    if(busy)return UI.toast('Please wait for the current analysis, or cancel it.');
    try{await action();}catch(error){message(error);}
  }},label);}
  function section(title,text,...controls){return U.el('section',{class:'sf-section'},U.el('h3',{},title),U.el('p',{class:'muted'},text),...controls);}
  function number(label,value,min,max,step=1){
    const input=U.el('input',{type:'number',value,min,max,step});
    return {input,el:U.el('label',{class:'sf-field'},label,input),value:()=>{
      const n=Number(input.value);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' must be between '+min+' and '+max);return n;
    }};
  }
  function select(label,choices){
    const input=U.el('select',{},choices.map(([value,text])=>U.el('option',{value},text)));
    return {input,el:U.el('label',{class:'sf-field'},label,input)};
  }
  function animate(preset){
    const c=clip(),d=c.duration;
    edit('Short-form motion',()=>{
      if(preset==='shake')keys(c,'transform.x',Array.from({length:Math.min(600,Math.ceil(d*30)+1)},(_,i)=>[Math.min(d,i/30),c.transform.x+Math.sin(i*2.4)*18,'linear']));
      if(preset==='zoom')keys(c,'transform.scaleX',[[0,1],[d,1.35]]);
      if(preset==='pan')keys(c,'transform.x',[[0,-100],[d,100]]);
      if(preset==='bounce')c.motion.preset='bounce-in';
    });
  }
  function title(preset){
    const c=clip();if(c.kind!=='text')throw Error('Select a text clip to animate');
    edit('Animated title',()=>{
      const presets={bounce:'char-pop',kinetic:'char-rise',words:'word-rise',shake:'wave',glow:'fade'};
      c.text.animation=presets[preset];c.text.animDuration=Math.min(1,c.duration);
      if(preset==='glow'){c.text.shadowBlur=24;c.text.shadowColor=c.text.color;c.text.shadowOpacity=1;}
    });
  }
  function generate(kind,over,name,start=state.currentTime,duration=2,track=null){
    const c=Model.newClip(kind,{name,start,duration,sourceDuration:duration});
    for(const [key,value]of Object.entries(over)){if(value && typeof value==='object'&&!Array.isArray(value))Object.assign(c[key],value);else c[key]=value;}
    const lane=track||Cmd.ensureTrack('video',videoTracks().length);lane.clips.push(c);return c;
  }
  function particles(style){
    if(state.exporting)throw Error('Please finish your export first');
    edit('Short-form visual overlay',()=>{
      const W=state.project.width,H=state.project.height,start=state.currentTime;
      const lane=Cmd.ensureTrack('video',videoTracks().length);lane.name='Short-form overlays';
      if(style==='lightning'){
        const c=generate('text',{text:{content:'ϟ',size:Math.min(W,H)*.8,color:'#c9ddff',shadowBlur:25,shadowColor:'#8ac8ff',shadowOpacity:1}},'Lightning',start,.6,lane);
        keys(c,'transform.opacity',[[0,0],[.04,1],[.12,.1],[.18,1],[.6,0]]);
      }else{
        const count=style==='explosion'?18:24;
        // Deterministic directions make preview and export identical.
        for(let i=0;i<count;i++){
          const angle=i/count*Math.PI*2,dist=Math.min(W,H)*(.2+(i%4)*.08);
          const c=generate('shape',{shape:{type:'ellipse',width:12+i%5*4,height:12+i%5*4,fill:style==='explosion'?'#ffb347':'#a9bcff'}},style==='explosion'?'Explosion spark':'Particle',start,1.2,lane);
          keys(c,'transform.x',[[0,0],[1.2,Math.cos(angle)*dist]]);
          keys(c,'transform.y',[[0,0],[1.2,Math.sin(angle)*dist+80]]);
          keys(c,'transform.opacity',[[0,1],[1.2,0]]);
          keys(c,'transform.scaleX',[[0,1],[1.2,.1]]);
        }
      }
      recalcDuration();
    });
  }
  function effect(type,pulse=false){
    const c=clip();
    edit('Short-form effect',()=>{
      const fx=Model.newEffect(type);c.effects.push(fx);
      if(pulse){const name=Object.keys(EFFECT_DEFS[type].params)[0];keys(c,KF.fxPath(fx,name),[[0,0],[Math.min(.1,c.duration/3),EFFECT_DEFS[type].params[name].max*.7],[Math.min(.4,c.duration),0]]);}
    });
  }
  function beatMarkers(times){
    edit('Beat markers',()=>{
      for(const time of times)if(!state.project.markers.some(m=>Math.abs(m.time-time)<.02))state.project.markers.push(Model.newMarker(time,'Beat','blue'));
      state.project.markers.sort((a,b)=>a.time-b.time);
      state.project.shortFormBeats=times;
    });
  }
  function energy(buffer,time){
    const data=buffer.getChannelData(0),center=Math.floor(time*buffer.sampleRate),half=Math.floor(buffer.sampleRate*.015);
    let sum=0,n=0;
    for(let i=Math.max(0,center-half);i<Math.min(data.length,center+half);i+=8){sum+=data[i]*data[i];n++;}
    return Math.sqrt(sum/Math.max(1,n));
  }
  async function audioClip(){
    const selected=selectedClips().find(c=>c.kind==='audio'),c=selected||audioTracks().flatMap(t=>t.clips).find(c=>c.enabled);
    if(!c)throw Error('Add a music clip to an audio track first');
    const m=findMedia(c.mediaId);if(m?.audioReady)await m.audioReady;
    if(!m?.audioBuffer)throw Error('Please relink music that can be decoded for beat analysis');
    return {c,buffer:m.audioBuffer};
  }
  async function detectBeats(){
    const project=state.project,{c,buffer}=await audioClip();
    if(project!==state.project)return;
    const step=.02,levels=[];
    for(let t=0;t<Math.min(c.duration,600);t+=step)levels.push(energy(buffer,c.offset+t*c.speed));
    const beats=[];let last=-1;
    for(let i=2;i<levels.length-2;i++){
      const local=levels.slice(Math.max(0,i-20),i),average=local.reduce((a,b)=>a+b,0)/Math.max(1,local.length);
      if(levels[i]>.01 && levels[i]>average*1.35 && levels[i]>=levels[i-1] && levels[i]>levels[i+1] && i*step-last>.18){last=i*step;beats.push(c.start+last);}
    }
    if(!beats.length)throw Error('No clear beats were found. Try the BPM grid or add markers manually.');
    beatMarkers(beats);UI.toast('Detected '+beats.length+' beat markers. Review them before fitting cuts.');
  }
  function fitBeats(){
    const project=state.project,beats=(project.shortFormBeats||[]).slice().sort((a,b)=>a-b);
    const seen=new Set();
    const targets=selectedClips().filter(c=>{const group=c.linkId||c.id;if(c.kind==='audio'||seen.has(group))return false;seen.add(group);return true;}).sort((a,b)=>a.start-b.start);
    if(!targets.length || beats.length<2)throw Error('Select visual clips and create at least two beat markers first');
    const members=new Set(targets.flatMap(c=>[c,...Cmd.linkedOf(c)]));
    if([...members].some(c=>findTrackOfClip(c.id)?.locked))throw Error('Unlock every linked track before fitting cuts');
    if(targets.length>=beats.length)throw Error('Create enough beat intervals for the selected clips');
    edit('Fit cuts to beats',()=>{
      targets.forEach((c,i)=>{
        const duration=beats[i+1]-beats[i];
        for(const item of [c,...Cmd.linkedOf(c)]){
          if(!isUnbounded(item) && item.offset+duration*item.speed>item.sourceDuration+.001)throw Error('A source is too short for this beat interval');
          item.start=beats[i];item.duration=duration;
        }
      });
      recalcDuration();
    });
  }
  function ramp(startRate,endRate){
    const c=clip();
    if(!['video','audio'].includes(c.kind))throw Error('Choose video or audio for a speed ramp');
    const family=[c,...Cmd.linkedOf(c)];
    if(family.some(item=>Math.abs(item.speed-c.speed)>.0001))throw Error('Match the linked clip speeds before applying a ramp');
    if(family.some(item=>findTrackOfClip(item.id)?.locked))throw Error('Unlock linked tracks before ramping speed');
    if(family.some(item=>Math.abs(item.start-c.start)>.001||Math.abs(item.duration-c.duration)>.001))throw Error('Align the linked clips before ramping them');
    const originalStart=c.start,oldDuration=c.duration;
    edit('Speed ramp',()=>{
      const steps=Math.min(60,Math.max(8,Math.ceil(oldDuration*12))),segments=[];
      let timeline=originalStart;
      for(let i=0;i<steps;i++){
        const sourcePart=oldDuration*c.speed/steps,rate=startRate+(endRate-startRate)*(i+.5)/steps;
        const duration=sourcePart/rate,link=U.uid('ramp');
        for(const original of family){
          const piece=U.deepClone(original),time=i*oldDuration/steps;
          piece.id=U.uid('c');piece.start=timeline;piece.offset=original.offset+time*original.speed;
          piece.duration=duration;piece.speed=rate;piece.linkId=family.length>1?link:null;
          KF.shift(piece,-time);KF.scale(piece,original.speed/rate);
          if(i)piece.transitionIn.type='none';if(i<steps-1)piece.transitionOut.type='none';
          segments.push({track:findTrackOfClip(original.id),piece});
        }
        timeline+=duration;
      }
      for(const original of family){const track=findTrackOfClip(original.id);track.clips=track.clips.filter(item=>item!==original);Media.releaseClip(original.id);}
      // Ripple the duration difference once, respecting locked tracks.
      Cmd.shiftAfter(originalStart+oldDuration,timeline-originalStart-oldDuration);
      for(const {track,piece}of segments)track.clips.push(piece);
      state.selection=new Set(segments.map(s=>s.piece.id));recalcDuration();
    });
  }
  function expression(path,mode,amplitude,frequency){
    const c=clip();
    if(!['transform.x','transform.y','transform.rotation','transform.scaleX','transform.opacity'].includes(path))throw Error('Choose a supported animation channel');
    const base=U.getPath(c,path),samples=Math.min(1200,Math.ceil(c.duration*30)+1);
    edit('Bake expression',()=>{
      const values=[];
      for(let i=0;i<samples;i++){
        const t=c.duration*i/Math.max(1,samples-1);
        let value=mode==='linear'?base+amplitude*t:mode==='pulse'?base+amplitude*Math.max(0,Math.sin(t*frequency*Math.PI*2)):base+amplitude*Math.sin(t*frequency*Math.PI*2);
        if(path==='transform.opacity')value=U.clamp(value,0,1);
        if(path==='transform.scaleX')value=Math.max(.01,value);
        values.push([t,value,'linear']);
      }
      keys(c,path,values);
    });
  }
  async function reactive(amplitude){
    const target=clip(),project=state.project,{c,buffer}=await audioClip();
    if(!active(target,project))return;
    const values=[],n=Math.min(1200,Math.ceil(target.duration*30)+1);
    for(let i=0;i<n;i++){
      const t=target.duration*i/Math.max(1,n-1),global=target.start+t;
      const level=global<c.start||global>clipEnd(c)?0:energy(buffer,c.offset+(global-c.start)*c.speed);
      values.push([t,target.transform.scaleX+level*amplitude,'linear']);
    }
    edit('Audio-reactive scale',()=>keys(target,'transform.scaleX',values));
  }
  async function sourceFrame(c,time){
    const m=findMedia(c.mediaId);
    if(c.kind==='video')return Media.grabFrame(m,c.offset+time*c.speed,480);
    if(c.kind==='image' && m?.el){const cv=document.createElement('canvas');cv.width=480;cv.height=Math.max(2,Math.round(480*m.height/m.width));cv.getContext('2d').drawImage(m.el,0,0,cv.width,cv.height);return cv;}
    throw Error('Select a video or image source');
  }
  async function outline(){
    const c=clip(),project=state.project,time=U.clamp(state.currentTime-c.start,0,c.duration),frame=await sourceFrame(c,time);
    if(!frame || !active(c,project))return;
    const points=[],cv=U.el('canvas',{width:frame.width,height:frame.height,class:'sf-source-canvas'}),ctx=cv.getContext('2d');
    function paint(){ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(frame,0,0);ctx.beginPath();points.forEach(([x,y],i)=>{if(i)ctx.lineTo(x*cv.width,y*cv.height);else ctx.moveTo(x*cv.width,y*cv.height);});ctx.closePath();ctx.strokeStyle='#80ffb0';ctx.lineWidth=2;ctx.stroke();}
    cv.onclick=e=>{if(points.length>=128)return;const r=cv.getBoundingClientRect();points.push([U.clamp((e.clientX-r.left)/r.width,0,1),U.clamp((e.clientY-r.top)/r.height,0,1)]);paint();};
    paint();
    const invert=U.el('input',{type:'checkbox',checked:c.shortForm.invertMask});
    const ok=await UI.modal('Draw a rotoscoping outline',U.el('div',{},U.el('p',{},'Click around the subject. Add another outline at a later playhead position to animate it. Use the same number and order of points for smooth interpolation.'),cv,button('Undo last point',()=>{points.pop();paint();}),U.el('label',{class:'update-optout'},invert,'Hide the outlined area instead')),[{label:'Cancel'},{label:'Save outline',primary:true}],{width:560});
    if(!ok||!active(c,project))return;
    if(points.length<3)throw Error('Please draw at least three points');
    if(c.shortForm.maskKeys.length>=1000&&!c.shortForm.maskKeys.some(k=>Math.abs(k.t-time)<.001))throw Error('This clip already has 1000 outlines');
    if(c.shortForm.maskKeys.some(k=>k.points.length!==points.length))throw Error('Use the same point count as the existing outlines, or clear them first');
    edit('Rotoscoping outline',()=>{
      c.shortForm.maskKeys=c.shortForm.maskKeys.filter(k=>Math.abs(k.t-time)>.001);
      c.shortForm.maskKeys.push({t:time,points});c.shortForm.maskKeys.sort((a,b)=>a.t-b.t);c.shortForm.invertMask=invert.checked;
    });
  }
  function grayscale(cv){
    const pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,result=new Float32Array(cv.width*cv.height);
    for(let i=0;i<result.length;i++)result[i]=(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3;
    return result;
  }
  function locate(previous,current,width,height,x,y){
    let best=Infinity,bx=x,by=y;
    for(let dy=-18;dy<=18;dy+=2)for(let dx=-18;dx<=18;dx+=2){
      const nx=Math.round(x+dx),ny=Math.round(y+dy);
      if(nx<7||ny<7||nx>=width-7||ny>=height-7)continue;
      let score=0;
      for(let py=-6;py<=6;py+=2)for(let px=-6;px<=6;px+=2)score+=Math.abs(previous[(Math.round(y)+py)*width+Math.round(x)+px]-current[(ny+py)*width+nx+px]);
      score+=(dx*dx+dy*dy)*.001;
      if(score<best){best=score;bx=nx;by=ny;}
    }
    return [bx,by];
  }
  async function track(){
    const target=clip(),project=state.project;
    const source=Compositor.visibleSpans().map(s=>s.clip).find(c=>c.kind==='video'&&c!==target&&state.currentTime>=c.start&&state.currentTime<clipEnd(c));
    if(!source)throw Error('Place a text, image, or graphic above a video at the playhead, then select the overlay');
    const start=Math.max(target.start,source.start,state.currentTime),end=Math.min(clipEnd(target),clipEnd(source),start+30);
    await Exporter.seekAll(start);
    const first=await sourceFrame(source,start-source.start);if(!first || !active(target,project))return;
    let point=null;
    first.className='sf-source-canvas';first.onclick=e=>{const r=first.getBoundingClientRect();point=[(e.clientX-r.left)/r.width*first.width,(e.clientY-r.top)/r.height*first.height];};
    const ok=await UI.modal('Choose a tracking point',U.el('div',{},U.el('p',{},'Click a textured point on the moving object, then Track. This follows position for up to 30 seconds. Review the result when the object is obscured or changes shape.'),first),[{label:'Cancel'},{label:'Track',primary:true}]);
    if(!ok||!point||!active(target,project))return;
    point=[U.clamp(point[0],8,first.width-9),U.clamp(point[1],8,first.height-9)];
    const globalPoint=(position,width,height,time)=>{
      const bounds=Compositor.clipBounds(source,time),crop=bounds.e.crop;
      const u=(position[0]/width-crop.l)/Math.max(.001,1-crop.l-crop.r),v=(position[1]/height-crop.t)/Math.max(.001,1-crop.t-crop.b);
      return U.rotatePoint(bounds.x-bounds.ax*bounds.w+(u-.5)*bounds.w,bounds.y-bounds.ay*bounds.h+(v-.5)*bounds.h,bounds.x,bounds.y,bounds.rot);
    };
    const initial=globalPoint(point,first.width,first.height,start),base=evalClip(target,start),valuesX=[],valuesY=[];
    let previous=grayscale(first),lastSize=[first.width,first.height];
    busy=true;cancel=false;
    try{
      for(let time=start;time<end;time+=.1){
        if(!active(target,project)||findClip(source.id)!==source)throw Error('Tracking cancelled');
        const frame=await sourceFrame(source,time-source.start);
        if(!frame||frame.width!==lastSize[0]||frame.height!==lastSize[1])throw Error('The source frame could not be read');
        const current=grayscale(frame);point=locate(previous,current,frame.width,frame.height,...point);previous=current;
        const position=globalPoint(point,frame.width,frame.height,time);
        valuesX.push([time-target.start,base.x+position[0]-initial[0],'linear']);
        valuesY.push([time-target.start,base.y+position[1]-initial[1],'linear']);
      }
      if(active(target,project))edit('Track overlay position',()=>{keys(target,'transform.x',valuesX);keys(target,'transform.y',valuesY);});
    }finally{busy=false;}
  }
  function template(kind){
    if(state.exporting)throw Error('Please finish your export first');
    edit('Short-form template',()=>{
      if(kind==='vertical'){state.project.width=1080;state.project.height=1920;delete state.project.canvasCrop;Events.emit('project:resized');return;}
      const caption=generate('text',{text:{content:kind==='caption'?'YOUR CAPTION HERE':'YOUR NEXT STORY',size:kind==='caption'?68:110,animation:'word-rise',bgOpacity:.7,bgColor:'#10131b',bgPadding:22},transform:{y:kind==='caption'?state.project.height*.3:0}},kind==='caption'?'Caption template':'Animated intro',state.currentTime,3);
      keys(caption,'transform.opacity',[[0,0],[.2,1],[2.7,1],[3,0]]);recalcDuration();Cmd.select(caption.id);
    });
  }
  function open(){
    panel?.remove();cancel=false;
    const bpm=number('BPM',120,30,300),from=number('Start speed',.5,.05,16,.05),to=number('End speed',2,.05,16,.05);
    const rotationX=number('Tilt X',20,-80,80),rotationY=number('Tilt Y',-25,-80,80),depth=number('Depth',0,-10000,10000,10);
    const channel=select('Channel',[['transform.x','Position X'],['transform.y','Position Y'],['transform.rotation','Rotation'],['transform.scaleX','Scale'],['transform.opacity','Opacity']]);
    const formula=select('Expression',[['sine','base + amplitude × sin(2π × frequency × time)'],['pulse','Positive pulse'],['linear','base + amplitude × time']]);
    const amplitude=number('Amplitude',20,0,1000,.1),frequency=number('Frequency (Hz)',2,.05,30,.05);
    const body=U.el('div',{class:'sf-tools'},
      section('Beat sync','Analyze up to ten minutes of music, review markers, then fit selected visual cuts. Linked audio follows.',bpm.el,button('Detect music beats',detectBeats),button('Create BPM grid',()=>{const interval=60/bpm.value(),times=[];for(let t=state.currentTime;t<Math.min(Math.max(state.duration,state.currentTime+30),state.currentTime+600);t+=interval)times.push(t);beatMarkers(times);}),button('Fit selected cuts to beats',fitBeats)),
      section('Animated text','Select a text clip and choose a reusable animation.',...['bounce','shake','glow','kinetic','words'].map(p=>button(p.charAt(0).toUpperCase()+p.slice(1),()=>title(p)))),
      section('Motion tracking','Attach selected text or a graphic to a moving video point.',button('Track selected overlay',track),U.el('button',{onclick:()=>{cancel=true;}},'Cancel analysis')),
      section('Rotoscoping and masking','Draw a subject outline at the playhead. Repeat at other times to animate the cutout.',button('Draw animated outline',outline),button('Clear outlines',()=>{const c=clip();edit('Clear outlines',()=>c.shortForm.maskKeys=[]);}),button('Add rectangle / ellipse mask',()=>effect('mask'))),
      section('Speed ramping','Bake a gradual rate change into linked video/audio segments. Undo restores the original clips.',from.el,to.el,button('Apply speed ramp',()=>ramp(from.value(),to.value()))),
      section('Smooth zooms and shakes','Animate selected clip transforms.',button('Smooth zoom',()=>animate('zoom')),button('Smooth pan',()=>animate('pan')),button('Screen shake',()=>animate('shake'))),
      section('Visual effects','Create editable overlays or add effects to a selected clip.',button('Glitch',()=>effect('chromatic',true)),button('Distortion',()=>effect('wave',true)),button('Explosion sparks',()=>particles('explosion')),button('Lightning',()=>particles('lightning')),button('Particles',()=>particles('particles'))),
      section('Transitions','Apply to selected clips. Fine-tune duration in the Inspector.',...['wipe-left','spin','zoom-in','dissolve','push-left'].map(type=>button(type,()=>Cmd.applyTransitionBetweenSelected(type,.35)))),
      section('Motion blur','Add transform motion trails to keyframed movement.',button('Enable motion blur',()=>{const c=clip();edit('Motion blur',()=>c.shortForm.blurSamples=6);}),button('Disable motion blur',()=>{const c=clip();edit('Motion blur',()=>c.shortForm.blurSamples=1);})),
      section('3D animation','Project text or graphics as a plane with perspective. Change at the playhead to keyframe an existing animation.',rotationX.el,rotationY.el,depth.el,button('Apply 3D perspective',()=>{const c=clip();edit('3D perspective',()=>{for(const [path,value]of [['shortForm.rotationX',rotationX.value()],['shortForm.rotationY',rotationY.value()],['shortForm.depth',depth.value()]]){if(KF.has(c,path))KF.set(c,path,state.currentTime-c.start,value);else U.setPath(c,path,value);}});}),button('Animate a 3D turn',()=>{const c=clip();edit('3D turn',()=>{keys(c,'shortForm.rotationY',[[0,-60],[c.duration,60]]);});})),
      section('Audio-reactive effects','Bake music amplitude into selected visual clip scale.',button('React to music',()=>reactive(.8))),
      section('Color correction','Add adjustable grading controls to the selected clip.',button('Color correction',()=>effect('color')),button('Lift / gamma / gain',()=>effect('wheels')),button('LUT grading',()=>effect('lut'))),
      section('Templates','Build reusable vertical canvases, captions, and animated intros.',button('9:16 reel canvas',()=>template('vertical')),button('Caption template',()=>template('caption')),button('Animated intro',()=>template('intro'))),
      section('Expressions','Safely bake a supported formula into editable keyframes.',channel.el,formula.el,amplitude.el,frequency.el,button('Bake expression',()=>expression(channel.input.value,formula.input.value,amplitude.value(),frequency.value()))));
    panel=U.el('aside',{class:'sf-workspace',role:'region','aria-label':'Short Form Studio'},U.el('header',{},U.el('h2',{},'Short Form Studio'),U.el('button',{onclick:close,'aria-label':'Close Short Form Studio'},'×')),body);
    document.body.append(panel);
  }
  return {open,close,locate,energy,ramp,expression,detectBeats,fitBeats,reactive,animate,title,particles,template};
})();
