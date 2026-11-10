/* ============================================================
   COMPOSITOR — renders a project frame at time t into any 2D ctx.
   Everything is drawn in project coordinates (project.width x height).
============================================================ */
'use strict';

const STICKERS = [
  { id: 'star', icon: '★', name: 'Star', color: '#ffcf4a' }, { id: 'heart', icon: '♥', name: 'Heart', color: '#ff5f7e' },
  { id: 'sparkles', icon: '✦', name: 'Sparkle', color: '#b58cff' }, { id: 'arrow', icon: '➜', name: 'Arrow', color: '#ffcf4a' },
  { id: 'check', icon: '✔', name: 'Check', color: '#35ca85' }, { id: 'cross', icon: '✖', name: 'Cross', color: '#ff5c5c' },
  { id: 'fire', icon: '🔥', name: 'Fire', color: '#ff8a3c' }, { id: 'thumbs', icon: '👍', name: 'Thumbs Up', color: '#ffcf4a' },
  { id: 'laugh', icon: '😂', name: 'Laugh', color: '#ffcf4a' }, { id: 'eyes', icon: '👀', name: 'Eyes', color: '#ffffff' },
  { id: 'party', icon: '🎉', name: 'Party', color: '#ffcf4a' }, { id: 'rocket', icon: '🚀', name: 'Rocket', color: '#ffffff' },
  { id: 'warning', icon: '⚠️', name: 'Warning', color: '#ffcf4a' }, { id: 'music', icon: '🎵', name: 'Music', color: '#b58cff' },
  { id: 'camera', icon: '🎬', name: 'Clapper', color: '#ffffff' }, { id: 'bell', icon: '🔔', name: 'Bell', color: '#ffcf4a' },
  { id: 'subscribe', icon: '▶', name: 'Subscribe', color: '#ff3d3d', drawn: true }, { id: 'lowerThird', icon: '▰', name: 'Lower Third', color: '#6c8cff', drawn: true },
  { id: 'speech', icon: '💬', name: 'Callout', color: '#ffffff', drawn: true }, { id: 'frame', icon: '□', name: 'Frame', color: '#ffffff', drawn: true },
  { id: 'badge', icon: '✓', name: 'Badge', color: '#35ca85', drawn: true }, { id: 'like', icon: '👍', name: 'Like Button', color: '#4f7fe0', drawn: true },
  { id: 'rec', icon: '●', name: 'REC', color: '#ff3d3d', drawn: true }, { id: 'progress', icon: '▬', name: 'Progress Bar', color: '#6c8cff', drawn: true },
];

const Compositor = (() => {
  const off = () => document.createElement('canvas');
  const textCache = new Map(); const TEXT_CACHE_MAX = 60;
  const lutStore = new Map(); // fx.id -> {text}

  /* ---------- public: render full frame ---------- */
  function renderFrame(ctx, t, opts = {}) {
    const P = state.project, W = P.canvasCrop?.sourceWidth || P.width, H = P.canvasCrop?.sourceHeight || P.height;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, opts.uncropped ? W : P.width, opts.uncropped ? H : P.height); ctx.clip();
    if (P.canvasCrop && !opts.uncropped) ctx.translate(-P.canvasCrop.x, -P.canvasCrop.y);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.fillStyle = P.background || '#000'; ctx.fillRect(0, 0, W, H);
    const soloed = videoTracks().some(tr => tr.solo);
    for (const track of videoTracks()) {
      if (track.hidden || (soloed && !track.solo)) continue;
      renderTrack(ctx, track, t, W, H, opts);
    }
    ctx.restore();
  }

  // An incoming transition can continue showing the previous clip past its timeline end.
  function visibleSpans() {
    const tracks = videoTracks();
    const solo = tracks.some(track => track.solo);
    const spans = [];
    for (const track of tracks) {
      if (track.hidden || (solo && !track.solo)) continue;
      const clips = track.clips.slice().sort((a,b) => a.start - b.start);
      clips.forEach((clip, i) => {
        if (!clip.enabled) return;
        const next = clips[i + 1], end = clipEnd(clip);
        const overlap = next?.enabled && next.transitionIn.type !== 'none' && Math.abs(end - next.start) < .02;
        spans.push({ clip, end: overlap ? Math.max(end, next.start + Math.min(next.transitionIn.duration, next.duration)) : end });
      });
    }
    return spans;
  }

  function renderTrack(ctx, track, t, W, H, opts) {
    const clips = track.clips.slice().sort((a, b) => a.start - b.start);
    for (let i = 0; i < clips.length; i++) {
      const B = clips[i]; if (!B.enabled) continue;
      const A = clips[i - 1] && clips[i - 1].enabled ? clips[i - 1] : null;
      const tin = B.transitionIn && B.transitionIn.type !== 'none' ? B.transitionIn : null;
      const td = tin ? Math.min(tin.duration, B.duration) : 0;
      const adjacentA = A && tin && Math.abs(clipEnd(A) - B.start) < .02;
      const inWindow = tin && t >= B.start && t < B.start + td;
      // outgoing clip A extended through B's transition window
      if (inWindow && adjacentA) {
        const p = (t - B.start) / td;
        drawClip(ctx, A, t, W, H, { type: tin.type, p, role: 'out-paired' }, opts);
        dipOverlay(ctx, tin.type, p, W, H);
      } else if (inWindow && !adjacentA) {
        dipOverlay(ctx, tin.type, (t - B.start) / td, W, H);
      }
      if (t < B.start || t >= clipEnd(B)) continue;
      let trans = null;
      if (inWindow) trans = { type: tin.type, p: (t - B.start) / td, role: 'in' };
      else {
        const tout = B.transitionOut && B.transitionOut.type !== 'none' ? B.transitionOut : null;
        const N = clips[i + 1]; const nextHasIn = N && N.enabled && N.transitionIn && N.transitionIn.type !== 'none' && Math.abs(clipEnd(B) - N.start) < .02;
        if (tout && !nextHasIn) { const od = Math.min(tout.duration, B.duration); if (t > clipEnd(B) - od) { const p = (t - (clipEnd(B) - od)) / od; trans = { type: tout.type, p, role: 'out' }; dipOverlayAfter = { type: tout.type, p }; } }
      }
      drawClip(ctx, B, t, W, H, trans, opts);
      if (dipOverlayAfter) { dipOverlay(ctx, dipOverlayAfter.type, dipOverlayAfter.p, W, H, true); dipOverlayAfter = null; }
    }
  }
  let dipOverlayAfter = null;
  function dipOverlay(ctx, type, p, W, H, outOnly = false) {
    if (type !== 'dip-black' && type !== 'dip-white') return;
    const a = outOnly ? U.clamp(p, 0, 1) : 1 - Math.abs(2 * p - 1);
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = type === 'dip-black' ? '#000' : '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  /* ---------- transition modifiers ---------- */
  function transMods(tr, W, H) {
    const m = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, clip: null, pixel: 0 };
    if (!tr) return m;
    const { type, role } = tr; const p = U.clamp(tr.p, 0, 1); const isIn = role === 'in'; const q = isIn ? p : 1 - p; // q: visibility 0..1
    const paired = role === 'out-paired';
    if (paired) { // outgoing clip under an incoming transition
      switch (type) {
        case 'push-left': m.dx = -p * W; break; case 'push-right': m.dx = p * W; break;
        case 'zoom-in': m.scale = 1 + p * .5; m.alpha = 1 - p; break; case 'zoom-out': m.scale = 1 - p * .5; m.alpha = 1 - p; break;
        case 'blur': m.blur = p * 30; break; case 'spin': m.rot = p * 180; m.scale = 1 - p * .5; m.alpha = 1 - p; break;
        case 'dip-black': case 'dip-white': m.alpha = 1 - U.clamp(p * 2, 0, 1); break;
        case 'pixelate': m.pixel = p; break;
      }
      return m;
    }
    switch (type) {
      case 'dissolve': case 'fade': m.alpha = q; break;
      case 'dip-black': case 'dip-white': m.alpha = isIn ? U.clamp(p * 2 - 1, 0, 1) : 1 - U.clamp(p * 2, 0, 1); break;
      case 'wipe-left': m.clip = isIn ? [W * (1 - p), 0, W * p, H] : [0, 0, W * (1 - p), H]; break;
      case 'wipe-right': m.clip = isIn ? [0, 0, W * p, H] : [W * p, 0, W * (1 - p), H]; break;
      case 'wipe-up': m.clip = isIn ? [0, H * (1 - p), W, H * p] : [0, 0, W, H * (1 - p)]; break;
      case 'wipe-down': m.clip = isIn ? [0, 0, W, H * p] : [0, H * p, W, H * (1 - p)]; break;
      case 'slide-left': case 'push-left': m.dx = isIn ? (1 - U.ease('ease-out', p)) * W : -U.ease('ease-in', p) * W; break;
      case 'slide-right': case 'push-right': m.dx = isIn ? -(1 - U.ease('ease-out', p)) * W : U.ease('ease-in', p) * W; break;
      case 'slide-up': m.dy = isIn ? (1 - U.ease('ease-out', p)) * H : -U.ease('ease-in', p) * H; break;
      case 'slide-down': m.dy = isIn ? -(1 - U.ease('ease-out', p)) * H : U.ease('ease-in', p) * H; break;
      case 'zoom-in': m.scale = isIn ? .5 + .5 * U.ease('ease-out', p) : 1 + .5 * U.ease('ease-in', p); m.alpha = q; break;
      case 'zoom-out': m.scale = isIn ? 1.5 - .5 * U.ease('ease-out', p) : 1 - .5 * U.ease('ease-in', p); m.alpha = q; break;
      case 'iris': m.clip = { circle: Math.hypot(W, H) / 2 * q }; break;
      case 'blur': m.blur = (1 - q) * 40; m.alpha = Math.min(1, q * 1.5); break;
      case 'spin': m.rot = (1 - q) * 360; m.scale = q; m.alpha = Math.min(1, q * 2); break;
      case 'pop': m.scale = isIn ? U.ease('ease-out-back', p) : 1 - U.ease('ease-in', p); m.alpha = Math.min(1, q * 3); break;
      case 'clock': m.clip = { wedge: q * Math.PI * 2 }; break;
      case 'diagonal': m.clip = { diag: q }; break;
      case 'blinds': m.clip = { blinds: q }; break;
      case 'pixelate': m.pixel = 1 - q; m.alpha = Math.min(1, q * 4); break;
    }
    return m;
  }
  function applyClipRegion(ctx, c, W, H) {
    ctx.beginPath();
    if (Array.isArray(c)) ctx.rect(...c);
    else if (c.circle !== undefined) ctx.arc(W / 2, H / 2, Math.max(0, c.circle), 0, Math.PI * 2);
    else if (c.wedge !== undefined) { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + c.wedge); ctx.closePath(); }
    else if (c.diag !== undefined) { const d = (W + H) * c.diag; ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.closePath(); }
    else if (c.blinds !== undefined) { const n = 8, sh = H / n; for (let i = 0; i < n; i++) ctx.rect(0, i * sh, W, sh * c.blinds); }
    ctx.clip();
  }

  /* ---------- motion presets ---------- */
  function motionMods(clip, lt, W, H) {
    const m = { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1 }; const pr = clip.motion && clip.motion.preset; if (!pr || pr === 'none') return m;
    const p = U.clamp(lt / clip.duration, 0, 1);
    switch (pr) {
      case 'ken-burns-in': m.scale = 1 + p * .2; break; case 'ken-burns-out': m.scale = 1.2 - p * .2; break;
      case 'pan-left': m.scale = 1.15; m.dx = (0.5 - p) * W * .12; break; case 'pan-right': m.scale = 1.15; m.dx = (p - 0.5) * W * .12; break;
      case 'pan-up': m.scale = 1.15; m.dy = (0.5 - p) * H * .12; break; case 'pan-down': m.scale = 1.15; m.dy = (p - 0.5) * H * .12; break;
      case 'float': m.dy = Math.sin(lt * 2) * H * .015; break; case 'pulse': m.scale = 1 + Math.sin(lt * 4) * .03; break;
      case 'shake': m.dx = Math.sin(lt * 50) * 6; m.dy = Math.cos(lt * 43) * 5; break;
      case 'spin': m.rot = lt * 90; break; case 'wobble': m.rot = Math.sin(lt * 5) * 4; break;
      case 'drift': m.dx = (p - .5) * W * .08; m.dy = (p - .5) * H * -.04; m.scale = 1.1; break;
      case 'bounce-in': { const q = U.clamp(lt / .8, 0, 1); m.dy = -(1 - U.ease('bounce', q)) * H * .4; break; }
      case 'zoom-pulse-in': { const q = U.clamp(lt / .6, 0, 1); m.scale = U.ease('ease-out-back', q); m.alpha = q; break; }
    }
    return m;
  }

  /* ---------- resolve effects with keyframes ---------- */
  function resolveEffects(clip, lt) {
    const out = []; for (const fx of clip.effects || []) {
      if (!fx.enabled) continue; const def = EFFECT_DEFS[fx.type]; if (!def) continue;
      const p = {}; for (const [k, limits] of Object.entries(def.params)) p[k] = U.clamp(KF.fxValue(clip, fx, k, lt), limits.min, limits.max);
      const r = { type: fx.type, p, color: fx.params.keyColor || fx.params.color, id: fx.id };
      if (fx.type === 'lut') { const rec = lutStore.get(fx.lut); r.lut = rec ? GLFX.loadLUT(fx.lut, rec) : null; }
      out.push(r);
    }
    return out;
  }
  function registerLUT(name, text) { GLFX.clearLUT(name); lutStore.set(name, text); }
  function exportLUTs() { return Object.fromEntries(lutStore); }
  function restoreLUTs(luts) { for (const name of lutStore.keys()) GLFX.clearLUT(name); lutStore.clear(); if (luts && !Array.isArray(luts)) for (const [name, text] of Object.entries(luts)) if (typeof text === 'string') registerLUT(name, text); }
  function lutNames() { return [...lutStore.keys()]; }

  /* ---------- source acquisition ---------- */
  function clipSource(clip, t, e, W, H) {
    const m = clip.mediaId ? findMedia(clip.mediaId) : null;
    if (clip.kind === 'video') { const v = Media.clipVideo(clip); if (!v || v.readyState < 2 || !v.videoWidth) return null; return { img: v, w: v.videoWidth, h: v.videoHeight }; }
    if (clip.kind === 'image') { if (!m || !m.el || !m.width) return null; return { img: m.el, w: m.width, h: m.height }; }
    if (clip.kind === 'text') { const c = TextRenderer.render(clip, e, t); return c ? { img: c, w: c.width, h: c.height, natural: true } : null; }
    if (clip.kind === 'shape') { const c = ShapeRenderer.render(clip, e); return { img: c, w: c.width, h: c.height, natural: true }; }
    if (clip.kind === 'sticker') { const c = StickerRenderer.render(clip, e, t); return { img: c, w: c.width, h: c.height, natural: true }; }
    if (clip.kind === 'solid') { const c = SolidRenderer.render(clip, W, H); return { img: c, w: W, h: H, natural: true, stretch: true }; }
    return null;
  }

  /* ---------- draw one clip ---------- */
  const pixCanvas = off();
  function drawClip(ctx, clip, t, W, H, trans, opts = {}) {
    const e = evalClip(clip, t);
    const tm = transMods(trans, W, H), mm = motionMods(clip, e.lt, W, H);
    const alpha = e.opacity * tm.alpha * mm.alpha; if (alpha <= 0) return;
    if (clip.kind === 'adjustment') { drawAdjustment(ctx, clip, e, W, H, alpha, t); return; }
    const src = clipSource(clip, t, e, W, H); if (!src) return;
    let img = src.img, iw = src.w, ih = src.h;
    // effects (GPU)
    const fx = resolveEffects(clip, e.lt);
    const gpuFx = fx.filter(f => f.type !== 'dropshadow');
    if (gpuFx.length && GLFX.available) { const out = GLFX.process(img, iw, ih, gpuFx, t); if (out) { img = out; iw = out.width; ih = out.height; } }
    const shadow = fx.find(f => f.type === 'dropshadow');
    // crop (fractions of source)
    const cr = e.crop; const sx = cr.l * iw, sy = cr.t * ih, sw = Math.max(1, iw * (1 - cr.l - cr.r)), sh = Math.max(1, ih * (1 - cr.t - cr.b));
    // fit
    let base;
    if (src.stretch) base = { w: W, h: H };
    else if (src.natural) base = { w: sw / iw * src.w, h: sh / ih * src.h };
    else base = U.fit(sw, sh, W, H, clip.fit);
    const dw = base.w * e.scaleX * tm.scale * mm.scale, dh = base.h * e.scaleY * tm.scale * mm.scale;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = clip.blend && clip.blend !== 'normal' ? clip.blend : 'source-over';
    if (tm.clip) applyClipRegion(ctx, tm.clip, W, H);
    if (tm.blur > 0) ctx.filter = `blur(${tm.blur}px)`;
    ctx.translate(W / 2 + e.x + tm.dx + mm.dx, H / 2 + e.y + tm.dy + mm.dy);
    const rot = e.rotation + tm.rot + mm.rot; if (rot) ctx.rotate(rot * Math.PI / 180);
    const ox = -dw / 2 - e.anchorX * dw, oy = -dh / 2 - e.anchorY * dh;
    if (shadow) { ctx.shadowColor = U.hexToRgba(shadow.color || '#000', shadow.p.opacity); ctx.shadowBlur = shadow.p.blur; ctx.shadowOffsetX = shadow.p.x; ctx.shadowOffsetY = shadow.p.y; }
    if (e.cornerRadius > 0) { roundRectPath(ctx, ox, oy, dw, dh, e.cornerRadius); ctx.clip(); }
    try {
      if (tm.pixel > 0) { const bs = Math.max(1, Math.round(tm.pixel * 48)); const pw = Math.max(1, Math.round(dw / bs)), ph = Math.max(1, Math.round(dh / bs)); pixCanvas.width = pw; pixCanvas.height = ph; const pc = pixCanvas.getContext('2d'); pc.drawImage(img, sx, sy, sw, sh, 0, 0, pw, ph); ctx.imageSmoothingEnabled = false; ctx.drawImage(pixCanvas, ox, oy, dw, dh); }
      else ctx.drawImage(img, sx, sy, sw, sh, ox, oy, dw, dh);
    } catch (err) { }
    ctx.restore();
  }
  function roundRectPath(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  const adjCanvas = off();
  function drawAdjustment(ctx, clip, e, W, H, alpha, t) {
    const fx = resolveEffects(clip, e.lt).filter(f => f.type !== 'dropshadow'); if (!fx.length || !GLFX.available) return;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const out = GLFX.process(ctx.canvas, cw, ch, fx, t); if (!out) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over';
    // draw processed result back over the whole canvas (mask effect leaves alpha holes, revealing the original beneath)
    ctx.drawImage(out, 0, 0, cw, ch); ctx.restore();
  }

  /* bounding box (project coords) of a clip at time t, for gizmo/hit testing */
  function clipBounds(clip, t) {
    const P = state.project, W = P.canvasCrop?.sourceWidth || P.width, H = P.canvasCrop?.sourceHeight || P.height; const e = evalClip(clip, t);
    const cx = P.canvasCrop?.x || 0, cy = P.canvasCrop?.y || 0;
    if (clip.kind === 'adjustment' || clip.kind === 'solid') return { x: W / 2 - cx, y: H / 2 - cy, w: W, h: H, rot: 0, ax: 0, ay: 0, e };
    const src = clipSource(clip, t, e, W, H); let base;
    if (!src) base = { w: W * .3, h: H * .3 };
    else { const cr = e.crop; const sw = Math.max(1, src.w * (1 - cr.l - cr.r)), sh = Math.max(1, src.h * (1 - cr.t - cr.b)); base = src.natural ? { w: sw, h: sh } : U.fit(sw, sh, W, H, clip.fit); }
    const mm = motionMods(clip, e.lt, W, H);
    const dw = base.w * e.scaleX * mm.scale, dh = base.h * e.scaleY * mm.scale;
    return { x: W / 2 - cx + e.x + mm.dx, y: H / 2 - cy + e.y + mm.dy, w: dw, h: dh, rot: e.rotation + mm.rot, ax: e.anchorX, ay: e.anchorY, e };
  }

  /* topmost visual clip under project point (px,py) at time t */
  function hitTest(px, py, t) {
    const tracks = videoTracks().slice().reverse();
    const soloed = tracks.some(tr => tr.solo);
    for (const tr of tracks) { if (tr.hidden || tr.locked || (soloed && !tr.solo)) continue; for (const c of clipsAt(t, tr).slice().reverse()) { if (!c.enabled || c.kind === 'adjustment') continue; const b = clipBounds(c, t); const [lx, ly] = U.rotatePoint(px, py, b.x, b.y, -b.rot); const cx = b.x - b.ax * b.w, cy = b.y - b.ay * b.h; if (Math.abs(lx - cx) <= b.w / 2 && Math.abs(ly - cy) <= b.h / 2) return c; } }
    return null;
  }

  function clearCaches() { textCache.clear(); }

  /* ============================================================
     TEXT RENDERER
  ============================================================ */
  const TextRenderer = (() => {
    const measureCanvas = off(); const mctx = measureCanvas.getContext('2d');
    function fontStr(tx, size) { return `${tx.italic ? 'italic ' : ''}${tx.weight || '700'} ${size}px "${tx.font || 'Montserrat'}", sans-serif`; }
    function applyTransform(s, mode) { return mode === 'upper' ? s.toUpperCase() : mode === 'lower' ? s.toLowerCase() : mode === 'title' ? s.replace(/\b\w/g, c => c.toUpperCase()) : s; }
    /* layout: returns lines of chars with x positions; wraps to boxWidth */
    function layout(tx, size, ls) {
      mctx.font = fontStr(tx, size);
      const raw = applyTransform(tx.content || '', tx.transform).split('\n');
      const lines = []; let idx = 0;
      for (const para of raw) {
        const words = para.split(' '); let cur = []; let curW = 0;
        const wordW = (w) => [...w].reduce((a, ch) => a + mctx.measureText(ch).width + ls, 0);
        const spaceW = mctx.measureText(' ').width + ls;
        for (const w of words) {
          const ww = wordW(w);
          if (tx.boxWidth > 0 && cur.length && curW + spaceW + ww > tx.boxWidth) { lines.push(cur.join(' ')); cur = [w]; curW = ww; }
          else { if (cur.length) curW += spaceW; cur.push(w); curW += ww; }
        }
        lines.push(cur.join(' '));
      }
      // per-char metrics
      const out = lines.map((line, li) => { let x = 0; const chars = [...line].map((ch) => { const w = mctx.measureText(ch).width; const c = { ch, x, w, i: idx++, line: li }; x += w + ls; return c; }); return { chars, width: Math.max(0, x - ls), text: line }; });
      const totalChars = idx; let wi = 0;
      out.forEach((line, i) => { if (i) wi++; line.chars.forEach(c => { if (c.ch === ' ') wi++; c.word = wi; }); });
      return { lines: out, totalChars, totalWords: wi + 1 };
    }
    /* per-char animation state: {alpha, dx, dy, scale, blur} */
    function charAnim(anim, p, c, L, dur) {
      const s = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0 }; if (!anim || anim === 'none') return s;
      const n = Math.max(1, L.totalChars); const per = (idx, total) => U.clamp((p * (1 + .6) - idx / total * .6) / 1, 0, 1); // staggered progress
      switch (anim) {
        case 'fade': s.alpha = p; break;
        case 'typewriter': s.alpha = c.i < Math.floor(p * n + .999) ? 1 : 0; break;
        case 'slide-up': s.dy = (1 - U.ease('ease-out', p)) * 60; s.alpha = p; break;
        case 'slide-down': s.dy = -(1 - U.ease('ease-out', p)) * 60; s.alpha = p; break;
        case 'slide-left': s.dx = (1 - U.ease('ease-out', p)) * 120; s.alpha = p; break;
        case 'pop': s.scale = U.ease('ease-out-back', p); s.alpha = Math.min(1, p * 3); break;
        case 'blur-in': s.blur = (1 - p) * 20; s.alpha = p; break;
        case 'char-rise': { const q = per(c.i, n); s.alpha = q; s.dy = (1 - U.ease('ease-out', q)) * 40; break; }
        case 'char-pop': { const q = per(c.i, n); s.alpha = Math.min(1, q * 2); s.scale = U.ease('ease-out-back', q); break; }
        case 'word-fade': { const q = per(c.word, L.totalWords); s.alpha = q; break; }
        case 'word-rise': { const q = per(c.word, L.totalWords); s.alpha = q; s.dy = (1 - U.ease('ease-out', q)) * 40; break; }
        case 'line-slide': { const q = per(c.line, L.lines.length); s.alpha = q; s.dx = (1 - U.ease('ease-out', q)) * 100; break; }
        case 'wave': { const q = per(c.i, n); s.alpha = q; s.dy = Math.sin((1 - q) * Math.PI * 2) * 20; break; }
        case 'shuffle': { const q = per(c.i, n); s.alpha = q; s.dx = (1 - q) * (c.i % 2 ? 40 : -40); break; }
        case 'scale-in': s.scale = .5 + .5 * U.ease('ease-out', p); s.alpha = p; break;
        case 'zoom-out': s.scale = 1.6 - .6 * U.ease('ease-out', p); s.alpha = p; break;
      }
      return s;
    }
    function render(clip, e, t) {
      const tx = clip.text; if (!tx) return null;
      const size = Math.max(1, e.textSize), ls = e.letterSpacing || 0, lt = e.lt;
      const inP = tx.animation !== 'none' && tx.animDuration > 0 ? U.clamp(lt / tx.animDuration, 0, 1) : 1;
      const outP = tx.animOut !== 'none' && tx.animOutDuration > 0 ? U.clamp((clip.duration - lt) / tx.animOutDuration, 0, 1) : 1;
      const animating = inP < 1 || outP < 1;
      const key = JSON.stringify([tx, size, ls, animating ? Math.round(inP * 200) : 1, animating ? Math.round(outP * 200) : 1]);
      if (textCache.has(key)) return textCache.get(key);
      const L = layout(tx, size, ls);
      const lh = size * (tx.lineHeight || 1.2);
      const textW = L.lines.reduce((width, line) => Math.max(width, line.width), Math.max(1, tx.boxWidth || 0)), textH = L.lines.length * lh;
      const pad = tx.bgPadding || 0, margin = Math.ceil((tx.shadowBlur || 0) + Math.abs(tx.shadowX || 0) + Math.abs(tx.shadowY || 0) + (tx.strokeWidth || 0) + size * .6 + pad + 30);
      const W = Math.ceil(textW + margin * 2), H = Math.ceil(textH + margin * 2);
      if (W > 8192 || H > 8192) return null;
      const cv = off(); cv.width = W; cv.height = H; const c = cv.getContext('2d');
      c.font = fontStr(tx, size); c.textBaseline = 'middle';
      // background box
      if (tx.bgOpacity > 0) { c.save(); c.globalAlpha = (tx.bgOpacity) * (animating ? Math.min(inP * 2, 1) * Math.min(outP * 2, 1) : 1); c.fillStyle = tx.bgColor; roundRectPath(c, margin - pad, margin - pad, textW + pad * 2, textH + pad * 2, tx.bgRadius || 0); c.fill(); c.restore(); }
      // fill style
      let fill = tx.color;
      if (tx.gradient) { const a = (tx.gradAngle || 0) * Math.PI / 180; const r = Math.hypot(textW, textH) / 2; const cx = W / 2, cy = H / 2; const g = c.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.addColorStop(0, tx.color); g.addColorStop(1, tx.color2 || '#6c8cff'); fill = g; }
      L.lines.forEach((line, li) => {
        const y = margin + li * lh + lh / 2;
        let x0 = margin; if (tx.align === 'center') x0 = margin + (textW - line.width) / 2; else if (tx.align === 'right') x0 = margin + textW - line.width;
        for (const ch of line.chars) {
          if (ch.ch === ' ') continue;
          const a = charAnim(tx.animation, inP, ch, L, tx.animDuration), o = charAnimOut(tx.animOut, outP, ch, L);
          const alpha = a.alpha * o.alpha; if (alpha <= 0) continue;
          c.save(); c.globalAlpha = alpha;
          const cx = x0 + ch.x + ch.w / 2 + a.dx + o.dx, cy = y + a.dy + o.dy; c.translate(cx, cy); const sc = a.scale * o.scale; if (sc !== 1) c.scale(sc, sc);
          if (a.blur > 0) c.filter = `blur(${a.blur}px)`;
          if (tx.shadowBlur > 0 || tx.shadowX || tx.shadowY) { c.shadowColor = U.hexToRgba(tx.shadowColor, tx.shadowOpacity ?? .8); c.shadowBlur = tx.shadowBlur; c.shadowOffsetX = tx.shadowX; c.shadowOffsetY = tx.shadowY; }
          c.textAlign = 'center';
          if (tx.strokeWidth > 0) { c.lineJoin = 'round'; c.lineWidth = tx.strokeWidth * 2; c.strokeStyle = tx.strokeColor; c.strokeText(ch.ch, 0, 0); }
          c.shadowColor = 'transparent'; c.fillStyle = fill; c.fillText(ch.ch, 0, 0); c.restore();
        }
      });
      if (!animating) { if (textCache.size > TEXT_CACHE_MAX) textCache.delete(textCache.keys().next().value); textCache.set(key, cv); }
      return cv;
    }
    function charAnimOut(anim, p, c, L) { // p: 1 = fully visible, 0 = gone
      const s = { alpha: 1, dx: 0, dy: 0, scale: 1 }; if (!anim || anim === 'none') return s;
      switch (anim) {
        case 'fade': s.alpha = p; break;
        case 'slide-up': s.dy = -(1 - p) * 60; s.alpha = p; break; case 'slide-down': s.dy = (1 - p) * 60; s.alpha = p; break;
        case 'scale-out': s.scale = p; s.alpha = p; break; case 'zoom-out': s.scale = 1 + (1 - p) * .6; s.alpha = p; break;
        case 'typewriter': s.alpha = c.i < Math.floor(p * L.totalChars) ? 1 : 0; break;
        case 'char-drop': { const q = U.clamp((p * 1.6 - (1 - c.i / Math.max(1, L.totalChars)) * .6), 0, 1); s.alpha = q; s.dy = (1 - q) * 40; break; }
      }
      return s;
    }
    return { render, layout, fontStr };
  })();

  /* ============================================================
     SHAPE RENDERER
  ============================================================ */
  const ShapeRenderer = (() => {
    function render(clip, e) {
      const s = clip.shape; const w = Math.max(2, e.shapeW), h = Math.max(2, e.shapeH); const sw = s.strokeWidth || 0; const m = sw + 4;
      if (w + m * 2 > 16384 || h + m * 2 > 16384) return null;
      const cv = off(); cv.width = Math.ceil(w + m * 2); cv.height = Math.ceil(h + m * 2); const c = cv.getContext('2d');
      c.translate(m, m);
      let fill = s.fill;
      if (s.gradient) { const a = (s.gradAngle || 0) * Math.PI / 180, r = Math.hypot(w, h) / 2; const g = c.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); g.addColorStop(0, s.fill); g.addColorStop(1, s.fill2 || '#fff'); fill = g; }
      c.fillStyle = fill; c.strokeStyle = s.stroke; c.lineWidth = sw; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      switch (s.type) {
        case 'rect': roundRectPath(c, 0, 0, w, h, s.radius || 0); break;
        case 'ellipse': c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
        case 'triangle': c.moveTo(w / 2, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); break;
        case 'star': { const n = U.clamp(Math.round(s.points || 5), 3, 512), R = Math.min(w, h) / 2, r = R * .45; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; c.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } c.closePath(); break; }
        case 'polygon': { const n = U.clamp(Math.round(s.points || 6), 3, 512), R = Math.min(w, h) / 2; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / n; c.lineTo(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R); } c.closePath(); break; }
        case 'heart': { c.moveTo(w / 2, h * .95); c.bezierCurveTo(-w * .2, h * .45, w * .1, -h * .15, w / 2, h * .28); c.bezierCurveTo(w * .9, -h * .15, w * 1.2, h * .45, w / 2, h * .95); c.closePath(); break; }
        case 'line': c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.lineWidth = Math.max(2, sw || 6); c.strokeStyle = s.fill; c.stroke(); return cv;
        case 'arrow': { const hw = Math.max(6, sw || 8), ah = Math.min(h / 2, w * .3); c.moveTo(0, h / 2 - hw / 2); c.lineTo(w - ah, h / 2 - hw / 2); c.lineTo(w - ah, 0); c.lineTo(w, h / 2); c.lineTo(w - ah, h); c.lineTo(w - ah, h / 2 + hw / 2); c.lineTo(0, h / 2 + hw / 2); c.closePath(); break; }
        case 'speech': { roundRectPath(c, 0, 0, w, h * .8, s.radius || 20); c.fill(); if (sw) c.stroke(); c.beginPath(); c.moveTo(w * .25, h * .78); c.lineTo(w * .15, h); c.lineTo(w * .45, h * .78); c.closePath(); break; }
        case 'cross': { const t = Math.min(w, h) * .25; c.rect(w / 2 - t / 2, 0, t, h); c.rect(0, h / 2 - t / 2, w, t); break; }
      }
      c.fill(); if (sw > 0) c.stroke();
      return cv;
    }
    return { render, TYPES: ['rect', 'ellipse', 'triangle', 'star', 'polygon', 'heart', 'line', 'arrow', 'speech', 'cross'] };
  })();

  /* ============================================================
     STICKER RENDERER
  ============================================================ */
  const StickerRenderer = (() => {
    const cache = new Map();
    function render(clip, e, t) {
      const st = clip.sticker; const def = STICKERS.find(s => s.id === st.id) || STICKERS[0];
      const size = 300; const key = JSON.stringify([st, def.drawn ? Math.floor(e.lt * 4) : 0]);
      if (cache.has(key)) return cache.get(key);
      const cv = off(); const W = def.drawn ? 900 : size + 40, H = def.drawn ? 340 : size + 40; cv.width = W; cv.height = H; const c = cv.getContext('2d');
      c.translate(W / 2, H / 2); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = st.color || def.color; c.strokeStyle = '#fff'; c.lineWidth = 6;
      const label = st.text;
      if (!def.drawn) { c.font = `${size * .8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`; c.fillText(def.icon, 0, 10); }
      else if (def.id === 'subscribe') { roundRectPath(c, -300, -80, 600, 160, 30); c.fill(); c.fillStyle = '#fff'; c.font = '800 66px Montserrat, sans-serif'; c.fillText(label || '▶  SUBSCRIBE', 0, 2); }
      else if (def.id === 'like') { roundRectPath(c, -300, -80, 600, 160, 80); c.fill(); c.fillStyle = '#fff'; c.font = '800 66px Montserrat, sans-serif'; c.fillText(label || '👍  LIKE', 0, 2); }
      else if (def.id === 'lowerThird') { c.fillRect(-440, -70, 880, 140); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-440, 40, 880, 30); c.fillStyle = '#fff'; c.font = '700 60px Montserrat, sans-serif'; c.textAlign = 'left'; c.fillText(label || 'YOUR NAME', -400, -8); c.font = '500 30px Montserrat, sans-serif'; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText('Title / Description', -400, 60); }
      else if (def.id === 'frame') { c.lineWidth = 18; c.strokeStyle = st.color || '#fff'; roundRectPath(c, -430, -160, 860, 320, 24); c.stroke(); }
      else if (def.id === 'speech') { c.fillStyle = '#fff'; roundRectPath(c, -400, -150, 800, 240, 40); c.fill(); c.beginPath(); c.moveTo(-200, 85); c.lineTo(-280, 160); c.lineTo(-100, 85); c.fill(); c.fillStyle = '#20202a'; c.font = '700 64px Montserrat, sans-serif'; c.fillText(label || 'HELLO!', 0, -30); }
      else if (def.id === 'badge') { c.beginPath(); c.arc(0, 0, 140, 0, Math.PI * 2); c.fill(); c.lineWidth = 12; c.stroke(); c.fillStyle = '#fff'; c.font = '900 150px Montserrat, sans-serif'; c.fillText('✓', 0, 8); }
      else if (def.id === 'rec') { const blink = Math.floor(e.lt * 2) % 2 === 0; if (blink) { c.beginPath(); c.arc(-160, 0, 40, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#fff'; c.font = '800 90px Montserrat, sans-serif'; c.textAlign = 'left'; c.fillText(label || 'REC', -90, 4); }
      else if (def.id === 'progress') { const p = U.clamp(e.lt / clip.duration, 0, 1); c.fillStyle = 'rgba(255,255,255,.25)'; roundRectPath(c, -440, -20, 880, 40, 20); c.fill(); c.fillStyle = st.color || def.color; roundRectPath(c, -440, -20, 880 * p, 40, 20); c.fill(); return cv; }
      if (cache.size > 80) cache.delete(cache.keys().next().value); cache.set(key, cv);
      return cv;
    }
    return { render };
  })();

  /* ============================================================
     SOLID / GRADIENT RENDERER
  ============================================================ */
  const SolidRenderer = (() => {
    const cache = new Map();
    function render(clip, W, H) {
      const s = clip.solid; const key = JSON.stringify([s, W, H]); if (cache.has(key)) return cache.get(key);
      const cv = off(); cv.width = W; cv.height = H; const c = cv.getContext('2d');
      if (s.gradient) { const a = (s.angle || 0) * Math.PI / 180, r = Math.hypot(W, H) / 2; const g = c.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); g.addColorStop(0, s.color); g.addColorStop(1, s.color2); c.fillStyle = g; } else c.fillStyle = s.color;
      c.fillRect(0, 0, W, H); if (cache.size > 20) cache.delete(cache.keys().next().value); cache.set(key, cv); return cv;
    }
    return { render };
  })();

  return { renderFrame, visibleSpans, drawClip, clipBounds, hitTest, clearCaches, registerLUT, lutNames, exportLUTs, restoreLUTs, TextRenderer, ShapeRenderer, StickerRenderer, resolveEffects, roundRectPath };
})();
