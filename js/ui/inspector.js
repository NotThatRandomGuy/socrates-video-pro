/* ============================================================
   INSPECTOR — properties panel with keyframe-aware controls
============================================================ */
'use strict';

const Inspector = (() => {
  let root, interacting = false, began = false;
  const FONTS = ['Montserrat', 'Inter', 'Roboto', 'Oswald', 'Anton', 'Bebas Neue', 'Playfair Display', 'Lora', 'Caveat', 'Pacifico', 'Poppins', 'Raleway', 'Lobster', 'Dancing Script', 'Press Start 2P', 'Impact', 'Arial', 'Georgia', 'Courier New', 'Segoe UI', 'Times New Roman'];
  const TEXT_ANIMS = ['none', 'fade', 'typewriter', 'slide-up', 'slide-down', 'slide-left', 'pop', 'blur-in', 'char-rise', 'char-pop', 'word-fade', 'word-rise', 'line-slide', 'wave', 'shuffle', 'scale-in', 'zoom-out'];
  const TEXT_ANIMS_OUT = ['none', 'fade', 'slide-up', 'slide-down', 'scale-out', 'zoom-out', 'typewriter', 'char-drop'];
  const MOTIONS = ['none', 'ken-burns-in', 'ken-burns-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'drift', 'float', 'pulse', 'shake', 'spin', 'wobble', 'bounce-in', 'zoom-pulse-in'];

  function init() {
    root = document.getElementById('inspector');
    Events.on('selection:changed', render); Events.on('project:changed', () => { if (!interacting) render(); else refreshLive(); }); Events.on('time:changed', refreshLive);
    Events.on('clip:live', refreshLive);
    render();
  }
  const lt = (clip) => U.clamp(state.currentTime - clip.start, 0, clip.duration);
  function readVal(clip, path) { if (path.startsWith('fx.')) return Cmd.fxParamValue(clip, path, lt(clip)); return KF.has(clip, path) ? KF.value(clip, path, lt(clip)) : U.getPath(clip, path); }
  function writeVal(clip, path, val, commit) {
    if (findTrackOfClip(clip.id)?.locked || (typeof val === 'number' && !Number.isFinite(val))) return;
    if (!began) { History.begin('Edit'); began = true; }
    if (KF.has(clip, path)) KF.set(clip, path, lt(clip), val);
    else if (path.startsWith('fx.')) { const [, id, p] = path.split('.'); const fx = clip.effects.find(f => f.id === id); if (fx) fx.params[p] = val; }
    else U.setPath(clip, path, val);
    if (path.startsWith('text.') || path.startsWith('shape.') || path === 'cornerRadius') Compositor.clearCaches();
    if (commit) { began = false; interacting = false; History.commit('Edit'); Events.emit('project:changed'); }
    else { interacting = true; Events.emit('clip:live'); Player.requestRender(); if (path.startsWith('audio.') && state.playing) AudioEngine.reschedule(); }
  }

  /* ---- field builders ---- */
  function group(title, ...children) { const g = U.el('div', { class: 'group' }); const head = U.el('h4', { onclick: () => g.classList.toggle('collapsed') }, title); g.append(head, U.el('div', { class: 'group-body' }, ...children)); return g; }
  function kfBtn(clip, path) {
    if (!path) return null; const on = !!KF.at(clip, path, lt(clip)); const has = KF.has(clip, path);
    return U.el('button', { class: 'kf-btn' + (on ? ' on' : has ? ' has' : ''), title: on ? 'Remove keyframe at playhead' : 'Add keyframe at playhead', onclick: () => Cmd.toggleKeyframe(clip, path), oncontextmenu: (e) => { e.preventDefault(); UI.menu(e.clientX, e.clientY, [{ label: 'Clear all keyframes', action: () => Cmd.clearKeyframes(clip, path) }, { label: 'Previous keyframe', action: () => { const t = Cmd.nextKeyframeTime(clip, -1); if (t !== undefined) Player.seek(t); } }, { label: 'Next keyframe', action: () => { const t = Cmd.nextKeyframeTime(clip, 1); if (t !== undefined) Player.seek(t); } }, ...(KF.at(clip, path, lt(clip)) ? [{ sep: true }, ...U.EASINGS.map(e => ({ label: 'Ease: ' + e, check: KF.at(clip, path, lt(clip)).ease === e, action: () => Cmd.setKeyframeEase(clip, path, lt(clip), e) }))] : [])]); } }, '◆');
  }
  function num(clip, label, path, { min = -1e9, max = 1e9, step = 1, keyable = false, unit = '', digits = 2, live = true } = {}) {
    const v = readVal(clip, path);
    const range = (min > -1e8 && max < 1e8) ? U.el('input', { type: 'range', min, max, step, value: v, 'data-path': path }) : null;
    const number = U.el('input', { type: 'number', step, value: U.round(v, digits), 'data-path': path, class: 'num' });
    const upd = (val, commit) => { val = U.clamp(+val, min, max); if (isNaN(val)) return; writeVal(clip, path, val, commit); if (range) range.value = val; number.value = U.round(val, digits); };
    if (range) { range.oninput = () => upd(range.value, false); range.onchange = () => upd(range.value, true); range.ondblclick = () => { const d = defaultOf(clip, path); if (d !== undefined) upd(d, true); }; }
    number.onchange = () => upd(number.value, true); number.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); upd(+number.value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), true); } };
    // drag-to-scrub on label
    const lab = U.el('label', { class: 'scrub', title: 'Drag to scrub' }, label); lab.onmousedown = (e) => { const x0 = e.clientX, v0 = +number.value; const mv = (ev) => upd(v0 + (ev.clientX - x0) * step * (ev.shiftKey ? 10 : 1), false); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); upd(number.value, true); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault(); };
    return U.el('div', { class: 'field' + (keyable && KF.has(clip, path) ? ' animated' : '') }, U.el('div', { class: 'field-head' }, keyable ? kfBtn(clip, path) : U.el('span', { class: 'kf-space' }), lab, unit ? U.el('span', { class: 'unit' }, unit) : null, number), range);
  }
  function defaultOf(clip, path) { if (path.startsWith('fx.')) { const [, id, p] = path.split('.'); const fx = clip.effects.find(f => f.id === id); return fx && EFFECT_DEFS[fx.type].params[p]?.def; } return U.getPath(Model.newClip(clip.kind), path); }
  function sel(clip, label, path, options, { labels = null, onchange = null } = {}) {
    const v = readVal(clip, path); const s = U.el('select', { 'data-path': path }, options.map((o, i) => U.el('option', { value: o, selected: String(o) === String(v) }, labels ? labels[i] : o)));
    s.onchange = () => { let val = s.value; if (typeof options[0] === 'number') val = +val; if (typeof options[0] === 'boolean') val = val === 'true'; writeVal(clip, path, val, true); onchange && onchange(val); };
    return U.el('div', { class: 'field row' }, U.el('label', {}, label), s);
  }
  function color(clip, label, path) { const v = readVal(clip, path) || '#000000'; const i = U.el('input', { type: 'color', value: v.length === 7 ? v : '#000000', 'data-path': path }); i.oninput = () => writeVal(clip, path, i.value, false); i.onchange = () => writeVal(clip, path, i.value, true); return U.el('div', { class: 'field row' }, U.el('label', {}, label), i); }
  function check(clip, label, path, { onchange } = {}) { const i = U.el('input', { type: 'checkbox', checked: !!readVal(clip, path), 'data-path': path }); i.onchange = () => { writeVal(clip, path, i.checked, true); onchange && onchange(i.checked); }; return U.el('div', { class: 'field row' }, U.el('label', {}, label), i); }
  function text(clip, label, path, { area = false, rows = 3 } = {}) { const v = readVal(clip, path) ?? ''; const i = area ? U.el('textarea', { rows, 'data-path': path }) : U.el('input', { type: 'text', value: v, 'data-path': path }); if (area) i.value = v; i.oninput = () => writeVal(clip, path, i.value, false); i.onchange = () => writeVal(clip, path, i.value, true); i.onblur = () => { if (began) writeVal(clip, path, i.value, true); }; return U.el('div', { class: 'field' }, U.el('label', {}, label), i); }
  function btnRow(...btns) { return U.el('div', { class: 'btn-row' }, ...btns); }
  function btn(label, fn, cls = '') { return U.el('button', { class: cls, onclick: fn }, label); }
  const row2 = (...f) => U.el('div', { class: 'row2' }, ...f);

  /* ---- live refresh of values without rebuilding (keyframes / drags) ---- */
  function refreshLive() {
    const clip = primaryClip(); if (!clip || !root) return;
    for (const inp of U.$$('[data-path]', root)) {
      if (inp === document.activeElement) continue; const path = inp.dataset.path; const v = readVal(clip, path);
      if (inp.type === 'checkbox') inp.checked = !!v; else if (inp.tagName === 'SELECT') inp.value = String(v); else if (inp.type === 'color') { if (typeof v === 'string' && v.length === 7) inp.value = v; } else if (inp.type === 'number') inp.value = U.round(v, 3); else if (inp.type === 'range') inp.value = v; else if (typeof v !== 'object') inp.value = v ?? '';
    }
    for (const b of U.$$('.kf-btn', root)) { /* rebuilt on render only */ }
    const tc = U.$('#inspStart', root); if (tc) tc.value = U.toTimecode(clip.start, state.project.fps);
    const td = U.$('#inspDur', root); if (td) td.value = U.toTimecode(clip.duration, state.project.fps);
  }

  /* ---- render ---- */
  function render() {
    if (!root) return; began = false; interacting = false;
    const clip = primaryClip(); root.innerHTML = '';
    if (!clip) { if (state.selectedTrackId && findTrack(state.selectedTrackId)) renderTrack(findTrack(state.selectedTrackId)); else renderProject(); return; }
    const kinds = tabsFor(clip); if (!kinds.includes(state.activeInspectorTab)) state.activeInspectorTab = kinds[0];
    const tabs = U.el('div', { class: 'insp-tabs' }, kinds.map(k => U.el('button', { class: 'insp-tab' + (state.activeInspectorTab === k ? ' active' : ''), onclick: () => { state.activeInspectorTab = k; render(); } }, tabLabel(k))));
    root.append(U.el('div', { class: 'insp-title' }, U.el('span', { class: 'kind-badge ' + clip.kind }, clip.kind), U.el('span', { class: 'insp-name', title: clip.name }, clip.name), state.selection.size > 1 ? U.el('span', { class: 'muted' }, ` +${state.selection.size - 1}`) : null), tabs);
    const body = U.el('div', { class: 'insp-body' }); root.appendChild(body);
    ({ video: renderVideo, audio: renderAudio, effects: renderEffects, text: renderText, shape: renderShape, sticker: renderSticker, solid: renderSolid, clip: renderClipInfo })[state.activeInspectorTab](body, clip);
    if (findTrackOfClip(clip.id)?.locked) { body.inert = true; root.append(U.el('p', { class: 'hint pad' }, 'Unlock this track to edit its clips.')); }
  }
  function tabsFor(c) { const t = ['clip']; if (isVisualKind(c.kind) && c.kind !== 'adjustment') t.push('video'); if (c.kind === 'text') t.push('text'); if (c.kind === 'shape') t.push('shape'); if (c.kind === 'sticker') t.push('sticker'); if (c.kind === 'solid') t.push('solid'); if (c.kind === 'audio') t.push('audio'); if (c.kind !== 'audio') t.push('effects'); return t; }
  function tabLabel(k) { return ({ clip: 'Clip', video: 'Video', audio: 'Audio', effects: 'Effects', text: 'Text', shape: 'Shape', sticker: 'Sticker', solid: 'Fill' })[k]; }

  function renderClipInfo(body, c) {
    const fps = state.project.fps; const m = c.mediaId ? findMedia(c.mediaId) : null;
    const start = U.el('input', { id: 'inspStart', value: U.toTimecode(c.start, fps), class: 'tc' }); start.onchange = () => { const t = U.parseTimecode(start.value, fps); if (!isNaN(t)) { mutate('Start', () => { c.start = Math.max(0, t); Cmd.linkedOf(c).forEach(l => l.start = Math.max(0, t)); }); } };
    const dur = U.el('input', { id: 'inspDur', value: U.toTimecode(c.duration, fps), class: 'tc' }); dur.onchange = () => { const t = U.parseTimecode(dur.value, fps); if (!isNaN(t) && t > 0) { mutate('Duration', () => Cmd.trimRight(c, c.start + t)); } };
    body.append(group('Clip',
      text(c, 'Name', 'name'),
      row2(U.el('div', { class: 'field' }, U.el('label', {}, 'Start'), start), U.el('div', { class: 'field' }, U.el('label', {}, 'Duration'), dur)),
      sel(c, 'Label', 'label', Object.keys(LABEL_COLORS)),
      check(c, 'Enabled', 'enabled'),
      m ? U.el('div', { class: 'meta' }, `${m.name} · ${m.width ? m.width + '×' + m.height : ''} ${m.duration ? '· ' + U.fmtDur(m.duration) : ''} · ${U.fmtBytes(m.size)}`) : null,
    ));
    if (c.kind === 'video' || c.kind === 'audio') {
      const spd = U.el('input', { type: 'range', min: .1, max: 8, step: .05, value: c.speed }); const spdN = U.el('input', { type: 'number', step: .05, value: c.speed, class: 'num' });
      const apply = (v) => { v = U.clamp(+v, .05, 16); Cmd.setSpeed(c, v); };
      spd.onchange = () => apply(spd.value); spdN.onchange = () => apply(spdN.value); spd.oninput = () => spdN.value = spd.value;
      body.append(group('Speed / Duration', U.el('div', { class: 'field' }, U.el('div', { class: 'field-head' }, U.el('span', { class: 'kf-space' }), U.el('label', {}, 'Speed'), U.el('span', { class: 'unit' }, 'x'), spdN), spd),
        btnRow(btn('0.25x', () => apply(.25)), btn('0.5x', () => apply(.5)), btn('1x', () => apply(1)), btn('2x', () => apply(2)), btn('4x', () => apply(4))),
        num(c, 'Source offset', 'offset', { min: 0, max: isUnbounded(c) ? 1e6 : Math.max(0, c.sourceDuration - .1), step: .01, unit: 's' }),
        c.kind === 'video' ? btnRow(btn('❄ Freeze frame', () => Cmd.freezeFrame(c)), btn(c.linkId ? 'Unlink audio' : 'Link selected', () => c.linkId ? Cmd.detachAudio(c) : Cmd.link())) : null));
    }
    body.append(group('Transitions',
      row2(sel(c, 'In', 'transitionIn.type', TRANSITION_TYPES), num(c, 'Duration', 'transitionIn.duration', { min: .1, max: 5, step: .05, unit: 's' })),
      row2(sel(c, 'Out', 'transitionOut.type', TRANSITION_TYPES), num(c, 'Duration', 'transitionOut.duration', { min: .1, max: 5, step: .05, unit: 's' })),
      U.el('div', { class: 'hint' }, 'An In transition on a clip that touches the previous clip becomes a true cross-transition between both clips.')));
    if (c.kind !== 'audio') body.append(group('Motion Preset', sel(c, 'Animation', 'motion.preset', MOTIONS)));
    body.append(group('Actions', btnRow(btn('✂ Split', () => Cmd.splitAt()), btn('⧉ Duplicate', () => Cmd.duplicate()), btn('🗑 Delete', () => Cmd.deleteClips(), 'danger'))));
  }

  function renderVideo(body, c) {
    body.append(group('Transform',
      row2(num(c, 'Position X', 'transform.x', { min: -4000, max: 4000, step: 1, keyable: true, unit: 'px' }), num(c, 'Position Y', 'transform.y', { min: -4000, max: 4000, step: 1, keyable: true, unit: 'px' })),
      check(c, 'Uniform scale', 'transform.uniform', { onchange: render }),
      c.transform.uniform ? num(c, 'Scale', 'transform.scaleX', { min: 0, max: 5, step: .01, keyable: true, unit: 'x' }) : row2(num(c, 'Scale X', 'transform.scaleX', { min: 0, max: 5, step: .01, keyable: true }), num(c, 'Scale Y', 'transform.scaleY', { min: 0, max: 5, step: .01, keyable: true })),
      num(c, 'Rotation', 'transform.rotation', { min: -360, max: 360, step: 1, keyable: true, unit: '°' }),
      num(c, 'Opacity', 'transform.opacity', { min: 0, max: 1, step: .01, keyable: true }),
      row2(num(c, 'Anchor X', 'transform.anchorX', { min: -.5, max: .5, step: .01, keyable: true }), num(c, 'Anchor Y', 'transform.anchorY', { min: -.5, max: .5, step: .01, keyable: true })),
      btnRow(btn('Reset', () => Cmd.resetTransform(c)), btn('Center', () => mutate('Center', () => { c.transform.x = 0; c.transform.y = 0; })), btn('Flip H', () => mutate('Flip', () => { c.transform.uniform = false; c.transform.scaleX *= -1; })), btn('Flip V', () => mutate('Flip', () => { c.transform.uniform = false; c.transform.scaleY *= -1; })))));
    if (c.kind === 'video' || c.kind === 'image') body.append(group('Fit & Blend', sel(c, 'Fit mode', 'fit', ['contain', 'cover', 'stretch', 'none'], { labels: ['Fit (letterbox)', 'Fill (crop)', 'Stretch', 'Original size'] }), sel(c, 'Blend mode', 'blend', BLEND_MODES), btnRow(btn('Fill frame', () => Cmd.fitToFrame(c, 'cover')), btn('Fit frame', () => Cmd.fitToFrame(c, 'contain')))));
    else body.append(group('Blend', sel(c, 'Blend mode', 'blend', BLEND_MODES)));
    body.append(group('Crop & Corners',
      row2(num(c, 'Left', 'crop.l', { min: 0, max: .95, step: .005, keyable: true }), num(c, 'Right', 'crop.r', { min: 0, max: .95, step: .005, keyable: true })),
      row2(num(c, 'Top', 'crop.t', { min: 0, max: .95, step: .005, keyable: true }), num(c, 'Bottom', 'crop.b', { min: 0, max: .95, step: .005, keyable: true })),
      num(c, 'Corner radius', 'cornerRadius', { min: 0, max: 500, step: 1, keyable: true, unit: 'px' }),
      btnRow(btn('Reset crop', () => mutate('Reset crop', () => { c.crop = { l: 0, t: 0, r: 0, b: 0 }; })), btn('Square', () => mutate('Square crop', () => { const m = findMedia(c.mediaId); if (!m || !m.width) return; const ar = m.width / m.height; if (ar > 1) { const f = (1 - 1 / ar) / 2; c.crop = { l: f, r: f, t: 0, b: 0 }; } else { const f = (1 - ar) / 2; c.crop = { l: 0, r: 0, t: f, b: f }; } })))));
    body.append(kfNav(c));
  }
  function kfNav(c) {
    const ts = KF.allTimes(c); return group(`Keyframes (${ts.length})`, btnRow(btn('◀ Prev', () => { const t = Cmd.nextKeyframeTime(c, -1); if (t !== undefined) Player.seek(t); }), btn('Next ▶', () => { const t = Cmd.nextKeyframeTime(c, 1); if (t !== undefined) Player.seek(t); }), btn('Clear all', () => mutate('Clear keyframes', () => c.keyframes = {}), 'danger')), U.el('div', { class: 'hint' }, 'Click ◆ next to a property to key it at the playhead. Keyed properties record new values as keyframes automatically. Right-click ◆ for easing.'));
  }

  function renderAudio(body, c) {
    body.append(group('Levels',
      num(c, 'Volume', 'audio.volume', { min: 0, max: 2, step: .01, keyable: true }),
      num(c, 'Pan', 'audio.pan', { min: -1, max: 1, step: .01, keyable: true }),
      check(c, 'Mute clip', 'audio.muted'),
      row2(num(c, 'Fade in', 'audio.fadeIn', { min: 0, max: 10, step: .05, unit: 's' }), num(c, 'Fade out', 'audio.fadeOut', { min: 0, max: 10, step: .05, unit: 's' })),
      btnRow(btn('Normalize', () => Cmd.normalizeAudio(c)), btn('Reset gain', () => mutate('Reset', () => { c.audio.normalize = 1; c.audio.volume = 1; }))),
      U.el('div', { class: 'meta' }, `Normalize gain: ${(c.audio.normalize || 1).toFixed(2)}x`)));
    body.append(group('Equalizer',
      num(c, 'Low (200Hz)', 'audio.eqLow', { min: -24, max: 24, step: .5, unit: 'dB' }), num(c, 'Mid (1.2kHz)', 'audio.eqMid', { min: -24, max: 24, step: .5, unit: 'dB' }), num(c, 'High (5kHz)', 'audio.eqHigh', { min: -24, max: 24, step: .5, unit: 'dB' }),
      num(c, 'High-pass', 'audio.highpass', { min: 0, max: 2000, step: 10, unit: 'Hz' }), num(c, 'Low-pass', 'audio.lowpass', { min: 200, max: 20000, step: 50, unit: 'Hz' }),
      btnRow(btn('Voice', () => mutate('EQ preset', () => Object.assign(c.audio, { eqLow: -3, eqMid: 3, eqHigh: 2, highpass: 90, lowpass: 20000 }))), btn('Bass boost', () => mutate('EQ preset', () => Object.assign(c.audio, { eqLow: 8, eqMid: 0, eqHigh: 0 }))), btn('Phone', () => mutate('EQ preset', () => Object.assign(c.audio, { highpass: 500, lowpass: 3000 }))), btn('Flat', () => mutate('EQ preset', () => Object.assign(c.audio, { eqLow: 0, eqMid: 0, eqHigh: 0, highpass: 0, lowpass: 20000 }))))));
    body.append(kfNav(c));
  }

  function renderEffects(body, c) {
    const cats = {}; Object.entries(EFFECT_DEFS).forEach(([k, d]) => { (cats[d.category] = cats[d.category] || []).push([k, d]); });
    const add = U.el('select', {}, U.el('option', { value: '' }, '+ Add effect…'), Object.entries(cats).map(([cat, list]) => U.el('optgroup', { label: cat }, list.map(([k, d]) => U.el('option', { value: k }, d.name)))));
    add.onchange = () => { if (add.value) { Cmd.addEffect([c.id], add.value); } };
    body.append(U.el('div', { class: 'group' }, add));
    if (!c.effects.length) body.append(U.el('div', { class: 'empty' }, 'No effects. Add one above or drag from the Effects panel onto the clip.'));
    c.effects.forEach((fx, i) => {
      const def = EFFECT_DEFS[fx.type]; if (!def) return;
      const head = U.el('div', { class: 'fx-head' },
        U.el('input', { type: 'checkbox', checked: fx.enabled, title: 'Enable', onchange: (e) => mutate('Toggle effect', () => fx.enabled = e.target.checked) }),
        U.el('span', { class: 'fx-name' }, def.name),
        U.el('button', { class: 'mini', title: 'Move up', onclick: () => Cmd.moveEffect(c, fx.id, -1) }, '▲'), U.el('button', { class: 'mini', title: 'Move down', onclick: () => Cmd.moveEffect(c, fx.id, 1) }, '▼'),
        U.el('button', { class: 'mini', title: 'Reset', onclick: () => mutate('Reset effect', () => { Object.entries(def.params).forEach(([k, p]) => fx.params[k] = p.def); }) }, '↺'),
        U.el('button', { class: 'mini danger', title: 'Remove', onclick: () => Cmd.removeEffect(c, fx.id) }, '✕'));
      const bodyEl = U.el('div', { class: 'fx-body' });
      if (def.colorParams) for (const k of Object.keys(def.colorParams)) { const inp = U.el('input', { type: 'color', value: fx.params[k] || def.colorParams[k] }); inp.oninput = () => writeVal(c, KF.fxPath(fx, k), inp.value, false); inp.onchange = () => writeVal(c, KF.fxPath(fx, k), inp.value, true); const pick = fx.type === 'chromakey' ? btn('Pick from preview', () => UI.pickColorFromPreview(col => mutate('Key color', () => fx.params[k] = col))) : null; bodyEl.append(U.el('div', { class: 'field row' }, U.el('label', {}, k === 'keyColor' ? 'Key color' : 'Color'), inp, pick)); }
      for (const [k, p] of Object.entries(def.params)) {
        if (fx.type === 'mask' && k === 'shape') { bodyEl.append(sel(c, 'Shape', KF.fxPath(fx, k), [0, 1, 2], { labels: ['Rectangle', 'Ellipse', 'Rounded'] })); continue; }
        if (p.max === 1 && p.min === 0 && p.step === 1) { bodyEl.append(check(c, p.label, KF.fxPath(fx, k))); continue; }
        bodyEl.append(num(c, p.label, KF.fxPath(fx, k), { min: p.min, max: p.max, step: p.step, keyable: true, digits: 3 }));
      }
      if (fx.type === 'lut') {
        const names = Compositor.lutNames(); const s = U.el('select', {}, U.el('option', { value: '' }, '— choose LUT —'), names.map(n => U.el('option', { value: n, selected: fx.lut === n }, n))); s.onchange = () => mutate('LUT', () => fx.lut = s.value || null);
        bodyEl.append(U.el('div', { class: 'field row' }, U.el('label', {}, 'LUT'), s), btnRow(btn('Load .cube file…', async () => { const files = await U.pickFiles('.cube', true); for (const f of files) {
          const contents = await U.readFileText(f);
          if (findClip(c.id) !== c || findTrackOfClip(c.id)?.locked || !c.effects.includes(fx)) return;
          const existing = Compositor.exportLUTs();
          let name = f.name, suffix = 1;
          while (Object.hasOwn(existing, name) && existing[name] !== contents) name = f.name + ' (' + ++suffix + ')';
          mutate('Load color lookup table', () => { Compositor.registerLUT(name, contents); fx.lut = name; });
        } })));
      }
      if (fx.type === 'chromakey') bodyEl.append(btnRow(btn('Green', () => mutate('Key', () => fx.params.keyColor = '#00ff00')), btn('Blue', () => mutate('Key', () => fx.params.keyColor = '#0000ff'))));
      body.append(U.el('div', { class: 'fx' + (fx.enabled ? '' : ' off') }, head, bodyEl));
    });
    body.append(group('Presets (Looks)', U.el('div', { class: 'preset-grid' }, LOOKS.map(l => U.el('button', { class: 'preset', onclick: () => applyLook(c, l) }, l.name)))));
  }
  const LOOKS = [
    { name: 'Cinematic', fx: [['color', { contrast: 12, saturation: -15, temperature: -8, shadows: 6, highlights: -6 }], ['vignette', { amount: .35, size: .8, softness: .6 }]] },
    { name: 'Teal & Orange', fx: [['wheels', { liftB: .04, gainR: 1.08, gainB: .92, gammaG: 1.02 }], ['color', { saturation: 10, contrast: 8 }]] },
    { name: 'Vintage', fx: [['sepia', { amount: .35 }], ['color', { contrast: -8, saturation: -20, temperature: 12 }], ['grain', { amount: .25 }], ['vignette', { amount: .5, size: .7, softness: .5 }]] },
    { name: 'Noir', fx: [['mono', { amount: 1 }], ['color', { contrast: 25, shadows: -10 }], ['vignette', { amount: .55, size: .65, softness: .5 }], ['grain', { amount: .15 }]] },
    { name: 'Vivid', fx: [['color', { saturation: 30, vibrance: 20, contrast: 10 }]] },
    { name: 'Cool', fx: [['color', { temperature: -35, tint: -5 }]] }, { name: 'Warm', fx: [['color', { temperature: 35, tint: 5 }]] },
    { name: 'Faded', fx: [['curves', { outBlack: .08, outWhite: .95 }], ['color', { saturation: -25 }]] },
    { name: 'Dreamy', fx: [['glow', { amount: .5, threshold: .55, radius: 30 }], ['color', { contrast: -6, saturation: 6 }]] },
    { name: 'Retro VHS', fx: [['chromatic', { amount: 5 }], ['color', { saturation: 15, contrast: -5 }], ['grain', { amount: .35 }]] },
    { name: 'High Key', fx: [['color', { exposure: .5, contrast: -10, shadows: 20 }]] }, { name: 'Matte', fx: [['curves', { outBlack: .12 }], ['color', { contrast: 8 }]] },
  ];
  function applyLook(c, l) { mutate('Apply look ' + l.name, () => { l.fx.forEach(([type, params]) => { const fx = Model.newEffect(type); Object.assign(fx.params, params); c.effects.push(fx); }); }); }

  function renderText(body, c) {
    body.append(group('Content', text(c, 'Text', 'text.content', { area: true, rows: 4 }), sel(c, 'Case', 'text.transform', ['none', 'upper', 'lower', 'title'])));
    body.append(group('Font',
      sel(c, 'Family', 'text.font', FONTS), row2(sel(c, 'Weight', 'text.weight', ['300', '400', '500', '600', '700', '800', '900'], { labels: ['Light', 'Regular', 'Medium', 'Semibold', 'Bold', 'Extra Bold', 'Black'] }), check(c, 'Italic', 'text.italic')),
      num(c, 'Size', 'text.size', { min: 8, max: 600, step: 1, keyable: true, unit: 'px' }), num(c, 'Letter spacing', 'text.letterSpacing', { min: -20, max: 100, step: .5, keyable: true, unit: 'px' }), num(c, 'Line height', 'text.lineHeight', { min: .6, max: 3, step: .05 }),
      row2(sel(c, 'Align', 'text.align', ['left', 'center', 'right']), num(c, 'Box width', 'text.boxWidth', { min: 0, max: 4000, step: 10, unit: 'px' })),
      U.el('div', { class: 'hint' }, 'Box width 0 = no wrapping.')));
    body.append(group('Fill', color(c, 'Color', 'text.color'), check(c, 'Gradient', 'text.gradient', { onchange: render }), c.text.gradient ? row2(color(c, 'Color 2', 'text.color2'), num(c, 'Angle', 'text.gradAngle', { min: 0, max: 360, step: 1, unit: '°' })) : null));
    body.append(group('Stroke & Shadow', row2(color(c, 'Stroke', 'text.strokeColor'), num(c, 'Width', 'text.strokeWidth', { min: 0, max: 40, step: .5 })),
      row2(color(c, 'Shadow', 'text.shadowColor'), num(c, 'Opacity', 'text.shadowOpacity', { min: 0, max: 1, step: .05 })), num(c, 'Shadow blur', 'text.shadowBlur', { min: 0, max: 80, step: 1 }), row2(num(c, 'Offset X', 'text.shadowX', { min: -80, max: 80, step: 1 }), num(c, 'Offset Y', 'text.shadowY', { min: -80, max: 80, step: 1 }))));
    body.append(group('Background Box', row2(color(c, 'Color', 'text.bgColor'), num(c, 'Opacity', 'text.bgOpacity', { min: 0, max: 1, step: .05 })), row2(num(c, 'Padding', 'text.bgPadding', { min: 0, max: 200, step: 1 }), num(c, 'Radius', 'text.bgRadius', { min: 0, max: 200, step: 1 }))));
    body.append(group('Animation', row2(sel(c, 'In', 'text.animation', TEXT_ANIMS), num(c, 'Duration', 'text.animDuration', { min: .1, max: 5, step: .05, unit: 's' })), row2(sel(c, 'Out', 'text.animOut', TEXT_ANIMS_OUT), num(c, 'Duration', 'text.animOutDuration', { min: .1, max: 5, step: .05, unit: 's' }))));
    body.append(group('Text Presets', U.el('div', { class: 'preset-grid' }, TEXT_PRESETS.map(p => U.el('button', { class: 'preset', onclick: () => mutate('Text preset', () => { const content = c.text.content; c.text = Object.assign(Model.defaultText(), p.text); c.text.content = content; Compositor.clearCaches(); }) }, p.name)))));
  }
  const TEXT_PRESETS = [
    { name: 'Clean Title', text: { font: 'Montserrat', weight: '800', size: 120, color: '#ffffff', shadowBlur: 20, shadowOpacity: .5 } },
    { name: 'Bold Impact', text: { font: 'Anton', weight: '400', size: 160, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, transform: 'upper', letterSpacing: 4 } },
    { name: 'Subtitle', text: { font: 'Inter', weight: '600', size: 56, color: '#ffffff', bgColor: '#000000', bgOpacity: .65, bgPadding: 18, bgRadius: 10 } },
    { name: 'Elegant Serif', text: { font: 'Playfair Display', weight: '600', size: 110, color: '#f6f1e9', letterSpacing: 2, shadowBlur: 10, shadowOpacity: .4 } },
    { name: 'Neon', text: { font: 'Poppins', weight: '700', size: 120, color: '#7dffb3', shadowColor: '#00ff88', shadowBlur: 40, shadowOpacity: 1, shadowX: 0, shadowY: 0 } },
    { name: 'Gradient Pop', text: { font: 'Montserrat', weight: '900', size: 140, gradient: true, color: '#ff5f7e', color2: '#ffcf4a', gradAngle: 20 } },
    { name: 'Handwritten', text: { font: 'Caveat', weight: '700', size: 130, color: '#ffffff', shadowBlur: 8, shadowOpacity: .5 } },
    { name: 'Retro Game', text: { font: 'Press Start 2P', weight: '400', size: 64, color: '#ffe066', strokeColor: '#5b2a86', strokeWidth: 6 } },
    { name: 'Caption Card', text: { font: 'Roboto', weight: '500', size: 48, color: '#111111', bgColor: '#ffffff', bgOpacity: .92, bgPadding: 22, bgRadius: 8 } },
    { name: 'Outline Only', text: { font: 'Oswald', weight: '700', size: 150, color: '#00000000', strokeColor: '#ffffff', strokeWidth: 4, transform: 'upper' } },
  ];

  function renderShape(body, c) {
    body.append(group('Shape', sel(c, 'Type', 'shape.type', Compositor.ShapeRenderer.TYPES),
      row2(num(c, 'Width', 'shape.width', { min: 2, max: 4000, step: 1, keyable: true, unit: 'px' }), num(c, 'Height', 'shape.height', { min: 2, max: 4000, step: 1, keyable: true, unit: 'px' })),
      num(c, 'Corner radius', 'shape.radius', { min: 0, max: 500, step: 1 }), ['star', 'polygon'].includes(c.shape.type) ? num(c, 'Points', 'shape.points', { min: 3, max: 20, step: 1 }) : null));
    body.append(group('Fill & Stroke', color(c, 'Fill', 'shape.fill'), check(c, 'Gradient', 'shape.gradient', { onchange: render }), c.shape.gradient ? row2(color(c, 'Fill 2', 'shape.fill2'), num(c, 'Angle', 'shape.gradAngle', { min: 0, max: 360, step: 1 })) : null, row2(color(c, 'Stroke', 'shape.stroke'), num(c, 'Stroke width', 'shape.strokeWidth', { min: 0, max: 100, step: 1 }))));
  }
  function renderSticker(body, c) { body.append(group('Sticker', sel(c, 'Type', 'sticker.id', STICKERS.map(s => s.id), { labels: STICKERS.map(s => s.icon + ' ' + s.name) }), color(c, 'Color', 'sticker.color'), text(c, 'Label (drawn stickers)', 'sticker.text'))); }
  function renderSolid(body, c) { body.append(group('Fill', color(c, 'Color', 'solid.color'), check(c, 'Gradient', 'solid.gradient', { onchange: render }), c.solid.gradient ? row2(color(c, 'Color 2', 'solid.color2'), num(c, 'Angle', 'solid.angle', { min: 0, max: 360, step: 1 })) : null)); }

  function renderTrack(tr) {
    root.append(U.el('div', { class: 'insp-title' }, U.el('span', { class: 'kind-badge ' + tr.kind }, tr.kind + ' track'), U.el('span', { class: 'insp-name' }, tr.name)));
    const body = U.el('div', { class: 'insp-body' }); root.appendChild(body);
    const nm = U.el('input', { type: 'text', value: tr.name }); nm.onchange = () => Cmd.setTrackProp(tr.id, 'name', nm.value);
    const vol = U.el('input', { type: 'range', min: 0, max: 1.5, step: .01, value: tr.volume }); vol.oninput = () => { tr.volume = +vol.value; AudioEngine.updateMix(); }; vol.onchange = () => Cmd.setTrackProp(tr.id, 'volume', +vol.value);
    const pan = U.el('input', { type: 'range', min: -1, max: 1, step: .01, value: tr.pan }); pan.oninput = () => { tr.pan = +pan.value; AudioEngine.updateMix(); }; pan.onchange = () => Cmd.setTrackProp(tr.id, 'pan', +pan.value);
    const chk = (label, prop) => { const i = U.el('input', { type: 'checkbox', checked: !!tr[prop] }); i.onchange = () => Cmd.setTrackProp(tr.id, prop, i.checked); return U.el('div', { class: 'field row' }, U.el('label', {}, label), i); };
    body.append(group('Track', U.el('div', { class: 'field' }, U.el('label', {}, 'Name'), nm), chk('Muted', 'muted'), chk('Solo', 'solo'), chk('Locked', 'locked'), tr.kind === 'video' ? chk('Hidden', 'hidden') : null,
      tr.kind === 'audio' ? U.el('div', { class: 'field' }, U.el('label', {}, 'Volume'), vol) : null, tr.kind === 'audio' ? U.el('div', { class: 'field' }, U.el('label', {}, 'Pan'), pan) : null,
      btnRow(btn('Select clips', () => Cmd.selectTrackClips(tr.id)), btn('Close gaps', () => Cmd.closeAllGaps(tr.id)), btn('Delete track', () => Cmd.removeTrack(tr.id), 'danger'))));
    body.append(U.el('div', { class: 'hint', style: { padding: '10px 12px' } }, `${tr.clips.length} clip(s) · ${U.toTimecode(Cmd.endOf(tr), state.project.fps)}`));
  }

  function renderProject() {
    const P = state.project;
    root.append(U.el('div', { class: 'insp-title' }, U.el('span', { class: 'kind-badge project' }, 'project'), U.el('span', { class: 'insp-name' }, P.name)));
    const body = U.el('div', { class: 'insp-body' }); root.appendChild(body);
    const nm = U.el('input', { type: 'text', value: P.name }); nm.onchange = () => mutate('Rename project', () => P.name = nm.value);
    const presets = [['1920x1080', '16:9 · 1080p'], ['3840x2160', '16:9 · 4K UHD'], ['1280x720', '16:9 · 720p'], ['1080x1920', '9:16 · Vertical (Reels/TikTok)'], ['1080x1080', '1:1 · Square'], ['1080x1350', '4:5 · Portrait'], ['2560x1080', '21:9 · Ultrawide'], ['1440x1080', '4:3 · Classic'], ['custom', 'Custom…']];
    const cur = `${P.width}x${P.height}`; const ps = U.el('select', {}, presets.map(([v, l]) => U.el('option', { value: v, selected: v === cur }, l)));
    if (!presets.some(p => p[0] === cur)) ps.insertBefore(U.el('option', { value: cur, selected: true }, `${P.width}×${P.height}`), ps.firstChild);
    const w = U.el('input', { type: 'number', value: P.width, min: 16, max: 8192, class: 'num' }), h = U.el('input', { type: 'number', value: P.height, min: 16, max: 8192, class: 'num' });
    const applySize = () => Cmd.setProjectSize(U.clamp(+w.value | 0, 16, 8192), U.clamp(+h.value | 0, 16, 8192));
    ps.onchange = () => { if (ps.value === 'custom') return; const [a, b] = ps.value.split('x').map(Number); w.value = a; h.value = b; applySize(); }; w.onchange = h.onchange = applySize;
    const fpsS = U.el('select', {}, [23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map(f => U.el('option', { value: f, selected: f === P.fps }, f + ' fps'))); fpsS.onchange = () => Cmd.setFps(+fpsS.value);
    const bg = U.el('input', { type: 'color', value: P.background }); bg.onchange = () => Cmd.setBackground(bg.value);
    body.append(group('Project', U.el('div', { class: 'field' }, U.el('label', {}, 'Name'), nm), U.el('div', { class: 'field' }, U.el('label', {}, 'Resolution preset'), ps), row2(U.el('div', { class: 'field' }, U.el('label', {}, 'Width'), w), U.el('div', { class: 'field' }, U.el('label', {}, 'Height'), h)), U.el('div', { class: 'field row' }, U.el('label', {}, 'Frame rate'), fpsS), U.el('div', { class: 'field row' }, U.el('label', {}, 'Background'), bg)));
    const stats = `${allClips().length} clips · ${videoTracks().length}V/${audioTracks().length}A tracks · ${U.toTimecode(state.duration, P.fps)} · ${state.media.length} media`;
    body.append(group('Info', U.el('div', { class: 'meta' }, stats), btnRow(btn('Remove empty tracks', () => Cmd.cleanEmptyTracks()), btn('Zoom to fit', () => Timeline.zoomFit()))));
    body.append(U.el('div', { class: 'empty' }, 'Select a clip in the timeline to edit its properties.'));
  }

  return { init, render, refreshLive, LOOKS, TEXT_PRESETS };
})();
