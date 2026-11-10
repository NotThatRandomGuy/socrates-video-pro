/* ============================================================
   PLAYER — playback clock, A/V sync, frame stepping, JKL shuttle
   PREVIEW — canvas display, transform gizmo, overlays
============================================================ */
'use strict';

const Player = (() => {
  let raf = null, needRender = true, lastRenderT = -1, wallStart = 0, wallProj = 0;
  const canvas = () => document.getElementById('previewCanvas');
  const fps = () => state.project.fps;
  let playbackRange = null;

  function markedRange() {
    const {inPoint, outPoint} = state.project;
    const end = Math.min(outPoint ?? 0, state.duration);
    return inPoint !== null && inPoint < end ? [inPoint, end] : null;
  }
  function loopRange() { return playbackRange || markedRange() || [0, state.duration]; }

  function play(rate = 1, range = null) {
    if (state.duration <= 0) return;
    playbackRange = range;
    const [a, b] = loopRange();
    if (rate > 0 && (state.currentTime < a || state.currentTime >= b)) state.currentTime = a;
    if (rate < 0 && (state.currentTime <= a || state.currentTime > b)) state.currentTime = b;
    if (raf) cancelAnimationFrame(raf); raf = null;
    state.playing = true; state.playRate = rate;
    if (rate > 0) AudioEngine.play(state.currentTime, rate); else { AudioEngine.stop(); wallStart = performance.now(); wallProj = state.currentTime; }
    Events.emit('playback:changed'); tick();
  }
  function pause() {
    if (!state.playing) { return; }
    state.currentTime = U.clamp(now(), ...loopRange()); state.playing = false; state.playRate = 1; AudioEngine.stop();
    playbackRange = null;
    for (const v of Media.allClipEls().values()) v.pause();
    state.currentTime = U.clamp(U.snapToFrame(state.currentTime, fps()), 0, state.duration);
    Events.emit('playback:changed'); Events.emit('time:changed'); requestRender();
  }
  function toggle() { state.playing ? pause() : play(1); }
  function shuttle(rate) { // JKL
    if (state.playing && state.playRate === rate) { pause(); return; }
    if (state.playing) { state.currentTime = now(); AudioEngine.stop(); state.playing = false; }
    play(rate);
  }
  function now() { if (!state.playing) return state.currentTime; if (state.playRate > 0) return AudioEngine.now(); return wallProj + (performance.now() - wallStart) / 1000 * state.playRate; }
  function seek(t, { snap = true } = {}) {
    if (!Number.isFinite(t)) return;
    const was = state.playing; if (was) { AudioEngine.stop(); }
    t = U.clamp(t, 0, Math.max(state.duration, 0)); if (snap) t = U.clamp(U.snapToFrame(t, fps()), 0, state.duration);
    state.currentTime = t; if (was) { if (state.playRate > 0) AudioEngine.play(t, state.playRate); wallStart = performance.now(); wallProj = t; }
    Events.emit('time:changed'); requestRender();
  }
  function step(n) { pause(); seek(state.currentTime + n / fps()); }
  function goStart() { pause(); seek(loopRange()[0] === 0 || state.currentTime > loopRange()[0] ? loopRange()[0] : 0); }
  function goEnd() { pause(); seek(state.duration); }
  function requestRender() { needRender = true; if (!raf) raf = requestAnimationFrame(tick); }

  function syncVideo(t) {
    const activeIds = new Set();
    for (const {clip: c, end} of Compositor.visibleSpans()) {
        if (c.kind !== 'video' || t < c.start - .5 || t >= end) continue;
        const el = Media.clipVideo(c); if (!el) continue; activeIds.add(c.id);
        if (!el._hooked) { el._hooked = true; el.addEventListener('seeked', requestRender); el.addEventListener('loadeddata', requestRender); }
        const inRange = t >= c.start;
        const want = Math.max(0, c.offset + (t - c.start) * c.speed);
        const pastSource = el.duration && want >= el.duration - .05;
        const canPlay = state.playing && state.playRate > 0 && state.playRate * c.speed <= 8 && inRange && !pastSource;
        if (canPlay) {
          const pr = U.clamp(c.speed * state.playRate, .0625, 16); if (Math.abs(el.playbackRate - pr) > .001) el.playbackRate = pr;
          if (el.paused) { el.currentTime = want; el.play().catch(() => { }); }
          else if (Math.abs(el.currentTime - want) > .18) el.currentTime = want;
        } else {
          if (!el.paused) el.pause();
          const target = pastSource ? Math.max(0, el.duration - .05) : want;
          if (Math.abs(el.currentTime - target) > .5 / fps() && !el.seeking) el.currentTime = target;
        }
    }
    for (const [id, el] of Media.allClipEls()) if (!activeIds.has(id) && !el.paused) el.pause();
  }

  function tick() {
    raf = null;
    if (state.playing) {
      let t = now(); const [a, b] = loopRange();
      if ((state.playRate > 0 && t >= b) || (state.playRate < 0 && t <= a)) {
        if (state.loop) { state.currentTime = state.playRate > 0 ? a : b; const r = state.playRate; state.playing = false; AudioEngine.stop(); play(r); return; }
        state.currentTime = U.clamp(t, a, b); pause(); return;
      }
      state.currentTime = t; needRender = true; Events.emit('time:changed');
    }
    if (needRender) { needRender = false; if (state.exporting !== 'webcodecs') { syncVideo(state.currentTime); render(); } }
    if (state.playing) raf = requestAnimationFrame(tick);
  }
  function render() {
    const cv = canvas(); if (!cv) return; const P = state.project; const q = state.previewQuality || 1;
    const w = Math.max(1, Math.round(P.width * q)), h = Math.max(1, Math.round(P.height * q)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; Preview.layout(); }
    const ctx = cv.getContext('2d'); ctx.setTransform(q, 0, 0, q, 0, 0);
    Compositor.renderFrame(ctx, state.currentTime); lastRenderT = state.currentTime;
    Preview.drawOverlay();
  }
  // keep frames fresh while paused (video elements become ready, text edits, etc.)
  Events.on('project:changed', () => { recalcDuration(); requestRender(); if (state.playing) AudioEngine.reschedule(); });
  Events.on('selection:changed', () => requestRender());
  return { markedRange, play, pause, toggle, shuttle, seek, step, goStart, goEnd, requestRender, render, now, loopRange, syncVideo };
})();

/* ============================================================
   PREVIEW — layout, gizmo, overlays
============================================================ */
const Preview = (() => {
  let area, canvas, overlay, octx, drag = null, hover = null;
  const HANDLE = 8;
  function init() {
    area = document.getElementById('previewArea'); canvas = document.getElementById('previewCanvas'); overlay = document.getElementById('previewOverlay'); octx = overlay.getContext('2d');
    new ResizeObserver(layout).observe(area);
    overlay.addEventListener('mousedown', onDown); overlay.addEventListener('mousemove', onMove); overlay.addEventListener('dblclick', onDbl);
    overlay.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });
    overlay.addEventListener('contextmenu', (e) => { e.preventDefault(); const c = hitAt(e); if (c) { Cmd.select(c.id); UI.clipContextMenu(e.clientX, e.clientY, c); } });
    // drop media onto preview -> add at playhead on a new top track
    overlay.addEventListener('dragover', e => e.preventDefault());
    overlay.addEventListener('drop', async e => {
      e.preventDefault();
      const project = state.project, id = e.dataTransfer.getData('mediaId');
      let start = state.currentTime;
      if (id) { await Cmd.addMedia(id, { newVideoTrack: true, start }); return; }
      const added = await Media.importFiles(Array.from(e.dataTransfer.files || []));
      for (const m of added) {
        if (state.project !== project) break;
        const clip = await Cmd.addMedia(m.id, { start });
        if (clip) start = clipEnd(clip);
      }
    });
    layout();
  }
  function layout() {
    if (!area || !canvas) return; const P = state.project; const aw = area.clientWidth - 24, ah = area.clientHeight - 24; if (aw <= 0 || ah <= 0) return;
    let s = Math.min(aw / P.width, ah / P.height); if (state.previewZoom !== 'fit') s = parseFloat(state.previewZoom);
    const w = Math.round(P.width * s), h = Math.round(P.height * s);
    [canvas, overlay].forEach(c => { c.style.width = w + 'px'; c.style.height = h + 'px'; });
    overlay.width = w; overlay.height = h; drawOverlay();
    const z = document.getElementById('previewZoomLabel'); if (z) z.textContent = Math.round(s * 100) + '%';
  }
  function zoomBy(f) { const P = state.project; const cur = state.previewZoom === 'fit' ? overlay.width / P.width : parseFloat(state.previewZoom); state.previewZoom = String(U.clamp(cur * f, .05, 4)); layout(); }
  function setZoom(v) { state.previewZoom = v; layout(); }
  const scale = () => overlay.width / state.project.width;
  const toProj = (e) => { const r = overlay.getBoundingClientRect(); const s = scale(); return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; };
  function hitAt(e) { const [x, y] = toProj(e); return Compositor.hitTest(x, y, state.currentTime); }

  /* ---- gizmo geometry ---- */
  function gizmoFor(clip) {
    const b = Compositor.clipBounds(clip, state.currentTime); const s = scale();
    const cx = (b.x - b.ax * b.w) * s, cy = (b.y - b.ay * b.h) * s, w = b.w * s, h = b.h * s, rot = b.rot, px = b.x * s, py = b.y * s;
    const pt = (dx, dy) => U.rotatePoint(cx + dx * w / 2, cy + dy * h / 2, px, py, rot);
    const handles = { nw: pt(-1, -1), n: pt(0, -1), ne: pt(1, -1), e: pt(1, 0), se: pt(1, 1), s: pt(0, 1), sw: pt(-1, 1), w: pt(-1, 0) };
    const rotH = U.rotatePoint(cx, cy - h / 2 - 28, px, py, rot);
    return { cx, cy, w, h, rot, px, py, handles, rotH, b };
  }
  function handleAt(g, mx, my) { for (const [k, [hx, hy]] of Object.entries(g.handles)) if (Math.hypot(mx - hx, my - hy) <= HANDLE + 2) return k; if (Math.hypot(mx - g.rotH[0], my - g.rotH[1]) <= HANDLE + 3) return 'rot'; return null; }
  function drawOverlay() {
    if (!octx) return; const W = overlay.width, H = overlay.height; octx.clearRect(0, 0, W, H);
    if (state.showGrid) { octx.strokeStyle = 'rgba(255,255,255,.12)'; octx.lineWidth = 1; for (let i = 1; i < 3; i++) { octx.beginPath(); octx.moveTo(W * i / 3, 0); octx.lineTo(W * i / 3, H); octx.moveTo(0, H * i / 3); octx.lineTo(W, H * i / 3); octx.stroke(); } }
    if (state.showSafeAreas) { octx.strokeStyle = 'rgba(255,255,255,.35)'; octx.setLineDash([6, 4]); octx.strokeRect(W * .05, H * .05, W * .9, H * .9); octx.strokeRect(W * .1, H * .1, W * .8, H * .8); octx.setLineDash([]); octx.beginPath(); octx.moveTo(W / 2 - 12, H / 2); octx.lineTo(W / 2 + 12, H / 2); octx.moveTo(W / 2, H / 2 - 12); octx.lineTo(W / 2, H / 2 + 12); octx.stroke(); }
    if (drag?.guides) {
      octx.save(); octx.strokeStyle = '#43e3bf'; octx.lineWidth = 1.5; octx.setLineDash([5, 4]);
      octx.beginPath();
      if (drag.guides.x) { octx.moveTo(W / 2, 0); octx.lineTo(W / 2, H); }
      if (drag.guides.y) { octx.moveTo(0, H / 2); octx.lineTo(W, H / 2); }
      octx.stroke(); octx.restore();
    }
    const clip = primaryClip(); if (!clip || !isVisualKind(clip.kind) || clip.kind === 'adjustment' || clip.kind === 'solid') return;
    if (state.currentTime < clip.start || state.currentTime >= clipEnd(clip)) return;
    const g = gizmoFor(clip);
    octx.save(); octx.translate(g.px, g.py); octx.rotate(g.rot * Math.PI / 180); octx.translate(-g.px, -g.py);
    octx.strokeStyle = '#6c8cff'; octx.lineWidth = 1.5; octx.strokeRect(g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h);
    octx.beginPath(); octx.moveTo(g.cx, g.cy - g.h / 2); octx.lineTo(g.cx, g.cy - g.h / 2 - 28); octx.stroke();
    octx.restore();
    octx.fillStyle = '#fff'; octx.strokeStyle = '#6c8cff';
    for (const [hx, hy] of Object.values(g.handles)) { octx.beginPath(); octx.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE); octx.fill(); octx.stroke(); }
    octx.beginPath(); octx.arc(g.rotH[0], g.rotH[1], HANDLE / 2 + 1, 0, Math.PI * 2); octx.fill(); octx.stroke();
    // anchor
    octx.beginPath(); octx.arc(g.px, g.py, 4, 0, Math.PI * 2); octx.strokeStyle = '#ffcf4a'; octx.stroke();
  }

  function onDown(e) {
    if (e.button !== 0) return; const clip = primaryClip(); const r = overlay.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let mode = null, target = null;
    if (clip && isVisualKind(clip.kind) && state.currentTime >= clip.start && state.currentTime < clipEnd(clip) && clip.kind !== 'adjustment' && clip.kind !== 'solid') { const g = gizmoFor(clip); const h = handleAt(g, mx, my); if (h) { mode = h; target = clip; } }
    if (!mode) { const hit = hitAt(e); if (hit) { if (!state.selection.has(hit.id)) Cmd.select(hit.id, { add: e.shiftKey }); target = hit; mode = 'move'; } else { if (!e.shiftKey) Cmd.deselect(); return; } }
    if (findTrackOfClip(target.id)?.locked) return;
    const g = gizmoFor(target); const e0 = evalClip(target, state.currentTime);
    drag = { mode, clip: target, mx, my, g, start: { x: target.transform.x, y: target.transform.y, sx: target.transform.scaleX, sy: target.transform.scaleY, rot: target.transform.rotation, ex: e0.x, ey: e0.y, esx: e0.scaleX, esy: e0.scaleY, erot: e0.rotation }, moved: false };
    History.begin('Transform');
    const mv = (ev) => onDrag(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (drag && drag.moved) { History.commit('Transform'); Events.emit('project:changed'); } else History.cancel(); drag = null; drawOverlay(); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
  }
  function setT(clip, path, v) { const lt = U.clamp(state.currentTime - clip.start, 0, clip.duration); if (KF.has(clip, path)) KF.set(clip, path, lt, v); else U.setPath(clip, path, v); }
  function onDrag(e) {
    if (!drag) return; const r = overlay.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const s = scale(); const { clip, g, start } = drag; drag.moved = true;
    const dx = (mx - drag.mx) / s, dy = (my - drag.my) / s;
    if (drag.mode === 'move') {
      let nx = start.ex + dx, ny = start.ey + dy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) ny = start.ey; else nx = start.ex; }
      // Eight screen pixels at every zoom level; align the rotated visible center.
      const [centerX, centerY] = U.rotatePoint(g.b.x - g.b.ax * g.b.w, g.b.y - g.b.ay * g.b.h, g.b.x, g.b.y, g.b.rot);
      const tx = start.ex + state.project.width / 2 - centerX;
      const ty = start.ey + state.project.height / 2 - centerY;
      const allowX = !e.shiftKey || Math.abs(dx) > Math.abs(dy);
      const allowY = !e.shiftKey || !allowX;
      drag.guides = { x: false, y: false };
      if (state.snap && !e.altKey) {
        if (allowX && Math.abs(nx - tx) <= 8 / s) { nx = tx; drag.guides.x = true; }
        if (allowY && Math.abs(ny - ty) <= 8 / s) { ny = ty; drag.guides.y = true; }
      }
      setT(clip, 'transform.x', Math.round(nx)); setT(clip, 'transform.y', Math.round(ny));
    } else if (drag.mode === 'rot') {
      const a0 = Math.atan2(drag.my - g.py, drag.mx - g.px), a1 = Math.atan2(my - g.py, mx - g.px); let rot = start.erot + (a1 - a0) * 180 / Math.PI; if (e.shiftKey) rot = Math.round(rot / 15) * 15; setT(clip, 'transform.rotation', Math.round(rot * 10) / 10);
    } else {
      // scale: project mouse delta into the clip's local axes
      const rad = -g.rot * Math.PI / 180; const lx = dx * Math.cos(rad) - dy * Math.sin(rad), ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const bw = g.w / s / start.esx, bh = g.h / s / start.esy; const m = drag.mode; const sxDir = m.includes('e') ? 1 : m.includes('w') ? -1 : 0, syDir = m.includes('s') ? 1 : m.includes('n') ? -1 : 0;
      let nsx = start.esx + (sxDir * lx * 2) / bw, nsy = start.esy + (syDir * ly * 2) / bh;
      const uniform = clip.transform.uniform || (sxDir && syDir && !e.shiftKey); // corners uniform by default
      if (uniform) { const k = sxDir && syDir ? Math.max(nsx / start.esx, nsy / start.esy) : (sxDir ? nsx / start.esx : nsy / start.esy); nsx = start.esx * k; nsy = start.esy * k; }
      nsx = Math.max(.01, nsx); nsy = Math.max(.01, nsy);
      if (!clip.transform.uniform) { setT(clip, 'transform.scaleX', U.round(nsx, 3)); setT(clip, 'transform.scaleY', U.round(nsy, 3)); } else setT(clip, 'transform.scaleX', U.round(nsx, 3));
    }
    Events.emit('clip:live'); Player.requestRender();
  }
  function onMove(e) {
    if (drag) return; const clip = primaryClip(); const r = overlay.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; let cur = 'default';
    if (clip && isVisualKind(clip.kind) && clip.kind !== 'adjustment' && clip.kind !== 'solid' && state.currentTime >= clip.start && state.currentTime < clipEnd(clip)) { const h = handleAt(gizmoFor(clip), mx, my); if (h === 'rot') cur = 'grab'; else if (h) cur = ({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' })[h]; }
    if (cur === 'default' && hitAt(e)) cur = 'move'; overlay.style.cursor = cur;
  }
  function onDbl(e) { const c = hitAt(e); if (c && c.kind === 'text') { Cmd.select(c.id); setTimeout(() => { const ta = document.querySelector('#inspector textarea[data-path="text.content"]'); if (ta) { ta.focus(); ta.select(); } }, 50); } }

  async function snapshot(format = 'png') {
    const P = state.project; const cv = document.createElement('canvas'); cv.width = P.width; cv.height = P.height; const ctx = cv.getContext('2d');
    const playing = state.playing, rate = state.playRate;
    if (playing) Player.pause();
    const time = state.currentTime;
    try {
      await Exporter.seekAll(time);
      Compositor.renderFrame(ctx, time);
      const blob = await new Promise(resolve => cv.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png', .92));
      if (!blob) throw Error('Image encoder unavailable');
      U.download(blob, `${P.name}_${U.toTimecode(time, P.fps).replace(/:/g, '-')}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    } catch (error) { UI.toast('Frame export failed: ' + error.message); }
    finally { if (playing && state.project === P && state.currentTime === time) Player.play(rate); }
  }
  function fullscreen() { const el = document.getElementById('previewArea'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); }
  return { init, layout, drawOverlay, setZoom, zoomBy, snapshot, fullscreen };
})();
