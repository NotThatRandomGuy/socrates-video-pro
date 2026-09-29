/* ============================================================
   TIMELINE — tracks, clips, ruler, playhead, markers, interactions
============================================================ */
'use strict';

const Timeline = (() => {
  const HEADER_W = 170, RULER_H = 30, PAD_SEC = 10;
  let scrollEl, contentEl, headersEl, rulerCv, tracksEl, playheadEl, marqueeEl, snapLineEl, inoutEl, markersEl;
  let drag = null, lastSnapX = null, hoverTime = null;
  const P = () => state.project;
  const fps = () => P().fps;
  const x2t = (x) => (x) / state.pxPerSec;
  const t2x = (t) => t * state.pxPerSec;
  const trackH = (tr) => Math.round((tr.height || 64) * state.trackHeightScale);

  function init() {
    scrollEl = document.getElementById('tlScroll'); contentEl = document.getElementById('tlContent'); headersEl = document.getElementById('tlHeaders'); rulerCv = document.getElementById('tlRuler'); tracksEl = document.getElementById('tlTracks'); playheadEl = document.getElementById('tlPlayhead'); marqueeEl = document.getElementById('tlMarquee'); snapLineEl = document.getElementById('tlSnapLine'); inoutEl = document.getElementById('tlInOut'); markersEl = document.getElementById('tlMarkers');
    scrollEl.addEventListener('scroll', () => { headersEl.scrollTop = scrollEl.scrollTop; drawRuler(); scheduleClipCanvases(); });
    scrollEl.addEventListener('wheel', onWheel, { passive: false });
    rulerCv.addEventListener('mousedown', onRulerDown); rulerCv.addEventListener('dblclick', (e) => { Cmd.addMarker(snapT(x2t(localX(e)), false)); });
    tracksEl.addEventListener('mousedown', onTracksDown);
    tracksEl.addEventListener('contextmenu', (e) => { e.preventDefault(); const cEl = e.target.closest('.clip'); if (cEl) { const c = findClip(cEl.dataset.id); if (!state.selection.has(c.id)) Cmd.select(c.id); UI.clipContextMenu(e.clientX, e.clientY, c); } else { const trEl = e.target.closest('.track'); UI.timelineContextMenu(e.clientX, e.clientY, trEl ? findTrack(trEl.dataset.id) : null, snapT(x2t(localX(e)), false)); } });
    tracksEl.addEventListener('dragover', (e) => { e.preventDefault(); const trEl = e.target.closest('.track'); U.$$('.track.drop').forEach(t => t.classList.remove('drop')); if (trEl) trEl.classList.add('drop'); showSnap(snapT(x2t(localX(e)))); });
    tracksEl.addEventListener('dragleave', () => { U.$$('.track.drop').forEach(t => t.classList.remove('drop')); hideSnap(); });
    tracksEl.addEventListener('drop', onDrop);
    tracksEl.addEventListener('dblclick', (e) => { const cEl = e.target.closest('.clip'); if (!cEl) return; const c = findClip(cEl.dataset.id); if (c && c.kind === 'text') { const ta = document.querySelector('#inspector textarea[data-path="text.content"]'); if (ta) { ta.focus(); ta.select(); } } });
    Events.on('project:changed', render); Events.on('selection:changed', renderSelection); Events.on('time:changed', updatePlayhead); Events.on('timeline:refresh', render);
    Events.on('clip:live', () => { renderClipsLive(); });
    render();
  }
  const localX = (e) => e.clientX - contentEl.getBoundingClientRect().left;
  const localY = (e) => e.clientY - tracksEl.getBoundingClientRect().top;

  /* ---------------- snapping ---------------- */
  function snapPoints(excludeIds = new Set()) {
    const pts = [0, state.currentTime]; if (P().inPoint !== null) pts.push(P().inPoint); if (P().outPoint !== null) pts.push(P().outPoint);
    P().markers.forEach(m => pts.push(m.time)); allClips().forEach(c => { if (!excludeIds.has(c.id)) { pts.push(c.start, clipEnd(c)); } }); return pts;
  }
  /* returns {t, snapped}: snapped=true only when a real snap point was hit (frame quantization otherwise) */
  function snapInfo(t, useSnap = state.snap, exclude = new Set(), thresholdPx = 8) {
    t = Math.max(0, t);
    if (!useSnap) return { t: U.snapToFrame(t, fps()), snapped: false };
    let best = null, bd = thresholdPx / state.pxPerSec;
    for (const p of snapPoints(exclude)) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best !== null ? { t: best, snapped: true } : { t: U.snapToFrame(t, fps()), snapped: false };
  }
  function snapT(t, useSnap = state.snap, exclude = new Set(), thresholdPx = 8) { return snapInfo(t, useSnap, exclude, thresholdPx).t; }
  function showSnap(t) { snapLineEl.style.display = 'block'; snapLineEl.style.left = t2x(t) + 'px'; }
  function hideSnap() { snapLineEl.style.display = 'none'; }

  /* ---------------- render ---------------- */
  function contentWidth() { return Math.max(scrollEl.clientWidth, t2x(state.duration + PAD_SEC)); }
  function render() {
    recalcDuration();
    const W = contentWidth(); contentEl.style.width = W + 'px';
    renderHeaders(); renderTracks(); drawRuler(); renderMarkers(); renderInOut(); updatePlayhead();
    scheduleClipCanvases();
  }
  function renderHeaders() {
    headersEl.innerHTML = '';
    headersEl.appendChild(U.el('div', { class: 'tl-corner', style: { height: RULER_H + 'px' } }, U.el('button', { class: 'mini', title: 'Add video track', onclick: () => Cmd.addTrack('video') }, '+V'), U.el('button', { class: 'mini', title: 'Add audio track', onclick: () => Cmd.addTrack('audio') }, '+A')));
    for (const tr of displayTracks()) {
      const h = trackH(tr);
      const name = U.el('div', { class: 'tr-name', title: 'Double-click to rename', ondblclick: async () => { const n = await UI.prompt('Track name', tr.name); if (n !== null) Cmd.setTrackProp(tr.id, 'name', n); } }, tr.name || (tr.kind === 'video' ? 'V' : 'A'));
      const btn = (label, prop, title, cls = '') => U.el('button', { class: 'tr-btn ' + cls + (tr[prop] ? ' on' : ''), title, onclick: (e) => { e.stopPropagation(); Cmd.setTrackProp(tr.id, prop, !tr[prop]); } }, label);
      const btns = U.el('div', { class: 'tr-btns' }, tr.kind === 'video' ? btn('👁', 'hidden', 'Hide track', 'eye') : null, btn('M', 'muted', 'Mute'), btn('S', 'solo', 'Solo'), btn('🔒', 'locked', 'Lock track', 'lock'));
      const vol = tr.kind === 'audio' ? U.el('input', { type: 'range', min: 0, max: 1.5, step: .01, value: tr.volume, class: 'tr-vol', title: 'Track volume', oninput: (e) => { tr.volume = +e.target.value; AudioEngine.updateMix(); }, onchange: (e) => Cmd.setTrackProp(tr.id, 'volume', +e.target.value) }) : null;
      const el = U.el('div', { class: 'track-header ' + tr.kind + (state.selectedTrackId === tr.id ? ' sel' : '') + (tr.locked ? ' locked' : ''), style: { height: h + 'px' }, 'data-id': tr.id, onclick: () => { state.selectedTrackId = tr.id; renderHeaders(); }, oncontextmenu: (e) => { e.preventDefault(); UI.trackContextMenu(e.clientX, e.clientY, tr); } }, U.el('div', { class: 'tr-row' }, name, btns), vol);
      headersEl.appendChild(el);
    }
    headersEl.scrollTop = scrollEl.scrollTop;
  }
  function renderTracks() {
    tracksEl.innerHTML = ''; let y = 0;
    for (const tr of displayTracks()) {
      const h = trackH(tr);
      const el = U.el('div', { class: 'track ' + tr.kind + (tr.locked ? ' locked' : '') + (tr.hidden ? ' hidden-track' : ''), style: { height: h + 'px', top: y + 'px' }, 'data-id': tr.id });
      for (const c of tr.clips) el.appendChild(clipEl(c, tr, h));
      tracksEl.appendChild(el); y += h;
    }
    tracksEl.style.height = (y + 40) + 'px'; contentEl.style.height = (RULER_H + y + 40) + 'px';
  }
  function clipEl(c, tr, h) {
    const m = c.mediaId ? findMedia(c.mediaId) : null;
    const el = U.el('div', { class: `clip ${c.kind}` + (state.selection.has(c.id) ? ' selected' : '') + (c.enabled ? '' : ' disabled') + (m && m.missing ? ' missing' : ''), 'data-id': c.id, style: { left: t2x(c.start) + 'px', width: Math.max(4, t2x(c.duration)) + 'px', height: (h - 6) + 'px' } });
    if (c.label && c.label !== 'none' && LABEL_COLORS[c.label]) el.style.setProperty('--clip-color', LABEL_COLORS[c.label]);
    const cv = U.el('canvas', { class: 'clip-cv' }); el.appendChild(cv);
    const name = U.el('div', { class: 'clip-name' }, U.el('span', { class: 'clip-icon' }, ({ video: '🎞', audio: '🔊', image: '🖼', text: 'T', shape: '◆', sticker: '★', solid: '■', adjustment: '⚙' })[c.kind] || ''), ' ', c.kind === 'text' ? (c.text.content || 'Text').split('\n')[0] : c.name, c.speed !== 1 ? U.el('span', { class: 'clip-badge' }, c.speed.toFixed(2) + 'x') : null, c.linkId ? U.el('span', { class: 'clip-badge link', title: 'Linked' }, '🔗') : null, c.effects.length ? U.el('span', { class: 'clip-badge fx', title: c.effects.length + ' effect(s)' }, 'fx') : null);
    el.appendChild(name);
    if (c.transitionIn && c.transitionIn.type !== 'none') el.appendChild(U.el('div', { class: 'trans in', style: { width: Math.min(t2x(c.transitionIn.duration), t2x(c.duration)) + 'px' }, title: 'In: ' + c.transitionIn.type }));
    if (c.transitionOut && c.transitionOut.type !== 'none') el.appendChild(U.el('div', { class: 'trans out', style: { width: Math.min(t2x(c.transitionOut.duration), t2x(c.duration)) + 'px' }, title: 'Out: ' + c.transitionOut.type }));
    if (c.kind === 'audio') { const vol = c.audio.volume; el.appendChild(U.el('div', { class: 'vol-line', style: { bottom: (Math.min(1, vol / 1.5) * (h - 10)) + 'px' } })); }
    if (!tr.locked) { el.appendChild(U.el('div', { class: 'handle left' })); el.appendChild(U.el('div', { class: 'handle right' })); }
    if (c.audio && (c.audio.fadeIn > 0)) el.appendChild(U.el('div', { class: 'fade in', style: { width: t2x(c.audio.fadeIn) + 'px' } }));
    if (c.audio && (c.audio.fadeOut > 0)) el.appendChild(U.el('div', { class: 'fade out', style: { width: t2x(c.audio.fadeOut) + 'px' } }));
    // keyframe lane
    const kts = KF.allTimes(c); if (kts.length) { const lane = U.el('div', { class: 'kf-lane' }); kts.forEach(t => lane.appendChild(U.el('div', { class: 'kf' + (Math.abs(c.start + t - state.currentTime) < .5 / fps() ? ' cur' : ''), style: { left: t2x(t) + 'px' }, title: U.toTimecode(c.start + t, fps()), onmousedown: (e) => { e.stopPropagation(); if (e.altKey) { mutate('Delete keyframes', () => Object.keys(c.keyframes).forEach(k => { c.keyframes[k] = c.keyframes[k].filter(kf => Math.abs(kf.t - t) > 1e-3); if (!c.keyframes[k].length) delete c.keyframes[k]; })); } else { Player.seek(c.start + t); startKfDrag(e, c, t); } } }))); el.appendChild(lane); }
    return el;
  }
  function startKfDrag(e, clip, t0) {
    const x0 = e.clientX; let moved = false; History.begin('Move keyframes');
    const sel = []; Object.values(clip.keyframes).forEach(arr => arr.forEach(kf => { if (Math.abs(kf.t - t0) < 1e-3) sel.push(kf); }));
    const mv = (ev) => { const dt = (ev.clientX - x0) / state.pxPerSec; if (Math.abs(dt) < .01 && !moved) return; moved = true; const nt = U.snapToFrame(U.clamp(t0 + dt, 0, clip.duration), fps()); sel.forEach(kf => kf.t = nt); Player.seek(clip.start + nt); Events.emit('clip:live'); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); Object.values(clip.keyframes).forEach(arr => arr.sort((a, b) => a.t - b.t)); if (moved) { History.commit(); Events.emit('project:changed'); } else History.cancel(); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }
  function renderSelection() { U.$$('.clip', tracksEl).forEach(el => el.classList.toggle('selected', state.selection.has(el.dataset.id))); }
  /* cheap position-only refresh during drags */
  function renderClipsLive() {
    for (const el of U.$$('.clip', tracksEl)) { const c = findClip(el.dataset.id); if (!c) continue; el.style.left = t2x(c.start) + 'px'; el.style.width = Math.max(4, t2x(c.duration)) + 'px'; }
    updatePlayhead();
  }

  /* ---------------- clip canvases (waveform / filmstrip) — only visible portion ---------------- */
  let cvTimer = null;
  function scheduleClipCanvases() { if (cvTimer) return; cvTimer = requestAnimationFrame(() => { cvTimer = null; drawClipCanvases(); }); }
  function drawClipCanvases() {
    const sl = scrollEl.scrollLeft, sw = scrollEl.clientWidth;
    for (const el of U.$$('.clip', tracksEl)) {
      const c = findClip(el.dataset.id); if (!c) continue; const cv = el.querySelector('.clip-cv'); if (!cv) continue;
      const left = t2x(c.start), w = Math.max(4, t2x(c.duration)); const v0 = Math.max(0, sl - left), v1 = Math.min(w, sl + sw - left);
      if (v1 <= v0) { cv.style.display = 'none'; continue; } cv.style.display = 'block';
      const cw = Math.ceil(v1 - v0), ch = el.clientHeight; cv.width = cw; cv.height = ch; cv.style.left = v0 + 'px';
      const ctx = cv.getContext('2d'); const m = c.mediaId ? findMedia(c.mediaId) : null;
      const t0 = c.offset + x2t(v0) * c.speed, t1 = c.offset + x2t(v1) * c.speed; // source time range visible
      if (c.kind === 'audio' && m && m.peaks) { Media.drawPeaks(ctx, m.peaks, t0, t1, 0, 4, cw, ch - 8, 'rgba(255,220,160,.75)'); }
      else if (c.kind === 'video' && m) {
        if (!m.strip) { Media.filmstrip(m); if (m.thumb) { const img = new Image(); img.src = m.thumb; img.onload = () => { for (let x = 0; x < cw; x += ch * 16 / 9) ctx.drawImage(img, x, 0, ch * 16 / 9, ch); }; } }
        else { const fw = Math.max(20, ch * (m.width || 16) / (m.height || 9)); for (let x = 0; x < cw; x += fw) { const st = t0 + x2t(x) * c.speed; let best = m.strip[0]; for (const f of m.strip) if (Math.abs(f.t - st) < Math.abs(best.t - st)) best = f; if (best) ctx.drawImage(best.cvs, x, 0, fw, ch); } }
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cw, 16);
      }
      else if (c.kind === 'image' && m && m.thumb) { const img = new Image(); img.src = m.thumb; img.onload = () => { const fw = ch * (m.width || 16) / (m.height || 9); for (let x = 0; x < cw; x += fw + 2) ctx.drawImage(img, x, 0, fw, ch); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cw, 16); }; }
      // keyframed volume curve for audio
      if (c.kind === 'audio' && KF.has(c, 'audio.volume')) { ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = 0; x <= cw; x += 2) { const lt = x2t(v0 + x); const v = KF.value(c, 'audio.volume', lt); const y = ch - 4 - Math.min(1, v / 1.5) * (ch - 8); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    }
  }

  /* ---------------- ruler ---------------- */
  function drawRuler() {
    const W = scrollEl.clientWidth, sl = scrollEl.scrollLeft; rulerCv.width = W; rulerCv.height = RULER_H; rulerCv.style.left = sl + 'px';
    const ctx = rulerCv.getContext('2d'); ctx.fillStyle = '#25252d'; ctx.fillRect(0, 0, W, RULER_H);
    const pps = state.pxPerSec; const f = fps();
    const steps = [1 / f, 2 / f, 5 / f, 10 / f, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let major = steps.find(s => s * pps >= 80) || 600; let minor = major / (major >= 1 ? (major === 1 ? 4 : major === 2 ? 4 : 5) : 2);
    const tStart = x2t(sl), tEnd = x2t(sl + W);
    ctx.strokeStyle = '#4a4a56'; ctx.fillStyle = '#9a9aa8'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top';
    for (let t = Math.floor(tStart / minor) * minor; t <= tEnd; t += minor) { const x = Math.round(t2x(t) - sl) + .5; const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6; ctx.beginPath(); ctx.moveTo(x, isMajor ? 14 : 22); ctx.lineTo(x, RULER_H); ctx.stroke(); if (isMajor) ctx.fillText(U.toTimecode(t, f, major < 1), x + 3, 3); }
    // in/out shading
    if (P().inPoint !== null || P().outPoint !== null) { const a = P().inPoint ?? 0, b = P().outPoint ?? state.duration; ctx.fillStyle = 'rgba(108,140,255,.25)'; ctx.fillRect(t2x(a) - sl, 0, t2x(b - a), 6); ctx.fillStyle = '#6c8cff'; if (P().inPoint !== null) ctx.fillRect(t2x(a) - sl - 1, 0, 3, 12); if (P().outPoint !== null) ctx.fillRect(t2x(b) - sl - 1, 0, 3, 12); }
    // markers
    for (const m of P().markers) { const x = t2x(m.time) - sl; if (x < -20 || x > W + 20) continue; ctx.fillStyle = LABEL_COLORS[m.color] || '#4f7fe0'; ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x - 6, RULER_H - 8); ctx.lineTo(x - 6, RULER_H - 16); ctx.lineTo(x + 6, RULER_H - 16); ctx.lineTo(x + 6, RULER_H - 8); ctx.closePath(); ctx.fill(); if (m.duration > 0) { ctx.globalAlpha = .4; ctx.fillRect(x, RULER_H - 6, t2x(m.duration), 6); ctx.globalAlpha = 1; } if (m.name) { ctx.fillStyle = '#e8e8ee'; ctx.fillText(m.name, x + 9, RULER_H - 15); } }
    // hover time
    if (hoverTime !== null) { const x = t2x(hoverTime) - sl; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, 0, 1, RULER_H); }
  }
  function renderMarkers() { markersEl.innerHTML = ''; for (const m of P().markers) markersEl.appendChild(U.el('div', { class: 'marker-line', style: { left: t2x(m.time) + 'px', background: LABEL_COLORS[m.color] || '#4f7fe0' } })); }
  function renderInOut() { const a = P().inPoint, b = P().outPoint; if (a === null && b === null) { inoutEl.style.display = 'none'; return; } inoutEl.style.display = 'block'; const s = a ?? 0, e = b ?? state.duration; inoutEl.style.left = t2x(s) + 'px'; inoutEl.style.width = Math.max(0, t2x(e - s)) + 'px'; }
  function updatePlayhead() {
    const x = t2x(state.currentTime); playheadEl.style.left = x + 'px';
    U.$$('.kf', tracksEl).forEach(k => { const c = findClip(k.closest('.clip').dataset.id); k.classList.toggle('cur', c && Math.abs(c.start + x2t(parseFloat(k.style.left)) - state.currentTime) < .5 / fps()); });
    if (state.playing) { const sl = scrollEl.scrollLeft, w = scrollEl.clientWidth; if (x > sl + w - 40) scrollEl.scrollLeft = x - w * .2; else if (x < sl) scrollEl.scrollLeft = Math.max(0, x - w * .2); }
    const tc = document.getElementById('tlTimecode'); if (tc) tc.value = U.toTimecode(state.currentTime, fps());
  }

  /* ---------------- zoom / scroll ---------------- */
  function setZoom(pps, anchorX = null) {
    const old = state.pxPerSec; pps = U.clamp(pps, 1, 1500); if (anchorX === null) anchorX = scrollEl.clientWidth / 2;
    const tAt = x2t(scrollEl.scrollLeft + anchorX); state.pxPerSec = pps; render(); scrollEl.scrollLeft = Math.max(0, t2x(tAt) - anchorX);
    const z = document.getElementById('tlZoom'); if (z) z.value = Math.log(pps);
  }
  function zoomFit() { const w = scrollEl.clientWidth - 40; setZoom(Math.max(2, w / Math.max(1, state.duration || 10))); scrollEl.scrollLeft = 0; }
  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(state.pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - scrollEl.getBoundingClientRect().left); }
    else if (e.altKey) { e.preventDefault(); state.trackHeightScale = U.clamp(state.trackHeightScale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), .5, 3); render(); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); scrollEl.scrollLeft += (e.deltaX || e.deltaY); }
  }
  function scrollToTime(t) { const x = t2x(t), sl = scrollEl.scrollLeft, w = scrollEl.clientWidth; if (x < sl || x > sl + w) scrollEl.scrollLeft = Math.max(0, x - w / 3); }

  /* ---------------- ruler scrub ---------------- */
  function onRulerDown(e) {
    if (e.button !== 0) return; e.preventDefault(); const was = state.playing; if (was) Player.pause();
    // marker drag?
    const mk = P().markers.find(m => Math.abs(t2x(m.time) - localX(e)) < 7);
    if (mk && e.clientY - rulerCv.getBoundingClientRect().top > 12) { let moved = false; History.begin('Move marker'); const mv = (ev) => { moved = true; mk.time = snapT(x2t(localX(ev)), state.snap, new Set(), 6); drawRuler(); renderMarkers(); }; const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (moved) { History.commit(); Events.emit('project:changed'); } else { History.cancel(); UI.markerDialog(mk); } }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); return; }
    const seek = (ev) => Player.seek(U.clamp(x2t(localX(ev)), 0, state.duration), { snap: true });
    seek(e); const mv = (ev) => seek(ev); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }

  /* ---------------- tracks mouse: select / move / trim / razor / marquee ---------------- */
  function trackAtY(y) { let acc = 0; for (const tr of displayTracks()) { const h = trackH(tr); if (y >= acc && y < acc + h) return tr; acc += h; } return null; }
  function onTracksDown(e) {
    if (e.button !== 0) return;
    const cEl = e.target.closest('.clip'); const t = x2t(localX(e));
    if (state.tool === 'razor') { if (cEl) { const c = findClip(cEl.dataset.id); Cmd.splitAt(snapT(t), [c.id, ...Cmd.linkedOf(c).map(l => l.id)]); } e.preventDefault(); return; }
    if (state.tool === 'hand' || e.button === 1) { startPan(e); return; }
    if (!cEl) { if (!e.shiftKey && !e.ctrlKey) Cmd.deselect(); startMarquee(e); return; }
    const clip = findClip(cEl.dataset.id); const track = findTrackOfClip(clip.id); if (!clip) return;
    if (e.ctrlKey || e.metaKey) { Cmd.select(clip.id, { toggle: true, followLinks: !e.altKey }); return; }
    if (e.shiftKey) { Cmd.select(clip.id, { add: true, followLinks: !e.altKey }); }
    else if (!state.selection.has(clip.id)) Cmd.select(clip.id, { followLinks: !e.altKey });
    if (track.locked) return;
    const isHandle = e.target.classList.contains('handle'); const mode = isHandle ? (e.target.classList.contains('left') ? 'trimL' : 'trimR') : 'move';
    // selected clips on unlocked tracks participate
    const clips = selectedClips().filter(c => !findTrackOfClip(c.id).locked);
    const items = clips.map(c => ({ c, start: c.start, dur: c.duration, offset: c.offset, track: findTrackOfClip(c.id), trackIdx: displayTracks().indexOf(findTrackOfClip(c.id)) }));
    drag = { mode, x0: e.clientX, y0: e.clientY, items, primary: clip, moved: false, exclude: new Set(clips.map(c => c.id)), altCopy: e.altKey && mode === 'move' };
    History.begin(mode === 'move' ? 'Move clips' : 'Trim');
    const mv = (ev) => onDragMove(ev), up = (ev) => onDragEnd(ev, mv, up);
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
  }
  function onDragMove(e) {
    if (!drag) return; const dxPx = e.clientX - drag.x0; const dySec = 0;
    if (!drag.moved && Math.abs(dxPx) < 3 && Math.abs(e.clientY - drag.y0) < 3) return; drag.moved = true;
    const dt = dxPx / state.pxPerSec;
    if (drag.mode === 'move') {
      // snap primary clip's start or end
      const prim = drag.items.find(i => i.c === drag.primary); const rawStart = prim.start + dt; const rawEnd = rawStart + prim.dur;
      const sS = snapInfo(rawStart, state.snap && !e.altKey, drag.exclude), sE = snapInfo(rawEnd, state.snap && !e.altKey, drag.exclude);
      let useDt;
      const preferStart = sS.snapped && (!sE.snapped || Math.abs(sS.t - rawStart) <= Math.abs(sE.t - rawEnd));
      if (preferStart) { useDt = sS.t - prim.start; showSnap(sS.t); }
      else if (sE.snapped) { useDt = sE.t - prim.dur - prim.start; showSnap(sE.t); }
      else { useDt = sS.t - prim.start; hideSnap(); }
      const minStart = Math.min(...drag.items.map(i => i.start)); if (minStart + useDt < 0) useDt = -minStart;
      // vertical: track change (only when all selected clips can move by the same row delta and same kind)
      const dts = displayTracks(); const rowDelta = trackRowDelta(e);
      for (const it of drag.items) {
        it.c.start = it.start + useDt;
        const targetIdx = it.trackIdx + rowDelta; const target = dts[targetIdx];
        if (target && target.kind === it.track.kind && !target.locked) { const cur = findTrackOfClip(it.c.id); if (cur !== target) { cur.clips.splice(cur.clips.indexOf(it.c), 1); target.clips.push(it.c); } }
        else { const cur = findTrackOfClip(it.c.id); if (cur !== it.track) { cur.clips.splice(cur.clips.indexOf(it.c), 1); it.track.clips.push(it.c); } }
      }
      // rebuild DOM only when track membership changed
      if (rowDelta !== drag.lastRow) { drag.lastRow = rowDelta; renderTracks(); scheduleClipCanvases(); } else renderClipsLive();
    } else {
      const it = drag.items.find(i => i.c === drag.primary); const c = it.c;
      const linked = drag.items.filter(i => i !== it);
      if (drag.mode === 'trimL') { const ns = snapInfo(it.start + dt, state.snap && !e.altKey, drag.exclude); c.start = it.start; c.duration = it.dur; c.offset = it.offset; Cmd.trimLeft(c, ns.t); ns.snapped ? showSnap(c.start) : hideSnap(); linked.forEach(l => { if (Math.abs(l.start - it.start) < .02) { l.c.start = l.start; l.c.duration = l.dur; l.c.offset = l.offset; Cmd.trimLeft(l.c, c.start); } }); }
      else { const ne = snapInfo(it.start + it.dur + dt, state.snap && !e.altKey, drag.exclude); c.duration = it.dur; Cmd.trimRight(c, ne.t); ne.snapped ? showSnap(clipEnd(c)) : hideSnap(); linked.forEach(l => { if (Math.abs((l.start + l.dur) - (it.start + it.dur)) < .02) { l.c.duration = l.dur; Cmd.trimRight(l.c, clipEnd(c)); } }); }
      renderClipsLive(); Events.emit('clip:live');
    }
    recalcDuration(); Player.requestRender(); Inspector.refreshLive?.();
  }
  function trackRowDelta(e) { const dts = displayTracks(); const y = localY(e); const tr = trackAtY(y); if (!tr) return 0; const prim = drag.items.find(i => i.c === drag.primary); return dts.indexOf(tr) - prim.trackIdx; }
  function onDragEnd(e, mv, up) {
    window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); hideSnap();
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) { History.cancel(); return; }
    if (d.mode === 'move') {
      if (d.altCopy) { // alt-drag duplicates: restore originals, place copies
        const copies = []; for (const it of d.items) { const tr = findTrackOfClip(it.c.id); const copy = U.deepClone(it.c); copy.id = U.uid('c'); copy.linkId = null; const s = it.c.start; it.c.start = it.start; const cur = findTrackOfClip(it.c.id); if (cur !== it.track) { cur.clips.splice(cur.clips.indexOf(it.c), 1); it.track.clips.push(it.c); } copy.start = s; copies.push({ copy, tr }); }
        copies.forEach(({ copy, tr }) => Cmd.placeClip(copy, tr, copy.start, state.ripple ? 'insert' : 'overwrite')); state.selection = new Set(copies.map(x => x.copy.id));
      } else {
        const moving = new Set(d.items.map(i => i.c));
        if (state.ripple) { // insert: shift others at the drop point
          for (const it of d.items) { const tr = findTrackOfClip(it.c.id); const others = tr.clips.filter(c => !moving.has(c) && c.start < clipEnd(it.c) && clipEnd(c) > it.c.start); if (others.length) Cmd.shiftAfter(Math.min(...others.map(o => o.start)), it.c.duration); }
        } else { for (const it of d.items) { const tr = findTrackOfClip(it.c.id); overwriteExcept(tr, it.c, moving); } }
      }
    } else if (state.ripple) { // ripple trim: shift following clips by the change in duration
      const it = d.items.find(i => i.c === d.primary); const delta = it.c.duration - it.dur; if (d.mode === 'trimR' && Math.abs(delta) > 1e-6) Cmd.shiftAfter(it.start + it.dur + 1e-6, delta); if (d.mode === 'trimL' && Math.abs(delta) > 1e-6) { Cmd.shiftAfter(it.start - 1e-6, -delta); }
    }
    P().tracks.forEach(t => t.clips.sort((a, b) => a.start - b.start));
    History.commit(); recalcDuration(); Events.emit('project:changed'); Events.emit('selection:changed');
  }
  function overwriteExcept(track, clip, moving) { for (const o of track.clips.slice()) { if (moving.has(o) || o === clip) continue; if (o.start < clipEnd(clip) && clipEnd(o) > clip.start) Cmd.overwriteRange(track, clip.start, clipEnd(clip), clip); } }

  function startMarquee(e) {
    const x0 = localX(e), y0 = localY(e); let moved = false; const was = state.playing;
    const mv = (ev) => { const x1 = localX(ev), y1 = localY(ev); if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return; moved = true; marqueeEl.style.display = 'block'; const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); Object.assign(marqueeEl.style, { left: l + 'px', top: (t + RULER_H) + 'px', width: w + 'px', height: h + 'px' }); const ta = x2t(l), tb = x2t(l + w); const ids = []; let acc = 0; for (const tr of displayTracks()) { const th = trackH(tr); if (acc < t + h && acc + th > t) tr.clips.forEach(c => { if (c.start < tb && clipEnd(c) > ta) ids.push(c.id); }); acc += th; } Cmd.select(ids, { add: e.shiftKey, followLinks: false }); };
    const up = (ev) => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); marqueeEl.style.display = 'none'; if (!moved) { Player.seek(snapT(x2t(x0), false)); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
  }
  function startPan(e) { const sl = scrollEl.scrollLeft, st = scrollEl.scrollTop, x0 = e.clientX, y0 = e.clientY; const mv = (ev) => { scrollEl.scrollLeft = sl - (ev.clientX - x0); scrollEl.scrollTop = st - (ev.clientY - y0); }; const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault(); }

  /* ---------------- drops ---------------- */
  async function onDrop(e) {
    e.preventDefault(); U.$$('.track.drop').forEach(t => t.classList.remove('drop')); hideSnap();
    const trEl = e.target.closest('.track'); const track = trEl ? findTrack(trEl.dataset.id) : null; const t = snapT(x2t(localX(e)));
    const mediaId = e.dataTransfer.getData('mediaId'); const fxType = e.dataTransfer.getData('fxType'); const transType = e.dataTransfer.getData('transType'); const gen = e.dataTransfer.getData('generator'); const cEl = e.target.closest('.clip');
    if (mediaId) { await Cmd.addMedia(mediaId, { trackId: track ? track.id : null, start: t }); return; }
    if (fxType && cEl) { Cmd.addEffect([cEl.dataset.id], fxType); Cmd.select(cEl.dataset.id); return; }
    if (transType && cEl) { const c = findClip(cEl.dataset.id); const rel = (x2t(localX(e)) - c.start) / c.duration; Cmd.setTransition([c.id], rel < .5 ? 'in' : 'out', transType, .6); return; }
    if (gen) { const g = JSON.parse(gen); Cmd.addGenerated(g.kind, g.over || {}, { start: t, duration: g.duration || 5, name: g.name }); return; }
    const files = Array.from(e.dataTransfer.files || []); if (files.length) { const added = await Media.importFiles(files); let st = t; for (const m of added) { const c = await Cmd.addMedia(m.id, { trackId: track ? track.id : null, start: st }); if (c) st = clipEnd(c); } }
  }

  function setTool(tool) { state.tool = tool; tracksEl.className = 'tl-tracks tool-' + tool; U.$$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); }
  return { init, render, setZoom, zoomFit, scrollToTime, setTool, snapT, drawRuler, RULER_H, HEADER_W };
})();
