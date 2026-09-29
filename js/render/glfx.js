/* ============================================================
   GLFX — WebGL2 multi-pass effect processor
   process(source, w, h, fxList, time) -> canvas with effects applied
============================================================ */
'use strict';

const GLFX = (() => {
  const T = { COPY: 0, COLOR: 1, WHEELS: 2, LEVELS: 3, LUT: 4, CHROMA: 5, LUMAKEY: 6, VIGNETTE: 7, GRAIN: 8, PIXELATE: 9, POSTERIZE: 10, INVERT: 11, SEPIA: 12, MONO: 13, CHROMATIC: 14, MIRROR: 15, FLIP: 16, WAVE: 17, MASK: 18, BLUR: 19, SHARPEN: 20, THRESHOLD: 21, ADD: 22 };
  const VS = `#version 300 es
  in vec2 a_pos; out vec2 v_uv; uniform float u_flip;
  void main(){ v_uv = a_pos*.5+.5; if(u_flip>.5) v_uv.y = 1.0-v_uv.y; gl_Position = vec4(a_pos,0.,1.); }`;
  const FS = `#version 300 es
  precision highp float;
  in vec2 v_uv; out vec4 outColor;
  uniform sampler2D u_tex; uniform sampler2D u_tex2; uniform sampler2D u_lut;
  uniform vec2 u_res; uniform int u_type; uniform float u_p[16]; uniform vec3 u_color; uniform float u_time; uniform float u_lutSize; uniform vec2 u_dir; uniform float u_w[13];
  vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
  vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
  float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  vec2 chroma(vec3 c){ return vec2(-.169*c.r-.331*c.g+.5*c.b, .5*c.r-.419*c.g-.081*c.b); }
  vec4 lut3d(vec3 c){ float N=u_lutSize; c=clamp(c,0.,1.)*(N-1.); float bf=floor(c.b), bc=min(bf+1.,N-1.), f=c.b-bf;
    vec2 uv0=vec2((bf*N + c.r + .5)/(N*N), (c.g+.5)/N); vec2 uv1=vec2((bc*N + c.r + .5)/(N*N), (c.g+.5)/N);
    return mix(texture(u_lut,uv0),texture(u_lut,uv1),f); }
  void main(){
    vec2 uv=v_uv; vec4 col=vec4(0.);
    if(u_type==${T.COLOR}){ col=texture(u_tex,uv); vec3 c=col.rgb;
      c*=pow(2.,u_p[0]); c+=u_p[1]/100.*.5; c=(c-.5)*(1.+u_p[2]/100.)+.5;
      c.r+=u_p[5]/100.*.15; c.b-=u_p[5]/100.*.15; c.g+=u_p[6]/100.*.12;
      float l=luma(c); c+=u_p[9]/100.*.5*(1.-smoothstep(0.,.6,l)); c+=u_p[8]/100.*.5*smoothstep(.4,1.,l);
      l=luma(c); c=mix(vec3(l),c,1.+u_p[3]/100.);
      float sat=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)); c=mix(vec3(luma(c)),c,1.+u_p[4]/100.*(1.-sat));
      if(abs(u_p[7])>.01){ vec3 h=rgb2hsv(clamp(c,0.,1.)); h.x=fract(h.x+u_p[7]/360.); c=hsv2rgb(h); }
      c=pow(max(c,0.),vec3(1./max(u_p[10],.01))); col.rgb=clamp(c,0.,1.); }
    else if(u_type==${T.WHEELS}){ col=texture(u_tex,uv); vec3 lift=vec3(u_p[0],u_p[1],u_p[2]), gam=vec3(u_p[3],u_p[4],u_p[5]), gain=vec3(u_p[6],u_p[7],u_p[8]);
      vec3 c=col.rgb; c=gain*(c+lift*(1.-c)); c=pow(max(c,0.),1./max(gam,vec3(.01))); col.rgb=clamp(c,0.,1.); }
    else if(u_type==${T.LEVELS}){ col=texture(u_tex,uv); vec3 c=(col.rgb-u_p[0])/max(u_p[1]-u_p[0],.001); c=clamp(c,0.,1.); col.rgb=u_p[2]+c*(u_p[3]-u_p[2]); }
    else if(u_type==${T.LUT}){ col=texture(u_tex,uv); col.rgb=mix(col.rgb,lut3d(col.rgb).rgb,u_p[0]); }
    else if(u_type==${T.CHROMA}){ col=texture(u_tex,uv); vec2 cc=chroma(col.rgb), kc=chroma(u_color); float d=distance(cc,kc)*2.2;
      float a=smoothstep(u_p[0],u_p[0]+max(u_p[1],.001),d); float desat=u_p[2]*(1.-smoothstep(u_p[0],u_p[0]+u_p[1]+.35,d)); col.rgb=mix(col.rgb,vec3(luma(col.rgb)),desat); col.a*=a; }
    else if(u_type==${T.LUMAKEY}){ col=texture(u_tex,uv); float a=smoothstep(u_p[0],u_p[0]+max(u_p[1],.001),luma(col.rgb)); if(u_p[2]>.5)a=1.-a; col.a*=a; }
    else if(u_type==${T.VIGNETTE}){ col=texture(u_tex,uv); float d=distance(uv,vec2(.5))*1.4142; float v=smoothstep(u_p[1]-u_p[2],u_p[1]+u_p[2]*.5,d); col.rgb*=1.-u_p[0]*v; }
    else if(u_type==${T.GRAIN}){ col=texture(u_tex,uv); float n=rnd(uv*u_res+fract(u_time)*100.); col.rgb+=(n-.5)*u_p[0]*.6*(1.-abs(luma(col.rgb)-.5)); }
    else if(u_type==${T.PIXELATE}){ float s=max(u_p[0],1.); vec2 g=(floor(uv*u_res/s)+.5)*s/u_res; col=texture(u_tex,g); }
    else if(u_type==${T.POSTERIZE}){ col=texture(u_tex,uv); float L=max(u_p[0],2.); col.rgb=floor(col.rgb*L)/(L-1.); }
    else if(u_type==${T.INVERT}){ col=texture(u_tex,uv); col.rgb=mix(col.rgb,1.-col.rgb,u_p[0]); }
    else if(u_type==${T.SEPIA}){ col=texture(u_tex,uv); vec3 s=vec3(dot(col.rgb,vec3(.393,.769,.189)),dot(col.rgb,vec3(.349,.686,.168)),dot(col.rgb,vec3(.272,.534,.131))); col.rgb=mix(col.rgb,clamp(s,0.,1.),u_p[0]); }
    else if(u_type==${T.MONO}){ col=texture(u_tex,uv); col.rgb=mix(col.rgb,vec3(luma(col.rgb)),u_p[0]); }
    else if(u_type==${T.CHROMATIC}){ vec2 o=(uv-.5)*u_p[0]/u_res*4.; col=texture(u_tex,uv); col.r=texture(u_tex,uv+o).r; col.b=texture(u_tex,uv-o).b; }
    else if(u_type==${T.MIRROR}){ if(u_p[0]>.5) uv.x=uv.x<.5?uv.x:1.-uv.x; if(u_p[1]>.5) uv.y=uv.y<.5?uv.y:1.-uv.y; col=texture(u_tex,uv); }
    else if(u_type==${T.FLIP}){ if(u_p[0]>.5) uv.x=1.-uv.x; if(u_p[1]>.5) uv.y=1.-uv.y; col=texture(u_tex,uv); }
    else if(u_type==${T.WAVE}){ uv.x+=sin(uv.y*u_p[1]*6.2831+u_time*u_p[2])*u_p[0]; uv.y+=cos(uv.x*u_p[1]*6.2831+u_time*u_p[2])*u_p[0]*.5; col=texture(u_tex,clamp(uv,0.,1.)); }
    else if(u_type==${T.MASK}){ col=texture(u_tex,uv); vec2 p=(uv-vec2(u_p[1],u_p[2]))*u_res; float r=-u_p[6]*3.14159/180.; p=vec2(p.x*cos(r)-p.y*sin(r),p.x*sin(r)+p.y*cos(r));
      vec2 half_=max(vec2(u_p[3],u_p[4])*u_res*.5,vec2(.5)); float sd;
      if(u_p[0]<.5){ vec2 q=abs(p)-half_; sd=length(max(q,0.))+min(max(q.x,q.y),0.); }
      else if(u_p[0]<1.5){ float m=min(half_.x,half_.y); sd=(length(p/half_)-1.)*m; }
      else { float rr=min(half_.x,half_.y)*.35; vec2 q=abs(p)-half_+rr; sd=length(max(q,0.))+min(max(q.x,q.y),0.)-rr; }
      float f=max(u_p[5]*min(u_res.x,u_res.y),.5); float a=1.-smoothstep(-f,f,sd); if(u_p[7]>.5)a=1.-a; col.a*=a; }
    else if(u_type==${T.BLUR}){ vec2 px=u_dir/u_res; col=texture(u_tex,uv)*u_w[0]; for(int i=1;i<=6;i++){ float o=float(i)*u_p[0]; col+=texture(u_tex,uv+px*o)*u_w[i]; col+=texture(u_tex,uv-px*o)*u_w[i]; } }
    else if(u_type==${T.SHARPEN}){ vec2 px=1./u_res; vec4 c=texture(u_tex,uv); vec4 n=texture(u_tex,uv+vec2(0.,px.y))+texture(u_tex,uv-vec2(0.,px.y))+texture(u_tex,uv+vec2(px.x,0.))+texture(u_tex,uv-vec2(px.x,0.)); col=c; col.rgb=clamp(c.rgb*(1.+4.*u_p[0])-n.rgb*u_p[0],0.,1.); }
    else if(u_type==${T.THRESHOLD}){ col=texture(u_tex,uv); float l=luma(col.rgb); col.rgb*=smoothstep(u_p[0]-.1,u_p[0]+.1,l); }
    else if(u_type==${T.ADD}){ col=texture(u_tex,uv); vec4 g=texture(u_tex2,uv); col.rgb=clamp(col.rgb+g.rgb*u_p[0],0.,1.); }
    else { col=texture(u_tex,uv); }
    outColor=col;
  }`;

  let gl, canvas, prog, loc = {}, texSrc, fbs = [], quad, ok = false, lutTextures = new Map();
  const MAX = 2048;

  function init() {
    try {
      canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
      gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
      if (!gl) return false;
      const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      ['u_tex', 'u_tex2', 'u_lut', 'u_res', 'u_type', 'u_p', 'u_color', 'u_time', 'u_lutSize', 'u_dir', 'u_w', 'u_flip'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      texSrc = mkTex(); for (let i = 0; i < 3; i++) { const t = mkTex(); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); fbs.push({ fb, tex: t, w: 0, h: 0 }); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.uniform1i(loc.u_tex, 0); gl.uniform1i(loc.u_tex2, 1); gl.uniform1i(loc.u_lut, 2);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      ok = true;
    } catch (e) { console.warn('GLFX unavailable', e); ok = false; }
    return ok;
  }
  function mkTex() { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function sizeFb(f, w, h) { if (f.w === w && f.h === h) return; gl.bindTexture(gl.TEXTURE_2D, f.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); f.w = w; f.h = h; }

  const P = new Float32Array(16), W = new Float32Array(13);
  function setP(arr) { P.fill(0); arr.forEach((v, i) => P[i] = +v || 0); gl.uniform1fv(loc.u_p, P); }
  function pass(type, srcTex, dst, w, h, extra = {}) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null); if (dst) sizeFb(dst, w, h);
    gl.viewport(0, 0, w, h); gl.uniform1i(loc.u_type, type); gl.uniform2f(loc.u_res, w, h); gl.uniform1f(loc.u_flip, dst ? 0 : 1);
    gl.uniform2f(loc.u_dir, extra.dir ? extra.dir[0] : 0, extra.dir ? extra.dir[1] : 0);
    if (extra.color) { const [r, g, b] = U.hexToRgb(extra.color); gl.uniform3f(loc.u_color, r / 255, g / 255, b / 255); }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    if (extra.tex2) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, extra.tex2); }
    if (extra.lut) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, extra.lut.tex); gl.uniform1f(loc.u_lutSize, extra.lut.size); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function gaussWeights(sigma) { let sum = 0; for (let i = 0; i <= 6; i++) { W[i] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += i ? 2 * W[i] : W[i]; } for (let i = 0; i <= 6; i++) W[i] /= sum; gl.uniform1fv(loc.u_w, W); }
  function blur(radius, src, a, b, w, h) {
    // returns fb holding result; iterative separable gaussian
    let cur = src, iters = Math.max(1, Math.ceil(radius / 12)), r = radius / iters, step = Math.max(1, r / 6);
    gaussWeights(Math.max(.5, r / 2.2)); setP([step]);
    for (let i = 0; i < iters; i++) { pass(T.BLUR, cur, a, w, h, { dir: [1, 0] }); pass(T.BLUR, a.tex, b, w, h, { dir: [0, 1] }); cur = b.tex;[a, b] = [b, a]; }
    return cur;
  }

  /* fxList: [{type, p:{...numeric}, color, lut}] ; returns canvas or null */
  function process(source, sw, sh, fxList, time = 0) {
    if (!ok && !init()) return null;
    if (!sw || !sh) return null;
    const scale = Math.min(1, MAX / Math.max(sw, sh)); const w = Math.max(2, Math.round(sw * scale)), h = Math.max(2, Math.round(sh * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.useProgram(prog); gl.uniform1f(loc.u_time, time);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texSrc);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch (e) { return null; }
    let cur = texSrc; let [A, B, C] = fbs; const swap = () => { [A, B] = [B, A]; };
    const steps = fxList.filter(f => f && f.type !== 'dropshadow');
    for (const f of steps) {
      const p = f.p || {};
      switch (f.type) {
        case 'color': setP([p.exposure, p.brightness, p.contrast, p.saturation, p.vibrance, p.temperature, p.tint, p.hue, p.highlights, p.shadows, p.gamma ?? 1]); pass(T.COLOR, cur, A, w, h); cur = A.tex; swap(); break;
        case 'wheels': setP([p.liftR, p.liftG, p.liftB, p.gammaR ?? 1, p.gammaG ?? 1, p.gammaB ?? 1, p.gainR ?? 1, p.gainG ?? 1, p.gainB ?? 1]); pass(T.WHEELS, cur, A, w, h); cur = A.tex; swap(); break;
        case 'curves': setP([p.inBlack, p.inWhite ?? 1, p.outBlack, p.outWhite ?? 1]); pass(T.LEVELS, cur, A, w, h); cur = A.tex; swap(); break;
        case 'lut': if (f.lut) { setP([p.intensity ?? 1]); pass(T.LUT, cur, A, w, h, { lut: f.lut }); cur = A.tex; swap(); } break;
        case 'chromakey': setP([p.similarity, p.smoothness, p.spill]); pass(T.CHROMA, cur, A, w, h, { color: f.color || '#00ff00' }); cur = A.tex; swap(); break;
        case 'lumakey': setP([p.threshold, p.softness, p.invert]); pass(T.LUMAKEY, cur, A, w, h); cur = A.tex; swap(); break;
        case 'vignette': setP([p.amount, p.size, p.softness]); pass(T.VIGNETTE, cur, A, w, h); cur = A.tex; swap(); break;
        case 'grain': setP([p.amount]); pass(T.GRAIN, cur, A, w, h); cur = A.tex; swap(); break;
        case 'pixelate': setP([p.size * scale]); pass(T.PIXELATE, cur, A, w, h); cur = A.tex; swap(); break;
        case 'posterize': setP([p.levels]); pass(T.POSTERIZE, cur, A, w, h); cur = A.tex; swap(); break;
        case 'invert': setP([p.amount]); pass(T.INVERT, cur, A, w, h); cur = A.tex; swap(); break;
        case 'sepia': setP([p.amount]); pass(T.SEPIA, cur, A, w, h); cur = A.tex; swap(); break;
        case 'mono': setP([p.amount]); pass(T.MONO, cur, A, w, h); cur = A.tex; swap(); break;
        case 'chromatic': setP([p.amount * scale]); pass(T.CHROMATIC, cur, A, w, h); cur = A.tex; swap(); break;
        case 'mirror': setP([p.horizontal, p.vertical]); pass(T.MIRROR, cur, A, w, h); cur = A.tex; swap(); break;
        case 'flip': setP([p.horizontal, p.vertical]); pass(T.FLIP, cur, A, w, h); cur = A.tex; swap(); break;
        case 'wave': setP([p.amplitude, p.frequency, p.speed]); pass(T.WAVE, cur, A, w, h); cur = A.tex; swap(); break;
        case 'mask': setP([p.shape, p.x, p.y, p.w, p.h, p.feather, p.rotation, p.invert]); pass(T.MASK, cur, A, w, h); cur = A.tex; swap(); break;
        case 'blur': if (p.radius > 0) { cur = blur(p.radius * scale, cur, A, B, w, h); swap(); } break;
        case 'sharpen': setP([p.amount]); pass(T.SHARPEN, cur, A, w, h); cur = A.tex; swap(); break;
        case 'glow': { setP([p.threshold]); pass(T.THRESHOLD, cur, C, w, h); const g = blur(Math.max(1, p.radius * scale), C.tex, A, B, w, h); if (g !== C.tex) { /* copy into C */ pass(T.COPY, g, C, w, h); } setP([p.amount]); pass(T.ADD, cur, A, w, h, { tex2: C.tex }); cur = A.tex; swap(); break; }
      }
    }
    pass(T.COPY, cur, null, w, h);
    return canvas;
  }

  /* parse .cube LUT text -> {size, tex} (cached) */
  function loadLUT(id, text) {
    if (lutTextures.has(id)) return lutTextures.get(id);
    if (!ok && !init()) return null;
    let size = 0; const vals = [];
    for (const line of text.split(/\r?\n/)) { const l = line.trim(); if (!l || l.startsWith('#') || l.startsWith('TITLE') || l.startsWith('DOMAIN')) continue; if (l.startsWith('LUT_3D_SIZE')) { size = parseInt(l.split(/\s+/)[1]); continue; } if (l.startsWith('LUT_1D_SIZE')) return null; const p = l.split(/\s+/).map(Number); if (p.length >= 3 && !p.some(isNaN)) vals.push(p[0], p[1], p[2]); }
    if (!size || vals.length < size * size * size * 3) return null;
    const data = new Uint8Array(size * size * size * 4);
    // cube order: r fastest, then g, then b. layout: x = b*size + r, y = g
    for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) { const si = ((b * size + g) * size + r) * 3; const di = ((g) * size * size + (b * size + r)) * 4; data[di] = U.clamp(vals[si] * 255, 0, 255); data[di + 1] = U.clamp(vals[si + 1] * 255, 0, 255); data[di + 2] = U.clamp(vals[si + 2] * 255, 0, 255); data[di + 3] = 255; }
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size * size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const rec = { size, tex }; lutTextures.set(id, rec); return rec;
  }

  return { process, loadLUT, get available() { return ok || init(); } };
})();
