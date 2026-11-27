'use strict';
// Project rendering stays available when the optional authoring component is disabled.
const ShortFormRender=(()=>{
  function mask(clip,time){
    const keys=clip.shortForm?.maskKeys||[];
    if(!keys.length)return null;
    if(time<=keys[0].t)return keys[0].points;
    for(let i=1;i<keys.length;i++){
      if(time>keys[i].t)continue;
      const a=keys[i-1],b=keys[i],p=(time-a.t)/(b.t-a.t||1);
      if(a.points.length!==b.points.length)return a.points;
      return a.points.map((point,j)=>[point[0]+(b.points[j][0]-point[0])*p,point[1]+(b.points[j][1]-point[1])*p]);
    }
    return keys[keys.length-1].points;
  }
  function triangle(ctx,img,source,target){
    const [a,b,c]=source,[p,q,r]=target;
    const den=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
    if(Math.abs(den)<1e-8)return;
    const ux=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/den;
    const uy=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/den;
    const vx=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/den;
    const vy=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/den;
    ctx.save();ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);ctx.closePath();ctx.clip();
    ctx.transform(ux,uy,vx,vy,p[0]-ux*a[0]-vx*a[1],p[1]-uy*a[0]-vy*a[1]);ctx.drawImage(img,0,0);ctx.restore();
  }
  function draw(ctx,img,sx,sy,sw,sh,ox,oy,w,h,clip,time){
    const x=U.clamp(KF.has(clip,'shortForm.rotationX')?KF.value(clip,'shortForm.rotationX',time):clip.shortForm.rotationX,-80,80)*Math.PI/180;
    const y=U.clamp(KF.has(clip,'shortForm.rotationY')?KF.value(clip,'shortForm.rotationY',time):clip.shortForm.rotationY,-80,80)*Math.PI/180;
    const camera=Math.max(Math.abs(w),Math.abs(h),1)*2.5;
    const project=(u,v)=>{
      const px=(u-.5)*w,py=(v-.5)*h;
      const yy=py*Math.cos(x),z=py*Math.sin(x);
      const xx=px*Math.cos(y)+z*Math.sin(y),zz=-px*Math.sin(y)+z*Math.cos(y);
      const scale=camera/Math.max(camera*.2,camera-zz+clip.shortForm.depth);
      return [ox+w/2+xx*scale,oy+h/2+yy*scale];
    };
    const n=6;
    for(let row=0;row<n;row++)for(let col=0;col<n;col++){
      const uv=[[col/n,row/n],[(col+1)/n,row/n],[(col+1)/n,(row+1)/n],[col/n,(row+1)/n]];
      const src=uv.map(([u,v])=>[sx+u*sw,sy+v*sh]),dst=uv.map(([u,v])=>project(u,v));
      triangle(ctx,img,[src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);
      triangle(ctx,img,[src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
    }
  }
  return {mask,draw};
})();
