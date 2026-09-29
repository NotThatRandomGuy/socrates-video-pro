/* ============================================================
   COMMANDS — every undoable editing operation
============================================================ */
'use strict';

const Cmd = (() => {
  const P = () => state.project;
  const fps = () => P().fps;
  const MIN_DUR = 1 / 60;
  const refresh = () => { recalcDuration(); Events.emit('project:changed'); };

  /* ---------------- selection ---------------- */
  function select(ids, { add = false, toggle = false, followLinks = true } = {}) {
    ids = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    if (followLinks) { const extra = []; ids.forEach(id => { const c = findClip(id); if (c && c.linkId) allClips().filter(x => x.linkId === c.linkId).forEach(x => extra.push(x.id)); }); ids = [...new Set([...ids, ...extra])]; }
    if (toggle) ids.forEach(id => state.selection.has(id) ? state.selection.delete(id) : state.selection.add(id));
    else if (add) ids.forEach(id => state.selection.add(id));
    else state.selection = new Set(ids);
    Events.emit('selection:changed');
  }
  function selectAll() { select(allClips().map(c => c.id)); }
  function deselect() { select([]); }
  function selectForward(t = state.currentTime) { select(allClips().filter(c => c.start >= t - 1e-4).map(c => c.id)); }
  function selectTrackClips(trackId) { const tr = findTrack(trackId); if (tr) select(tr.clips.map(c => c.id)); }

  /* ---------------- tracks ---------------- */
  function addTrack(kind, opts = {}) {
    return mutate('Add track', () => { const t = Model.newTrack(kind); Object.assign(t, opts); const arr = P().tracks; if (kind === 'video') { const lastV = arr.map(x => x.kind).lastIndexOf('video'); arr.splice(lastV + 1, 0, t); } else arr.push(t); t.name = t.name || defaultTrackName(t); return t; });
  }
  function defaultTrackName(t) { const same = P().tracks.filter(x => x.kind === t.kind); return (t.kind === 'video' ? 'V' : 'A') + (same.indexOf(t) + 1); }
  function ensureTrack(kind, index = 0) { const list = P().tracks.filter(t => t.kind === kind); while (list.length <= index) { const t = Model.newTrack(kind); const arr = P().tracks; if (kind === 'video') { const lastV = arr.map(x => x.kind).lastIndexOf('video'); arr.splice(lastV + 1, 0, t); } else arr.push(t); t.name = defaultTrackName(t); list.push(t); } return list[index]; }
  function removeTrack(id) { mutate('Remove track', () => { const t = findTrack(id); if (!t) return; t.clips.forEach(c => { state.selection.delete(c.id); Media.releaseClip(c.id); }); P().tracks = P().tracks.filter(x => x.id !== id); }); refresh(); }
  function moveTrack(id, dir) { mutate('Move track', () => { const arr = P().tracks; const i = arr.findIndex(t => t.id === id); const t = arr[i]; const j = i + dir; if (j < 0 || j >= arr.length || arr[j].kind !== t.kind) return; arr[i] = arr[j]; arr[j] = t; }); }
  function setTrackProp(id, prop, val) { mutate('Track ' + prop, () => { const t = findTrack(id); if (t) t[prop] = val; }); AudioEngine.updateMix(); }
  function cleanEmptyTracks() { mutate('Remove empty tracks', () => { const keep = P().tracks.filter(t => t.clips.length); if (!keep.some(t => t.kind === 'video')) keep.unshift(Model.newTrack('video', 'V1')); if (!keep.some(t => t.kind === 'audio')) keep.push(Model.newTrack('audio', 'A1')); P().tracks = keep; }); }

  /* ---------------- placement ---------------- */
  /* trims/splits clips on `track` overlapping [start, end) except `except` */
  function overwriteRange(track, start, end, except) {
    const out = [];
    for (const c of track.clips.slice()) {
      if (c === except) continue; const ce = clipEnd(c);
      if (ce <= start + 1e-6 || c.start >= end - 1e-6) continue;
      if (c.start >= start && ce <= end) { track.clips.splice(track.clips.indexOf(c), 1); state.selection.delete(c.id); continue; } // fully covered
      if (c.start < start && ce > end) { // split around
        const right = U.deepClone(c); right.id = U.uid('c'); right.linkId = null; const cut = end - c.start; right.start = end; right.duration = ce - end; right.offset = c.offset + cut * c.speed; KF.shift(right, -cut); c.duration = start - c.start; track.clips.push(right); out.push(right); continue;
      }
      if (c.start < start) { c.duration = start - c.start; continue; } // trim tail
      const cut = end - c.start; c.start = end; c.duration = ce - end; c.offset += cut * c.speed; KF.shift(c, -cut); // trim head
    }
    return out;
  }
  function shiftAfter(t, dt, tracks = P().tracks) { tracks.forEach(tr => tr.clips.forEach(c => { if (c.start >= t - 1e-6) c.start += dt; })); P().markers.forEach(m => { if (m.time >= t - 1e-6) m.time += dt; }); }
  /* place clip on track at start; mode 'overwrite' | 'insert' */
  function placeClip(clip, track, start, mode = 'overwrite') {
    clip.start = Math.max(0, start);
    if (mode === 'insert') shiftAfter(clip.start, clip.duration, P().tracks.filter(t => t.kind === track.kind || true));
    else overwriteRange(track, clip.start, clipEnd(clip), clip);
    if (!track.clips.includes(clip)) track.clips.push(clip);
    track.clips.sort((a, b) => a.start - b.start);
  }
  function firstGapFor(track, dur, from = 0) { // first start >= from with no overlap
    const cl = track.clips.slice().sort((a, b) => a.start - b.start); let s = from;
    for (const c of cl) { if (clipEnd(c) <= s) continue; if (c.start >= s + dur) break; s = clipEnd(c); }
    return s;
  }
  function endOf(track) { return track.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0); }

  /* ---------------- add media ---------------- */
  async function addMedia(mediaId, { trackId = null, start = null, mode = null, select: sel = true } = {}) {
    const m = findMedia(mediaId); if (!m) return null;
    if (m.audioReady) await m.audioReady;
    return mutate('Add media', () => {
      const kind = m.type === 'video' ? 'video' : m.type === 'image' ? 'image' : 'audio';
      const dur = m.duration > 0 && isFinite(m.duration) ? m.duration : 5;
      let track = trackId ? findTrack(trackId) : null;
      if (!track || (track.kind === 'audio' && kind !== 'audio') || (track.kind === 'video' && kind === 'audio')) track = ensureTrack(kind === 'audio' ? 'audio' : 'video', 0);
      const st = start === null ? endOf(track) : start;
      const placeMode = mode || (state.ripple ? 'insert' : 'overwrite');
      const clip = Model.newClip(kind, { mediaId, name: m.name, duration: dur, sourceDuration: dur });
      placeClip(clip, track, st, placeMode);
      let aclip = null;
      if (kind === 'video' && m.hasAudio && m.audioBuffer) {
        const linkId = U.uid('ln'); clip.linkId = linkId;
        aclip = Model.newClip('audio', { mediaId, name: m.name, duration: dur, sourceDuration: dur, linkId });
        const at = ensureTrack('audio', 0); placeClip(aclip, at, clip.start, 'overwrite');
      }
      recalcDuration(); if (sel) select(clip.id);
      return clip;
    });
  }
  function addGenerated(kind, over = {}, { start = state.currentTime, duration = 5, trackIndex = null, name } = {}) {
    return mutate('Add ' + kind, () => {
      const clip = Model.newClip(kind, { duration, sourceDuration: duration, name: name || kind.charAt(0).toUpperCase() + kind.slice(1) });
      Object.keys(over).forEach(k => { if (typeof over[k] === 'object' && clip[k] && !Array.isArray(over[k])) Object.assign(clip[k], over[k]); else clip[k] = over[k]; });
      // choose the topmost free video track (or create one) at start
      let track = null; const vts = videoTracks();
      if (trackIndex !== null) track = ensureTrack('video', trackIndex);
      else { for (const t of vts) if (!t.locked && !t.clips.some(c => c.start < start + duration && clipEnd(c) > start)) { track = t; break; } if (!track) track = ensureTrack('video', vts.length); }
      placeClip(clip, track, start, 'overwrite'); recalcDuration(); select(clip.id); return clip;
    });
  }

  /* ---------------- delete / ripple ---------------- */
  function deleteClips(ids = [...state.selection], ripple = state.ripple) {
    if (!ids.length) return;
    mutate(ripple ? 'Ripple delete' : 'Delete', () => {
      const removed = [];
      for (const id of ids) { const t = findTrackOfClip(id); const c = findClip(id); if (!t || !c || t.locked) continue; t.clips.splice(t.clips.indexOf(c), 1); removed.push({ c, t }); Media.releaseClip(id); }
      state.selection.clear();
      if (ripple) { removed.sort((a, b) => b.c.start - a.c.start).forEach(({ c, t }) => { const gapEnd = clipEnd(c); const next = t.clips.filter(x => x.start >= c.start - 1e-6).sort((a, b) => a.start - b.start)[0]; const gap = (next ? Math.min(next.start, gapEnd) : gapEnd) - c.start; if (gap > 0) shiftAfter(gapEnd - 1e-6, -gap); }); }
    }); refresh(); Events.emit('selection:changed');
  }
  function rippleDeleteGap(track, t) { // delete empty gap at time t on track
    const sorted = track.clips.slice().sort((a, b) => a.start - b.start); const prev = sorted.filter(c => clipEnd(c) <= t).pop(); const next = sorted.find(c => c.start >= t);
    if (!next) return; const gs = prev ? clipEnd(prev) : 0; const gap = next.start - gs; if (gap <= 0) return;
    mutate('Close gap', () => shiftAfter(next.start - 1e-6, -gap)); refresh();
  }
  function closeAllGaps(trackId) { const tr = findTrack(trackId); if (!tr) return; mutate('Close gaps', () => { let pos = 0; tr.clips.slice().sort((a, b) => a.start - b.start).forEach(c => { c.start = pos; pos += c.duration; }); }); refresh(); }

  /* ---------------- split ---------------- */
  function splitClip(clip, t, track = findTrackOfClip(clip.id)) {
    if (t <= clip.start + MIN_DUR || t >= clipEnd(clip) - MIN_DUR) return null;
    const cut = t - clip.start; const right = U.deepClone(clip); right.id = U.uid('c'); right.start = t; right.duration = clip.duration - cut; right.offset = clip.offset + cut * clip.speed;
    right.transitionIn = { type: 'none', duration: .5 }; clip.transitionOut = { type: 'none', duration: .5 };
    if (clip.linkId) { right.linkId = clip.linkId + '_r'; } // keep linked halves linked to each other
    KF.shift(right, -cut); Object.keys(right.keyframes || {}).forEach(k => { right.keyframes[k] = right.keyframes[k].filter(kf => kf.t >= -1e-6); if (!right.keyframes[k].length) delete right.keyframes[k]; });
    Object.keys(clip.keyframes || {}).forEach(k => { clip.keyframes[k] = clip.keyframes[k].filter(kf => kf.t <= cut + 1e-6); if (!clip.keyframes[k].length) delete clip.keyframes[k]; });
    clip.duration = cut; track.clips.push(right); track.clips.sort((a, b) => a.start - b.start); return right;
  }
  function splitAt(t = state.currentTime, ids = null) {
    const targets = ids ? ids.map(findClip).filter(Boolean) : (state.selection.size ? selectedClips() : allClips().filter(c => !findTrackOfClip(c.id).locked));
    const hits = targets.filter(c => t > c.start + MIN_DUR && t < clipEnd(c) - MIN_DUR); if (!hits.length) return;
    mutate('Split', () => { const linkMap = {}; hits.forEach(c => { const r = splitClip(c, t); if (r && c.linkId) { if (!linkMap[c.linkId]) linkMap[c.linkId] = U.uid('ln'); r.linkId = linkMap[c.linkId]; } }); }); refresh();
  }

  /* ---------------- move / trim (used by timeline drags; caller wraps History) ---------------- */
  function moveClipTo(clip, newStart, newTrack) {
    const oldTrack = findTrackOfClip(clip.id);
    if (newTrack && newTrack !== oldTrack) { if (newTrack.kind !== oldTrack.kind || newTrack.locked) return false; oldTrack.clips.splice(oldTrack.clips.indexOf(clip), 1); newTrack.clips.push(clip); }
    clip.start = Math.max(0, newStart); return true;
  }
  function trimLeft(clip, newStart) {
    const maxStart = clipEnd(clip) - MIN_DUR; newStart = U.clamp(newStart, isUnbounded(clip) ? 0 : Math.max(0, clip.start - clip.offset / clip.speed), maxStart);
    const d = newStart - clip.start; if (Math.abs(d) < 1e-9) return;
    clip.start = newStart; clip.duration -= d; if (!isUnbounded(clip)) clip.offset += d * clip.speed; KF.shift(clip, -d);
  }
  function trimRight(clip, newEnd) {
    const maxEnd = isUnbounded(clip) ? Infinity : clip.start + (clip.sourceDuration - clip.offset) / clip.speed;
    newEnd = U.clamp(newEnd, clip.start + MIN_DUR, maxEnd); clip.duration = newEnd - clip.start;
  }
  function linkedOf(clip) { return clip.linkId ? allClips().filter(c => c.linkId === clip.linkId && c !== clip) : []; }

  /* ---------------- clipboard ---------------- */
  function copy() { const cs = selectedClips(); if (!cs.length) return; const t0 = Math.min(...cs.map(c => c.start)); state.clipboard = cs.map(c => ({ clip: U.deepClone(c), rel: c.start - t0, trackId: findTrackOfClip(c.id).id, kind: findTrackOfClip(c.id).kind, trackIndex: P().tracks.filter(t => t.kind === findTrackOfClip(c.id).kind).indexOf(findTrackOfClip(c.id)) })); UI.toast(`Copied ${cs.length} clip(s)`); }
  function cut() { copy(); deleteClips(); }
  function paste(t = state.currentTime) {
    if (!state.clipboard) return;
    mutate('Paste', () => {
      const linkMap = {}; const ids = [];
      for (const it of state.clipboard) {
        const c = U.deepClone(it.clip); c.id = U.uid('c'); if (c.linkId) { linkMap[c.linkId] = linkMap[c.linkId] || U.uid('ln'); c.linkId = linkMap[c.linkId]; }
        const track = findTrack(it.trackId) || ensureTrack(it.kind, it.trackIndex);
        placeClip(c, track, t + it.rel, state.ripple ? 'insert' : 'overwrite'); ids.push(c.id);
      }
      state.selection = new Set(ids);
    }); refresh(); Events.emit('selection:changed');
  }
  function duplicate() { const cs = selectedClips(); if (!cs.length) return; const end = Math.max(...cs.map(clipEnd)); const saved = state.clipboard; copy(); paste(end); state.clipboard = saved; }
  function pasteAttributes() {
    if (!state.clipboard || !state.clipboard.length) return; const src = state.clipboard[0].clip;
    mutate('Paste attributes', () => selectedClips().forEach(c => { c.transform = U.deepClone(src.transform); c.effects = U.deepClone(src.effects).map(f => ({ ...f, id: U.uid('fx') })); c.crop = U.deepClone(src.crop); c.blend = src.blend; c.fit = src.fit; c.cornerRadius = src.cornerRadius; if (c.text && src.text) { const content = c.text.content; c.text = U.deepClone(src.text); c.text.content = content; } if (c.audio && src.audio) c.audio = U.deepClone(src.audio); }));
  }

  /* ---------------- clip properties ---------------- */
  function setProp(clip, path, val, label = 'Edit') { mutate(label, () => U.setPath(clip, path, val)); }
  function setPropMany(path, val, label = 'Edit') { mutate(label, () => selectedClips().forEach(c => U.setPath(c, path, val))); }
  function setSpeed(clip, speed) {
    mutate('Speed', () => { const targets = [clip, ...linkedOf(clip)]; targets.forEach(c => { const s0 = c.speed || 1; c.speed = speed; c.duration = c.duration * s0 / speed; KF.scale(c, s0 / speed); }); }); refresh();
  }
  function setEnabled(ids, on) { mutate('Enable/disable', () => ids.map(findClip).filter(Boolean).forEach(c => c.enabled = on)); }
  function setLabel(ids, label) { mutate('Label', () => ids.map(findClip).filter(Boolean).forEach(c => c.label = label)); }
  function rename(clip, name) { mutate('Rename', () => clip.name = name); }
  function unlink(ids = [...state.selection]) { mutate('Unlink', () => ids.map(findClip).filter(Boolean).forEach(c => c.linkId = null)); }
  function link(ids = [...state.selection]) { if (ids.length < 2) return; mutate('Link', () => { const id = U.uid('ln'); ids.map(findClip).filter(Boolean).forEach(c => c.linkId = id); }); }
  function detachAudio(clip) { unlink([clip.id, ...linkedOf(clip).map(c => c.id)]); }
  function nudge(dt, ids = [...state.selection]) { mutate('Nudge', () => ids.map(findClip).filter(Boolean).forEach(c => c.start = Math.max(0, c.start + dt))); refresh(); }
  function nudgeTrack(dir) { mutate('Move to track', () => { for (const c of selectedClips()) { const tr = findTrackOfClip(c.id); const same = P().tracks.filter(t => t.kind === tr.kind); const i = same.indexOf(tr) + dir; if (i < 0 || i >= same.length || same[i].locked) continue; tr.clips.splice(tr.clips.indexOf(c), 1); same[i].clips.push(c); } }); }
  function alignToPlayhead(edge = 'start') { mutate('Align', () => selectedClips().forEach(c => { c.start = edge === 'start' ? state.currentTime : Math.max(0, state.currentTime - c.duration); })); refresh(); }
  function setTransition(ids, side, type, duration) { mutate('Transition', () => ids.map(findClip).filter(Boolean).forEach(c => { c[side === 'in' ? 'transitionIn' : 'transitionOut'] = { type, duration: duration ?? c.transitionIn.duration }; })); }
  function applyTransitionBetweenSelected(type, duration = .6) { // for adjacent pairs among selection, transitionIn on the later clip
    mutate('Transition', () => { const cs = selectedClips(); if (cs.length === 1) { cs[0].transitionIn = { type, duration }; cs[0].transitionOut = { type, duration }; return; } cs.forEach(c => { const tr = findTrackOfClip(c.id); const prev = tr.clips.filter(x => Math.abs(clipEnd(x) - c.start) < .02 && x !== c)[0]; if (prev) c.transitionIn = { type, duration }; else c.transitionIn = { type, duration }; }); });
  }
  function addEffect(ids, type) { let fx = null; mutate('Add effect', () => ids.map(findClip).filter(Boolean).forEach(c => { fx = Model.newEffect(type); if (fx) c.effects.push(fx); })); if (fx) state.selectedEffectId = fx.id; return fx; }
  function removeEffect(clip, fxId) { mutate('Remove effect', () => { clip.effects = clip.effects.filter(f => f.id !== fxId); Object.keys(clip.keyframes || {}).forEach(k => { if (k.startsWith('fx.' + fxId + '.')) delete clip.keyframes[k]; }); }); }
  function moveEffect(clip, fxId, dir) { mutate('Reorder effect', () => { const i = clip.effects.findIndex(f => f.id === fxId); const j = i + dir; if (i < 0 || j < 0 || j >= clip.effects.length) return;[clip.effects[i], clip.effects[j]] = [clip.effects[j], clip.effects[i]]; }); }
  function resetTransform(clip) { mutate('Reset transform', () => { clip.transform = Model.newClip(clip.kind).transform; ['transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotation', 'transform.opacity', 'transform.anchorX', 'transform.anchorY'].forEach(p => KF.clear(clip, p)); }); }
  function fitToFrame(clip, mode) { mutate('Fit', () => { clip.fit = mode; clip.transform.scaleX = clip.transform.scaleY = 1; clip.transform.x = clip.transform.y = 0; }); }
  function normalizeAudio(clip) { mutate('Normalize', () => { const pk = AudioEngine.peakOf(clip); clip.audio.normalize = U.clamp(.98 / pk, .1, 10); }); }

  /* ---------------- keyframes ---------------- */
  function toggleKeyframe(clip, path, lt = state.currentTime - clip.start) {
    lt = U.clamp(lt, 0, clip.duration); const has = KF.at(clip, path, lt);
    mutate(has ? 'Remove keyframe' : 'Add keyframe', () => { if (has) KF.remove(clip, path, lt); else { const v = path.startsWith('fx.') ? fxParamValue(clip, path, lt) : (KF.has(clip, path) ? KF.value(clip, path, lt) : U.getPath(clip, path)); KF.set(clip, path, lt, v); } });
  }
  function fxParamValue(clip, path, lt) { const [, fxId, param] = path.split('.'); const fx = clip.effects.find(f => f.id === fxId); return fx ? KF.fxValue(clip, fx, param, lt) : 0; }
  /* set a value: if the property has keyframes, write/update a keyframe at playhead, else set base */
  function setAnimated(clip, path, val, label = 'Edit') {
    const lt = U.clamp(state.currentTime - clip.start, 0, clip.duration);
    History.begin(label);
    if (KF.has(clip, path)) KF.set(clip, path, lt, val);
    else if (path.startsWith('fx.')) { const [, fxId, param] = path.split('.'); const fx = clip.effects.find(f => f.id === fxId); if (fx) fx.params[param] = val; }
    else U.setPath(clip, path, val);
    History.commit(label); Events.emit('project:changed');
  }
  function setKeyframeEase(clip, path, lt, ease) { mutate('Easing', () => { const k = KF.at(clip, path, lt); if (k) k.ease = ease; }); }
  function clearKeyframes(clip, path) { mutate('Clear keyframes', () => KF.clear(clip, path)); }
  function nextKeyframeTime(clip, dir) { const ts = KF.allTimes(clip).map(t => t + clip.start); const cur = state.currentTime; return dir > 0 ? ts.find(t => t > cur + 1e-4) : ts.slice().reverse().find(t => t < cur - 1e-4); }

  /* ---------------- markers / in-out ---------------- */
  function addMarker(t = state.currentTime, name = '', color = 'blue') { mutate('Add marker', () => { const ex = P().markers.find(m => Math.abs(m.time - t) < .5 / fps()); if (ex) { ex.name = name || ex.name; return; } P().markers.push(Model.newMarker(t, name, color)); P().markers.sort((a, b) => a.time - b.time); }); }
  function removeMarker(id) { mutate('Remove marker', () => P().markers = P().markers.filter(m => m.id !== id)); }
  function updateMarker(id, props) { mutate('Edit marker', () => { const m = P().markers.find(x => x.id === id); if (m) Object.assign(m, props); }); }
  function clearMarkers() { mutate('Clear markers', () => P().markers = []); }
  function setIn(t = state.currentTime) { mutate('Set In', () => { P().inPoint = t; if (P().outPoint !== null && P().outPoint <= t) P().outPoint = null; }); }
  function setOut(t = state.currentTime) { mutate('Set Out', () => { P().outPoint = t; if (P().inPoint !== null && P().inPoint >= t) P().inPoint = null; }); }
  function clearInOut() { mutate('Clear In/Out', () => { P().inPoint = null; P().outPoint = null; }); }
  function extractInOut(lift = false) { // remove content between in/out
    const a = P().inPoint, b = P().outPoint; if (a === null || b === null) return;
    mutate(lift ? 'Lift' : 'Extract', () => { P().tracks.forEach(tr => { if (!tr.locked) overwriteRange(tr, a, b, null); }); if (!lift) shiftAfter(b - 1e-6, -(b - a)); P().inPoint = null; P().outPoint = null; }); refresh();
  }

  /* ---------------- freeze frame / misc ---------------- */
  async function freezeFrame(clip = primaryClip(), t = state.currentTime) {
    if (!clip || clip.kind !== 'video') return UI.toast('Select a video clip');
    const m = findMedia(clip.mediaId); const lt = clip.offset + (t - clip.start) * clip.speed;
    const frame = await Media.grabFrame(m, lt, 4096); if (!frame) return UI.toast('Could not grab frame');
    const blob = await new Promise(r => frame.toBlob(r, 'image/png'));
    const file = new File([blob], `${m.name.replace(/\.[^.]+$/, '')}_freeze_${t.toFixed(2)}.png`, { type: 'image/png' });
    const [im] = await Media.importFiles([file]);
    mutate('Freeze frame', () => { const tr = findTrackOfClip(clip.id); splitClip(clip, t, tr); const fc = Model.newClip('image', { mediaId: im.id, name: im.name, duration: 2, sourceDuration: 2, transform: U.deepClone(clip.transform), effects: U.deepClone(clip.effects), fit: clip.fit, crop: U.deepClone(clip.crop) }); shiftAfter(t, 2); placeClip(fc, tr, t, 'overwrite'); select(fc.id); }); refresh();
  }
  function setProjectSize(w, h) { if (![w, h].every(v => Number.isFinite(v) && v >= 2 && v <= 8192)) return false; mutate('Canvas size', () => { P().width = Math.round(w); P().height = Math.round(h); delete P().canvasCrop; }); Compositor.clearCaches(); Events.emit('project:resized'); }
  function cropCanvas(rect) {
    const p = P(), sourceWidth = p.canvasCrop?.sourceWidth || p.width, sourceHeight = p.canvasCrop?.sourceHeight || p.height;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return false;
    const width = U.clamp(Math.round(rect.width), 2, sourceWidth), height = U.clamp(Math.round(rect.height), 2, sourceHeight);
    const x = U.clamp(Math.round(rect.x), 0, sourceWidth - width), y = U.clamp(Math.round(rect.y), 0, sourceHeight - height);
    mutate('Crop canvas', () => { p.canvasCrop = { sourceWidth, sourceHeight, x, y }; p.width = width; p.height = height; });
    Compositor.clearCaches(); Events.emit('project:resized'); return true;
  }
  function resetCanvasCrop() {
    const p = P(); if (!p.canvasCrop) return;
    mutate('Restore canvas', () => { p.width = p.canvasCrop.sourceWidth; p.height = p.canvasCrop.sourceHeight; delete p.canvasCrop; });
    Compositor.clearCaches(); Events.emit('project:resized');
  }
  function centerClip(axis = 'both') {
    mutate('Center in canvas', () => selectedClips().forEach(c => {
      if (!isVisualKind(c.kind) || ['solid', 'adjustment'].includes(c.kind) || findTrackOfClip(c.id)?.locked) return;
      const b = Compositor.clipBounds(c, state.currentTime), e = evalClip(c, state.currentTime);
      const [x, y] = U.rotatePoint(b.x - b.ax * b.w, b.y - b.ay * b.h, b.x, b.y, b.rot);
      const lt = U.clamp(state.currentTime - c.start, 0, c.duration);
      for (const [a, v] of [['x', e.x + P().width / 2 - x], ['y', e.y + P().height / 2 - y]]) {
        if (axis !== 'both' && axis !== a) continue;
        const path = 'transform.' + a; if (KF.has(c, path)) KF.set(c, path, lt, v); else U.setPath(c, path, v);
      }
    }));
  }
  function setFps(f) { mutate('Frame rate', () => P().fps = f); }
  function setBackground(c) { mutate('Background', () => P().background = c); }

  return { select, selectAll, deselect, selectForward, selectTrackClips, addTrack, removeTrack, moveTrack, setTrackProp, cleanEmptyTracks, ensureTrack, placeClip, overwriteRange, shiftAfter, firstGapFor, endOf, addMedia, addGenerated, deleteClips, rippleDeleteGap, closeAllGaps, splitClip, splitAt, moveClipTo, trimLeft, trimRight, linkedOf, copy, cut, paste, duplicate, pasteAttributes, setProp, setPropMany, setSpeed, setEnabled, setLabel, rename, unlink, link, detachAudio, nudge, nudgeTrack, alignToPlayhead, setTransition, applyTransitionBetweenSelected, addEffect, removeEffect, moveEffect, resetTransform, fitToFrame, normalizeAudio, toggleKeyframe, setAnimated, setKeyframeEase, clearKeyframes, nextKeyframeTime, fxParamValue, addMarker, removeMarker, updateMarker, clearMarkers, setIn, setOut, clearInOut, extractInOut, freezeFrame, cropCanvas, resetCanvasCrop, centerClip, setProjectSize, setFps, setBackground, MIN_DUR };
})();
