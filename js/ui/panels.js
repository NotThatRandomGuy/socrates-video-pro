/* ============================================================
   UI — menus, dialogs, context menus, asset panels, splitters
============================================================ */
'use strict';

const UI = (() => {
  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg, ms = 2600) { let el = U.$('.toast'); if (!el) { el = U.el('div', { class: 'toast' }); document.body.appendChild(el); } el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms); }

  /* ---------------- modal dialogs ---------------- */
  function modal(title, content, buttons = [{ label: 'Close', primary: true }], { width = 460 } = {}) {
    return new Promise(res => {
      const previousFocus = document.activeElement;
      const back = U.el('div', { class: 'modal-back' }); const box = U.el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: width + 'px' } });
      const close = (v) => { back.remove(); document.removeEventListener('keydown', kd); previousFocus?.focus(); res(v); };
      const kd = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Enter' && !['TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) { const p = buttons.find(b => b.primary); if (p) { e.preventDefault(); e.target.blur(); close(p.value ?? true); } }
        if (e.key === 'Tab') { const els = [...box.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null); const first = els[0], last = els[els.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
      };
      box.append(U.el('div', { class: 'modal-head' }, U.el('span', {}, title), U.el('button', { class: 'mini', onclick: () => close(null) }, '✕')), U.el('div', { class: 'modal-body' }, content), U.el('div', { class: 'modal-foot' }, buttons.map(b => U.el('button', { class: b.primary ? 'primary' : (b.danger ? 'danger' : ''), onclick: () => close(b.value ?? (b.primary ? true : false)) }, b.label))));
      back.appendChild(box); back.onclick = (e) => { if (e.target === back) close(null); }; document.body.appendChild(back); document.addEventListener('keydown', kd);
      const f = box.querySelector('input,textarea,select'); if (f) { f.focus(); f.select && f.select(); }
    });
  }
  async function prompt(title, value = '', { label = '' } = {}) { const inp = U.el('input', { type: 'text', value, style: { width: '100%' } }); const ok = await modal(title, U.el('div', {}, label ? U.el('label', {}, label) : null, inp), [{ label: 'Cancel' }, { label: 'OK', primary: true }]); return ok ? inp.value : null; }
  async function confirm(title, msg, okLabel = 'OK') { return !!(await modal(title, U.el('p', {}, msg), [{ label: 'Cancel' }, { label: okLabel, primary: true }])); }
  function alert(title, msg) { return modal(title, typeof msg === 'string' ? U.el('p', { html: msg }) : msg); }

  /* ---------------- context menus ---------------- */
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function menu(x, y, items) {
    closeMenu(); menuEl = U.el('div', { class: 'ctx-menu' });
    for (const it of items) {
      if (!it) continue; if (it.sep) { menuEl.appendChild(U.el('div', { class: 'sep' })); continue; }
      const row = U.el('div', { class: 'item' + (it.disabled ? ' disabled' : '') + (it.sub ? ' has-sub' : '') }, U.el('span', { class: 'check' }, it.check ? '✓' : ''), U.el('span', { class: 'lbl' }, it.label), it.key ? U.el('span', { class: 'key' }, it.key) : null, it.sub ? U.el('span', { class: 'arrow' }, '▸') : null);
      if (it.sub) { const sub = U.el('div', { class: 'ctx-menu sub' }); it.sub.forEach(s => { if (s.sep) { sub.appendChild(U.el('div', { class: 'sep' })); return; } sub.appendChild(U.el('div', { class: 'item', onclick: (e) => { e.stopPropagation(); closeMenu(); s.action && s.action(); } }, U.el('span', { class: 'check' }, s.check ? '✓' : ''), U.el('span', { class: 'lbl', style: s.color ? { borderLeft: `3px solid ${s.color}`, paddingLeft: '6px' } : {} }, s.label))); }); row.appendChild(sub); }
      else if (!it.disabled) row.onclick = (e) => { e.stopPropagation(); closeMenu(); it.action && it.action(); };
      menuEl.appendChild(row);
    }
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect(); menuEl.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px'; menuEl.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    setTimeout(() => { document.addEventListener('mousedown', onDoc, { once: true }); }, 0);
    function onDoc(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); else if (menuEl) document.addEventListener('mousedown', onDoc, { once: true }); }
  }
  function clipContextMenu(x, y, c) {
    const ids = [...state.selection]; const multi = ids.length > 1; const tr = findTrackOfClip(c.id);
    menu(x, y, [
      { label: 'Cut', key: 'Ctrl+X', action: () => Cmd.cut() }, { label: 'Copy', key: 'Ctrl+C', action: () => Cmd.copy() }, { label: 'Paste', key: 'Ctrl+V', action: () => Cmd.paste(), disabled: !state.clipboard }, { label: 'Paste attributes', key: 'Ctrl+Alt+V', action: () => Cmd.pasteAttributes(), disabled: !state.clipboard }, { label: 'Duplicate', key: 'Ctrl+D', action: () => Cmd.duplicate() },
      { sep: true },
      { label: 'Split at playhead', key: 'S', action: () => Cmd.splitAt() }, { label: 'Delete', key: 'Del', action: () => Cmd.deleteClips(ids, false) }, { label: 'Ripple delete', key: 'Shift+Del', action: () => Cmd.deleteClips(ids, true) },
      { sep: true },
      { label: c.enabled ? 'Disable clip' : 'Enable clip', key: 'Shift+E', action: () => Cmd.setEnabled(ids, !c.enabled) },
      c.kind === 'video' ? { label: 'Freeze frame', key: 'Shift+F', action: () => Cmd.freezeFrame(c) } : null,
      (c.kind === 'video' || c.kind === 'audio') ? { label: 'Speed / duration…', key: 'Ctrl+R', action: () => speedDialog(c) } : null,
      c.linkId ? { label: 'Unlink audio/video', key: 'Ctrl+L', action: () => Cmd.unlink(ids) } : (multi ? { label: 'Link clips', key: 'Ctrl+L', action: () => Cmd.link(ids) } : null),
      c.kind === 'audio' ? { label: 'Normalize audio', action: () => Cmd.normalizeAudio(c) } : null,
      isVisualKind(c.kind) ? { label: 'Reset transform', action: () => Cmd.resetTransform(c) } : null,
      { label: 'Rename…', action: async () => { const n = await prompt('Clip name', c.name); if (n !== null) Cmd.rename(c, n); } },
      { label: 'Label', sub: Object.entries(LABEL_COLORS).map(([k, v]) => ({ label: k, color: v, check: c.label === k, action: () => Cmd.setLabel(ids, k) })) },
      { label: 'Transition in', sub: TRANSITION_TYPES.map(t => ({ label: t, check: c.transitionIn.type === t, action: () => Cmd.setTransition(ids, 'in', t) })) },
      { label: 'Transition out', sub: TRANSITION_TYPES.map(t => ({ label: t, check: c.transitionOut.type === t, action: () => Cmd.setTransition(ids, 'out', t) })) },
      { sep: true },
      { label: 'Align start to playhead', action: () => Cmd.alignToPlayhead('start') }, { label: 'Align end to playhead', action: () => Cmd.alignToPlayhead('end') },
      { label: 'Select all on track', action: () => Cmd.selectTrackClips(tr.id) },
      c.mediaId ? { label: 'Reveal in media panel', action: () => { switchTab('media'); const el = document.querySelector(`.media-item[data-id="${c.mediaId}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } } } : null,
    ]);
  }
  function timelineContextMenu(x, y, track, t) {
    menu(x, y, [
      { label: 'Paste here', action: () => Cmd.paste(t), disabled: !state.clipboard },
      { label: 'Add marker here', key: 'M', action: () => Cmd.addMarker(t) },
      { label: 'Set In point', key: 'I', action: () => Cmd.setIn(t) }, { label: 'Set Out point', key: 'O', action: () => Cmd.setOut(t) },
      { sep: true },
      track ? { label: 'Close gap here (ripple)', action: () => Cmd.rippleDeleteGap(track, t) } : null,
      track ? { label: 'Close all gaps on track', action: () => Cmd.closeAllGaps(track.id) } : null,
      { sep: true },
      { label: 'Add text here', action: () => Cmd.addGenerated('text', {}, { start: t }) }, { label: 'Add solid color here', action: () => Cmd.addGenerated('solid', {}, { start: t }) }, { label: 'Add adjustment layer here', action: () => Cmd.addGenerated('adjustment', {}, { start: t, name: 'Adjustment' }) },
      { sep: true },
      { label: 'Add video track', action: () => Cmd.addTrack('video') }, { label: 'Add audio track', action: () => Cmd.addTrack('audio') },
      { label: 'Zoom to fit', key: 'Shift+Z', action: () => Timeline.zoomFit() },
    ]);
  }
  function trackContextMenu(x, y, tr) {
    menu(x, y, [
      { label: 'Rename…', action: async () => { const n = await prompt('Track name', tr.name); if (n !== null) Cmd.setTrackProp(tr.id, 'name', n); } },
      { label: tr.muted ? 'Unmute' : 'Mute', action: () => Cmd.setTrackProp(tr.id, 'muted', !tr.muted) }, { label: tr.solo ? 'Unsolo' : 'Solo', action: () => Cmd.setTrackProp(tr.id, 'solo', !tr.solo) }, { label: tr.locked ? 'Unlock' : 'Lock', action: () => Cmd.setTrackProp(tr.id, 'locked', !tr.locked) },
      tr.kind === 'video' ? { label: tr.hidden ? 'Show' : 'Hide', action: () => Cmd.setTrackProp(tr.id, 'hidden', !tr.hidden) } : null,
      { sep: true },
      { label: 'Move up', action: () => Cmd.moveTrack(tr.id, tr.kind === 'video' ? 1 : -1) }, { label: 'Move down', action: () => Cmd.moveTrack(tr.id, tr.kind === 'video' ? -1 : 1) },
      { label: 'Add ' + tr.kind + ' track', action: () => Cmd.addTrack(tr.kind) },
      { label: 'Select all clips', action: () => Cmd.selectTrackClips(tr.id) }, { label: 'Close all gaps', action: () => Cmd.closeAllGaps(tr.id) },
      { sep: true },
      { label: 'Delete track', action: async () => { if (!tr.clips.length || await confirm('Delete track', `Delete "${tr.name}" and its ${tr.clips.length} clip(s)?`, 'Delete')) Cmd.removeTrack(tr.id); } },
    ]);
  }
  async function markerDialog(mk) {
    const name = U.el('input', { type: 'text', value: mk.name, style: { width: '100%' } }); const color = U.el('select', {}, Object.keys(LABEL_COLORS).filter(k => k !== 'none').map(k => U.el('option', { value: k, selected: k === mk.color }, k)));
    const dur = U.el('input', { type: 'number', value: mk.duration, min: 0, step: .1, class: 'num' });
    const r = await modal('Marker', U.el('div', {}, U.el('label', {}, 'Name'), name, U.el('div', { class: 'row2', style: { marginTop: '8px' } }, U.el('div', { class: 'field' }, U.el('label', {}, 'Color'), color), U.el('div', { class: 'field' }, U.el('label', {}, 'Duration (s)'), dur))), [{ label: 'Delete', value: 'del', danger: true }, { label: 'Cancel' }, { label: 'Save', primary: true }]);
    if (r === 'del') Cmd.removeMarker(mk.id); else if (r) Cmd.updateMarker(mk.id, { name: name.value, color: color.value, duration: Math.max(0, +dur.value || 0) });
  }
  async function speedDialog(c) {
    const s = U.el('input', { type: 'number', value: c.speed, step: .05, min: .05, max: 16, class: 'num' }); const d = U.el('input', { type: 'text', value: U.toTimecode(c.duration, state.project.fps), class: 'tc' });
    s.oninput = () => { d.value = U.toTimecode(c.duration * c.speed / (+s.value || 1), state.project.fps); }; d.onchange = () => { const t = U.parseTimecode(d.value, state.project.fps); if (t > 0) s.value = U.round(c.duration * c.speed / t, 3); };
    if (await modal('Speed / Duration', U.el('div', { class: 'row2' }, U.el('div', { class: 'field' }, U.el('label', {}, 'Speed (x)'), s), U.el('div', { class: 'field' }, U.el('label', {}, 'Duration'), d)), [{ label: 'Cancel' }, { label: 'Apply', primary: true }])) Cmd.setSpeed(c, U.clamp(+s.value, .05, 16));
  }
  function pickColorFromPreview(cb) {
    toast('Click on the preview to pick a color'); const ov = document.getElementById('previewOverlay'); ov.style.cursor = 'crosshair';
    const h = (e) => { e.stopPropagation(); e.preventDefault(); ov.removeEventListener('mousedown', h, true); ov.style.cursor = ''; const cv = document.getElementById('previewCanvas'); const r = ov.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / r.width * cv.width), y = Math.floor((e.clientY - r.top) / r.height * cv.height); const d = cv.getContext('2d').getImageData(x, y, 1, 1).data; cb(U.rgbToHex(d[0], d[1], d[2])); };
    ov.addEventListener('mousedown', h, true);
  }

  /* ---------------- menu bar ---------------- */
  function menuBar() {
    const bar = document.getElementById('menubar'); bar.innerHTML = '';
    const menus = {
      File: () => [
        { label: 'New project', key: 'Ctrl+N', action: () => Project.newProject() }, { label: 'Open project…', key: 'Ctrl+O', action: () => Project.open() }, { label: 'Save project', key: 'Ctrl+S', action: () => Project.save() }, { label: 'Save project as…', key: 'Ctrl+Shift+S', action: () => Project.saveAs() },
        { sep: true }, { label: 'Import media…', key: 'Ctrl+I', action: () => importMedia() }, { label: 'Import LUT (.cube)…', action: async () => { const fs = await U.pickFiles('.cube'); for (const f of fs) Compositor.registerLUT(f.name, await U.readFileText(f)); toast(`Loaded ${fs.length} LUT(s)`); } },
        { sep: true }, { label: 'Record screen…', action: () => Recorder.screen() }, { label: 'Record webcam…', action: () => Recorder.webcam() }, { label: 'Record voice-over…', action: () => Recorder.voice() },
        { sep: true }, { label: 'Export video…', key: 'Ctrl+M', action: () => Exporter.dialog() }, { label: 'Export current frame (PNG)', key: 'Ctrl+Shift+E', action: () => Preview.snapshot('png') }, { label: 'Export audio only (WAV)', action: () => Exporter.exportWav() },
        { sep: true }, { label: 'Clear autosave & media cache', action: async () => { if (await confirm('Clear cache', 'Remove all persisted media and autosave from this browser?', 'Clear')) { await DB.clearAll(); toast('Cache cleared'); } } },
      ],
      Edit: () => [
        { label: 'Undo', key: 'Ctrl+Z', action: () => History.undo(), disabled: !History.canUndo() }, { label: 'Redo', key: 'Ctrl+Y', action: () => History.redo(), disabled: !History.canRedo() }, { sep: true },
        { label: 'Cut', key: 'Ctrl+X', action: () => Cmd.cut() }, { label: 'Copy', key: 'Ctrl+C', action: () => Cmd.copy() }, { label: 'Paste', key: 'Ctrl+V', action: () => Cmd.paste() }, { label: 'Paste attributes', key: 'Ctrl+Alt+V', action: () => Cmd.pasteAttributes() }, { label: 'Duplicate', key: 'Ctrl+D', action: () => Cmd.duplicate() }, { sep: true },
        { label: 'Delete', key: 'Del', action: () => Cmd.deleteClips([...state.selection], false) }, { label: 'Ripple delete', key: 'Shift+Del', action: () => Cmd.deleteClips([...state.selection], true) }, { sep: true },
        { label: 'Select all', key: 'Ctrl+A', action: () => Cmd.selectAll() }, { label: 'Select all forward', key: 'Ctrl+Shift+A', action: () => Cmd.selectForward() }, { label: 'Deselect', key: 'Ctrl+Shift+D', action: () => Cmd.deselect() },
      ],
      Clip: () => { const c = primaryClip(); return [
        { label: 'Split at playhead', key: 'S', action: () => Cmd.splitAt() }, { label: 'Speed / duration…', key: 'Ctrl+R', action: () => c && speedDialog(c), disabled: !c }, { label: c && !c.enabled ? 'Enable' : 'Disable', key: 'Shift+E', action: () => c && Cmd.setEnabled([...state.selection], !c.enabled), disabled: !c },
        { sep: true }, { label: 'Link', key: 'Ctrl+L', action: () => Cmd.link() }, { label: 'Unlink', key: 'Ctrl+Shift+L', action: () => Cmd.unlink() }, { label: 'Freeze frame', key: 'Shift+F', action: () => Cmd.freezeFrame() },
        { sep: true }, { label: 'Nudge left 1 frame', key: ',', action: () => Cmd.nudge(-1 / state.project.fps) }, { label: 'Nudge right 1 frame', key: '.', action: () => Cmd.nudge(1 / state.project.fps) }, { label: 'Move to track above', key: 'Alt+↑', action: () => Cmd.nudgeTrack(1) }, { label: 'Move to track below', key: 'Alt+↓', action: () => Cmd.nudgeTrack(-1) },
        { sep: true }, { label: 'Add text', key: 'Ctrl+T', action: () => Cmd.addGenerated('text') }, { label: 'Add shape', action: () => Cmd.addGenerated('shape') }, { label: 'Add solid / gradient', action: () => Cmd.addGenerated('solid') }, { label: 'Add adjustment layer', action: () => Cmd.addGenerated('adjustment', {}, { name: 'Adjustment' }) },
      ]; },
      Timeline: () => [
        { label: 'Add video track', action: () => Cmd.addTrack('video') }, { label: 'Add audio track', action: () => Cmd.addTrack('audio') }, { label: 'Remove empty tracks', action: () => Cmd.cleanEmptyTracks() }, { sep: true },
        { label: 'Snapping', key: 'N', check: state.snap, action: () => toggleSnap() }, { label: 'Ripple / insert mode', key: 'R', check: state.ripple, action: () => toggleRipple() }, { label: 'Loop playback', key: 'Ctrl+L', check: state.loop, action: () => { state.loop = !state.loop; refreshToolbar(); } }, { sep: true },
        { label: 'Zoom in', key: '=', action: () => Timeline.setZoom(state.pxPerSec * 1.3) }, { label: 'Zoom out', key: '-', action: () => Timeline.setZoom(state.pxPerSec / 1.3) }, { label: 'Zoom to fit', key: 'Shift+Z', action: () => Timeline.zoomFit() }, { sep: true },
        { label: 'Add marker', key: 'M', action: () => Cmd.addMarker() }, { label: 'Clear markers', action: () => Cmd.clearMarkers() }, { label: 'Set In', key: 'I', action: () => Cmd.setIn() }, { label: 'Set Out', key: 'O', action: () => Cmd.setOut() }, { label: 'Clear In/Out', key: 'Alt+X', action: () => Cmd.clearInOut() }, { label: 'Extract In→Out (ripple)', key: "'", action: () => Cmd.extractInOut(false) }, { label: 'Lift In→Out', key: ';', action: () => Cmd.extractInOut(true) },
      ],
      View: () => [
        { label: 'Safe areas', key: "Ctrl+'", check: state.showSafeAreas, action: () => { state.showSafeAreas = !state.showSafeAreas; Preview.drawOverlay(); } }, { label: 'Rule-of-thirds grid', check: state.showGrid, action: () => { state.showGrid = !state.showGrid; Preview.drawOverlay(); } }, { sep: true },
        { label: 'Preview quality', sub: [[1, 'Full'], [.5, 'Half'], [.25, 'Quarter']].map(([q, l]) => ({ label: l, check: state.previewQuality === q, action: () => { state.previewQuality = q; Player.requestRender(); } })) },
        { label: 'Preview zoom', sub: ['fit', '0.25', '0.5', '1', '2'].map(z => ({ label: z === 'fit' ? 'Fit' : (parseFloat(z) * 100) + '%', check: state.previewZoom === z, action: () => Preview.setZoom(z) })) },
        { label: 'Fullscreen preview', key: 'Ctrl+Shift+F', action: () => Preview.fullscreen() }, { sep: true },
        { label: 'Toggle media panel', action: () => document.body.classList.toggle('hide-left') }, { label: 'Toggle inspector', action: () => document.body.classList.toggle('hide-right') },
      ],
      Help: () => [{ label: 'Keyboard shortcuts', key: '?', action: () => shortcutsDialog() }, { label: 'About', action: () => alert('Video Editor Pro', 'A browser-based non-linear editor.<br><br>• Multi-track timeline with ripple/insert editing, snapping, markers, In/Out<br>• Keyframe animation with easing<br>• GPU color grading, keying, masks, LUTs<br>• Web Audio mixing with EQ, fades, meters<br>• Frame-accurate WebCodecs export (MP4 / WebM)<br><br>Everything runs locally in your browser — your media never leaves your machine.') }],
    };
    for (const [name, build] of Object.entries(menus)) {
      const b = U.el('button', { class: 'menu-btn' }, name); b.onclick = (e) => { const r = b.getBoundingClientRect(); menu(r.left, r.bottom + 2, build()); }; b.onmouseenter = () => { if (menuEl) b.click(); }; bar.appendChild(b);
    }
  }
  function toggleSnap() { state.snap = !state.snap; refreshToolbar(); toast('Snapping ' + (state.snap ? 'on' : 'off')); }
  function toggleRipple() { state.ripple = !state.ripple; refreshToolbar(); toast(state.ripple ? 'Ripple/Insert mode' : 'Overwrite mode'); }
  function refreshToolbar() {
    const previewSnap = U.$('#btnPreviewSnap'); if (previewSnap) { previewSnap.classList.toggle('active', state.snap); previewSnap.setAttribute('aria-pressed', String(state.snap)); }
    U.$('#btnSnap')?.classList.toggle('active', state.snap); U.$('#btnRipple')?.classList.toggle('active', state.ripple); U.$('#btnLoop')?.classList.toggle('active', state.loop);
    U.$('#btnUndo') && (U.$('#btnUndo').disabled = !History.canUndo()); U.$('#btnRedo') && (U.$('#btnRedo').disabled = !History.canRedo());
    const t = U.$('#projTitle'); if (t) t.textContent = state.project.name + (state.dirty ? ' •' : '');
  }
  async function importMedia() { const files = await U.pickFiles('video/*,audio/*,image/*,.mkv,.mov'); if (files.length) { const added = await Media.importFiles(files); toast(`Imported ${added.length} file(s)`); switchTab('media'); } }

  /* ---------------- shortcuts dialog ---------------- */
  function shortcutsDialog() {
    const rows = [['Space', 'Play / Pause'], ['J / K / L', 'Shuttle reverse / pause / forward (tap L again for 2x, 4x)'], ['← / →', 'Step 1 frame (Shift: 10 frames)'], ['Home / End', 'Go to start / end'], ['↑ / ↓', 'Previous / next clip edge'], ['I / O', 'Set In / Out point'], ['Alt+X', 'Clear In/Out'], ['M', 'Add marker'], ['S', 'Split at playhead (Ctrl+S saves)'], ['C', 'Razor tool'], ['V', 'Select tool'], ['H', 'Hand tool'], ['N', 'Toggle snapping'], ['R', 'Toggle ripple / insert mode'], ['Del / Backspace', 'Delete (Shift: ripple delete)'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+X / C / V', 'Cut / Copy / Paste at playhead'], ['Ctrl+Alt+V', 'Paste attributes'], ['Ctrl+D', 'Duplicate'], ['Ctrl+A', 'Select all'], ['Ctrl+T', 'Add text'], ['Ctrl+L', 'Link / unlink selected'], ['Shift+E', 'Enable / disable clip'], ['Shift+F', 'Freeze frame'], [', / .', 'Nudge 1 frame left / right (Shift: 10)'], ['Alt+↑ / ↓', 'Move clip to track above / below'], ['= / -', 'Zoom timeline in / out'], ['Shift+Z', 'Zoom to fit'], ['Ctrl+Wheel', 'Zoom timeline at cursor'], ['Alt+Wheel', 'Track height'], ['Shift+Wheel', 'Scroll timeline horizontally'], ['Alt+Drag clip', 'Duplicate while dragging'], ['Shift+Drag (preview)', 'Constrain to axis'], ['Ctrl+M', 'Export video'], ['Ctrl+S / Ctrl+O', 'Save / Open project'], ['Ctrl+I', 'Import media'], ['?', 'This help']];
    modal('Keyboard Shortcuts', U.el('table', { class: 'shortcuts' }, rows.map(([k, d]) => U.el('tr', {}, U.el('td', {}, U.el('kbd', {}, k)), U.el('td', {}, d)))), [{ label: 'Close', primary: true }], { width: 560 });
  }

  /* ---------------- left panel tabs ---------------- */
  const TABS = ['media', 'effects', 'transitions', 'titles', 'templates'];
  let activeTab = 'media', mediaFilter = '', mediaType = 'all', mediaView = 'grid';
  function switchTab(tab) { activeTab = tab; TABS.forEach(t => { U.$(`#panel-${t}`).classList.toggle('hidden', t !== tab); U.$(`[data-tab="${t}"]`).classList.toggle('active', t === tab); }); renderPanel(tab); }
  function renderPanel(tab = activeTab) { ({ media: renderMediaPanel, effects: renderEffectsPanel, transitions: renderTransitionsPanel, titles: renderTitlesPanel, templates: renderTemplatesPanel })[tab](); }

  function renderMediaPanel() {
    const root = U.$('#panel-media'); root.innerHTML = '';
    const search = U.el('input', { type: 'search', placeholder: 'Search media…', value: mediaFilter, oninput: (e) => { mediaFilter = e.target.value; renderList(); } });
    const typeSel = U.el('select', { onchange: (e) => { mediaType = e.target.value; renderList(); } }, ['all', 'video', 'audio', 'image'].map(t => U.el('option', { value: t, selected: mediaType === t }, t === 'all' ? 'All types' : t)));
    const viewBtn = U.el('button', { class: 'mini', title: 'Toggle view', onclick: () => { mediaView = mediaView === 'grid' ? 'list' : 'grid'; renderMediaPanel(); } }, mediaView === 'grid' ? '☰' : '▦');
    root.append(U.el('div', { class: 'panel-tools' }, U.el('button', { class: 'primary', onclick: importMedia }, '＋ Import'), U.el('button', { title: 'Record screen', onclick: () => Recorder.screen() }, '🖥'), U.el('button', { title: 'Record webcam', onclick: () => Recorder.webcam() }, '📷'), U.el('button', { title: 'Record voice-over', onclick: () => Recorder.voice() }, '🎙'), viewBtn), U.el('div', { class: 'panel-tools' }, search, typeSel));
    const list = U.el('div', { class: 'media-list ' + mediaView }); root.appendChild(list);
    function renderList() {
      list.innerHTML = ''; const items = state.media.filter(m => (mediaType === 'all' || m.type === mediaType) && (!mediaFilter || m.name.toLowerCase().includes(mediaFilter.toLowerCase()) || (m.tags || []).some(t => t.includes(mediaFilter.toLowerCase()))));
      if (!items.length) { list.appendChild(U.el('div', { class: 'empty drop-hint' }, state.media.length ? 'No matches' : 'Import or drop video, audio and image files here')); return; }
      for (const m of items) {
        const used = mediaUsedBy(m.id).length;
        const thumb = U.el('div', { class: 'thumb' }, m.thumb ? U.el('img', { src: m.thumb, draggable: false }) : U.el('span', { class: 'ph' }, m.type === 'audio' ? '🎵' : m.type === 'image' ? '🖼' : '🎞'), m.duration && m.type !== 'image' ? U.el('span', { class: 'dur' }, U.fmtDur(m.duration)) : null, m.loading ? U.el('span', { class: 'loading' }, '…') : null, m.missing ? U.el('span', { class: 'missing' }, 'MISSING') : null);
        const el = U.el('div', { class: 'media-item ' + m.type + (m.missing ? ' missing' : ''), draggable: true, 'data-id': m.id, title: `${m.name}\n${m.width ? m.width + '×' + m.height : ''} ${m.duration ? U.fmtDur(m.duration) : ''} ${U.fmtBytes(m.size)}${used ? `\nUsed in ${used} clip(s)` : ''}` }, thumb, U.el('div', { class: 'info' }, U.el('div', { class: 'name' }, m.name), U.el('div', { class: 'sub' }, m.type, m.width ? ` · ${m.width}×${m.height}` : '', m.hasAudio && m.type === 'video' ? ' · 🔊' : '', used ? ` · ${used}×` : '')));
        el.ondragstart = (e) => { e.dataTransfer.setData('mediaId', m.id); e.dataTransfer.effectAllowed = 'copy'; };
        el.ondblclick = () => m.missing ? Media.relink(m) : Cmd.addMedia(m.id, { start: state.currentTime });
        el.onclick = () => { U.$$('.media-item.sel', list).forEach(x => x.classList.remove('sel')); el.classList.add('sel'); };
        el.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, e.clientY, [
          { label: 'Add to timeline at playhead', action: () => Cmd.addMedia(m.id, { start: state.currentTime }) }, { label: 'Append to end', action: () => Cmd.addMedia(m.id) },
          m.type !== 'image' && m.audioBuffer ? { label: 'Preview audio (10s)', action: () => AudioEngine.previewMedia(m) } : null,
          { sep: true }, { label: 'Rename…', action: async () => { const n = await prompt('Media name', m.name); if (n) { m.name = n; Events.emit('media:changed'); } } }, { label: 'Tags…', action: async () => { const t = await prompt('Tags (comma separated)', (m.tags || []).join(', ')); if (t !== null) { m.tags = t.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); DB.putFile(m.id, { name: m.name, type: m.file?.type, blob: m.file, tags: m.tags }); Events.emit('media:changed'); } } },
          m.missing ? { label: 'Relink file…', action: () => Media.relink(m) } : null,
          { sep: true }, { label: used ? `Remove (used by ${used} clips)` : 'Remove', action: async () => { if (!used || await confirm('Remove media', `This media is used by ${used} clip(s). Those clips will also be removed.`, 'Remove')) { mutate('Remove media', () => { state.project.tracks.forEach(t => t.clips = t.clips.filter(c => c.mediaId !== m.id)); }); Media.remove(m.id); } } },
        ]); };
        list.appendChild(el);
      }
    }
    renderList();
    root.ondragover = (e) => { e.preventDefault(); root.classList.add('drop'); }; root.ondragleave = () => root.classList.remove('drop'); root.ondrop = async (e) => { e.preventDefault(); root.classList.remove('drop'); const files = Array.from(e.dataTransfer.files || []); if (files.length) { await Media.importFiles(files); toast(`Imported ${files.length} file(s)`); } };
  }
  function renderEffectsPanel() {
    const root = U.$('#panel-effects'); root.innerHTML = '';
    const cats = {}; Object.entries(EFFECT_DEFS).forEach(([k, d]) => (cats[d.category] = cats[d.category] || []).push([k, d]));
    root.appendChild(U.el('div', { class: 'hint pad' }, 'Drag an effect onto a clip, or click to add to the selected clip(s).'));
    for (const [cat, list] of Object.entries(cats)) {
      root.appendChild(U.el('div', { class: 'cat-title' }, cat));
      root.appendChild(U.el('div', { class: 'card-grid' }, list.map(([k, d]) => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('fxType', k), onclick: () => { if (!state.selection.size) return toast('Select a clip first'); Cmd.addEffect([...state.selection], k); state.activeInspectorTab = 'effects'; Inspector.render(); } }, U.el('div', { class: 'card-icon' }, ({ Color: '🎨', Keying: '🟩', 'Blur & Sharpen': '◎', Stylize: '✨', Distort: '〰', Mask: '⬚' })[cat] || '⚙'), U.el('div', { class: 'card-name' }, d.name)))));
    }
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Looks (presets)'));
    root.appendChild(U.el('div', { class: 'card-grid' }, Inspector.LOOKS.map(l => U.el('div', { class: 'card look', onclick: () => { if (!state.selection.size) return toast('Select a clip first'); mutate('Apply look', () => selectedClips().forEach(c => l.fx.forEach(([type, params]) => { const fx = Model.newEffect(type); Object.assign(fx.params, params); c.effects.push(fx); }))); } }, U.el('div', { class: 'card-icon' }, '🎞'), U.el('div', { class: 'card-name' }, l.name)))));
  }
  function renderTransitionsPanel() {
    const root = U.$('#panel-transitions'); root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'hint pad' }, 'Drag onto the start or end of a clip, or click to apply as an In transition to the selected clips. Adjacent clips cross-transition automatically.'));
    root.appendChild(U.el('div', { class: 'card-grid' }, TRANSITION_TYPES.filter(t => t !== 'none').map(t => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('transType', t), onclick: () => { if (!state.selection.size) return toast('Select a clip first'); Cmd.applyTransitionBetweenSelected(t); } }, U.el('div', { class: 'card-icon trans-' + t }, ({ dissolve: '◐', 'dip-black': '◼', 'dip-white': '◻', fade: '◑', 'wipe-left': '◧', 'wipe-right': '◨', 'wipe-up': '⬒', 'wipe-down': '⬓', 'slide-left': '←', 'slide-right': '→', 'slide-up': '↑', 'slide-down': '↓', 'push-left': '⇤', 'push-right': '⇥', 'zoom-in': '⊕', 'zoom-out': '⊖', iris: '◉', blur: '◌', spin: '↻', pop: '✦', clock: '◴', diagonal: '◩', blinds: '≡', pixelate: '▦' })[t] || '◇'), U.el('div', { class: 'card-name' }, t)))));
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Remove'));
    root.appendChild(U.el('div', { class: 'pad' }, U.el('button', { onclick: () => { Cmd.setTransition([...state.selection], 'in', 'none'); Cmd.setTransition([...state.selection], 'out', 'none'); } }, 'Remove transitions from selected')));
  }
  function renderTitlesPanel() {
    const root = U.$('#panel-titles'); root.innerHTML = '';
    const gen = (kind, over, name, dur = 5) => JSON.stringify({ kind, over, name, duration: dur });
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Text'));
    root.appendChild(U.el('div', { class: 'card-grid' }, Inspector.TEXT_PRESETS.map(p => U.el('div', { class: 'card text-preset', draggable: true, ondragstart: (e) => e.dataTransfer.setData('generator', gen('text', { text: Object.assign(Model.defaultText(), p.text, { content: p.name }) }, p.name)), onclick: () => Cmd.addGenerated('text', { text: Object.assign(Model.defaultText(), p.text, { content: p.name }) }, { name: p.name }) }, U.el('div', { class: 'card-preview', style: { fontFamily: p.text.font, fontWeight: p.text.weight, color: p.text.color && p.text.color.length === 7 ? p.text.color : '#fff', background: p.text.bgOpacity ? p.text.bgColor : 'transparent', textShadow: p.text.shadowBlur ? `0 0 ${p.text.shadowBlur / 3}px ${p.text.shadowColor}` : 'none', WebkitTextStroke: p.text.strokeWidth ? `1px ${p.text.strokeColor}` : '0' } }, p.name)))));
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Lower thirds & captions'));
    root.appendChild(U.el('div', { class: 'card-grid' }, [
      ['Lower third', 'text', { text: Object.assign(Model.defaultText(), { content: 'NAME SURNAME\nJob title', size: 64, align: 'left', bgOpacity: .8, bgColor: '#141420', bgPadding: 28, bgRadius: 8, animation: 'slide-left', lineHeight: 1.25 }), transform: { x: -420, y: 330, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0, opacity: 1, uniform: true } }],
      ['Caption bar', 'text', { text: Object.assign(Model.defaultText(), { content: 'Your caption goes here', size: 54, bgOpacity: .7, bgColor: '#000000', bgPadding: 20, bgRadius: 6, animation: 'fade' }), transform: { x: 0, y: 400, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0, opacity: 1, uniform: true } }],
      ['Big headline', 'text', { text: Object.assign(Model.defaultText(), { content: 'BIG\nHEADLINE', font: 'Anton', weight: '400', size: 220, transform: 'upper', animation: 'char-pop', lineHeight: 1 }) }],
      ['Typewriter', 'text', { text: Object.assign(Model.defaultText(), { content: 'Typing text effect...', font: 'Courier New', weight: '700', size: 80, animation: 'typewriter', animDuration: 2.5 }) }],
      ['Countdown 3-2-1', 'text', { text: Object.assign(Model.defaultText(), { content: '3', font: 'Anton', weight: '400', size: 400, animation: 'zoom-out', animDuration: .4 }) }, 1],
    ].map(([name, kind, over, dur]) => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('generator', gen(kind, over, name, dur || 5)), onclick: () => Cmd.addGenerated(kind, over, { name, duration: dur || 5 }) }, U.el('div', { class: 'card-icon' }, 'T'), U.el('div', { class: 'card-name' }, name)))));
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Shapes'));
    root.appendChild(U.el('div', { class: 'card-grid' }, Compositor.ShapeRenderer.TYPES.map(t => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('generator', gen('shape', { shape: { type: t } }, t)), onclick: () => Cmd.addGenerated('shape', { shape: { type: t } }, { name: t }) }, U.el('div', { class: 'card-icon' }, ({ rect: '▭', ellipse: '⬭', triangle: '△', star: '☆', polygon: '⬡', heart: '♡', line: '—', arrow: '➔', speech: '💬', cross: '✚' })[t]), U.el('div', { class: 'card-name' }, t)))));
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Stickers'));
    root.appendChild(U.el('div', { class: 'card-grid stickers' }, STICKERS.map(s => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('generator', gen('sticker', { sticker: { id: s.id, color: s.color, text: '' } }, s.name, 3)), onclick: () => Cmd.addGenerated('sticker', { sticker: { id: s.id, color: s.color, text: '' } }, { name: s.name, duration: 3 }) }, U.el('div', { class: 'card-icon', style: { color: s.color } }, s.icon), U.el('div', { class: 'card-name' }, s.name)))));
    root.appendChild(U.el('div', { class: 'cat-title' }, 'Generators'));
    root.appendChild(U.el('div', { class: 'card-grid' }, [
      ['Solid color', 'solid', { solid: { color: '#1d1640', gradient: false } }], ['Gradient', 'solid', { solid: { color: '#1d1640', color2: '#6c8cff', gradient: true, angle: 45 } }], ['Sunset gradient', 'solid', { solid: { color: '#ff5f7e', color2: '#ffcf4a', gradient: true, angle: 90 } }], ['Adjustment layer', 'adjustment', {}], ['Black', 'solid', { solid: { color: '#000000', gradient: false } }], ['White', 'solid', { solid: { color: '#ffffff', gradient: false } }],
    ].map(([name, kind, over]) => U.el('div', { class: 'card', draggable: true, ondragstart: (e) => e.dataTransfer.setData('generator', gen(kind, over, name)), onclick: () => Cmd.addGenerated(kind, over, { name }) }, U.el('div', { class: 'card-icon', style: kind === 'solid' ? { background: over.solid.gradient ? `linear-gradient(${over.solid.angle}deg, ${over.solid.color}, ${over.solid.color2})` : over.solid.color, borderRadius: '6px', width: '36px', height: '24px' } : {} }, kind === 'adjustment' ? '⚙' : ''), U.el('div', { class: 'card-name' }, name)))));
  }
  const TEMPLATES = [
    { name: 'YouTube 1080p', detail: '1920×1080 · 30fps', w: 1920, h: 1080, fps: 30, bg: '#000000' }, { name: 'YouTube 4K', detail: '3840×2160 · 30fps', w: 3840, h: 2160, fps: 30, bg: '#000000' },
    { name: 'Cinematic 24p', detail: '1920×1080 · 24fps · letterbox', w: 1920, h: 1080, fps: 24, bg: '#000000', letterbox: true }, { name: 'Reels / TikTok', detail: '1080×1920 · 30fps', w: 1080, h: 1920, fps: 30, bg: '#0b0b10' },
    { name: 'Instagram Square', detail: '1080×1080 · 30fps', w: 1080, h: 1080, fps: 30, bg: '#111111' }, { name: 'Portrait 4:5', detail: '1080×1350 · 30fps', w: 1080, h: 1350, fps: 30, bg: '#111111' },
    { name: 'Gaming 60fps', detail: '1920×1080 · 60fps', w: 1920, h: 1080, fps: 60, bg: '#000000' }, { name: 'Ultrawide', detail: '2560×1080 · 30fps', w: 2560, h: 1080, fps: 30, bg: '#000000' },
    { name: 'Clean Studio', detail: '1920×1080 · light background', w: 1920, h: 1080, fps: 30, bg: '#f3f0e8' }, { name: 'Midnight Neon', detail: '1080×1920 · deep navy', w: 1080, h: 1920, fps: 30, bg: '#081a32' },
  ];
  function renderTemplatesPanel() {
    const root = U.$('#panel-templates'); root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'hint pad' }, 'Project templates set resolution, frame rate and background. Existing clips are kept.'));
    root.appendChild(U.el('div', { class: 'template-list' }, TEMPLATES.map(t => U.el('div', { class: 'template-card', onclick: () => applyTemplate(t) }, U.el('div', { class: 'tpl-thumb', style: { aspectRatio: `${t.w}/${t.h}`, background: t.bg } }), U.el('div', {}, U.el('strong', {}, t.name), U.el('small', {}, t.detail))))));
  }
  function applyTemplate(t) {
    mutate('Apply template', () => { const P = state.project; P.width = t.w; P.height = t.h; delete P.canvasCrop; P.fps = t.fps; P.background = t.bg; });
    if (t.letterbox) { const P = state.project; const barH = Math.round(P.height * .12); const vts = videoTracks(); const tr = Cmd.ensureTrack('video', vts.length); const dur = Math.max(10, state.duration); mutate('Letterbox', () => { const top = Model.newClip('shape', { name: 'Letterbox top', duration: dur, sourceDuration: dur, shape: { type: 'rect', fill: '#000000', stroke: '#000', strokeWidth: 0, width: P.width, height: barH, radius: 0 } }); top.transform.y = -(P.height - barH) / 2; const bot = U.deepClone(top); bot.id = U.uid('c'); bot.name = 'Letterbox bottom'; bot.transform.y = (P.height - barH) / 2; Cmd.placeClip(top, tr, 0); Cmd.placeClip(bot, Cmd.ensureTrack('video', vts.length + 1), 0); }); }
    Compositor.clearCaches(); Events.emit('project:resized'); toast(`${t.name} applied`);
  }

  /* ---------------- splitters ---------------- */
  function splitters() {
    const mk = (el, target, prop, min, max, invert = false, vertical = false) => {
      el.onmousedown = (e) => { const start = vertical ? e.clientY : e.clientX; const startSize = parseFloat(getComputedStyle(target)[prop]); const mv = (ev) => { const d = ((vertical ? ev.clientY : ev.clientX) - start) * (invert ? -1 : 1); target.style[prop] = U.clamp(startSize + d, min, max) + 'px'; Preview.layout(); Timeline.render(); }; const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); document.body.style.cursor = vertical ? 'ns-resize' : 'ew-resize'; e.preventDefault(); };
    };
    mk(U.$('#splitLeft'), U.$('#leftPanel'), 'width', 180, 600); mk(U.$('#splitRight'), U.$('#inspector'), 'width', 220, 640, true); mk(U.$('#splitBottom'), U.$('#timelineArea'), 'height', 120, window.innerHeight * .8, true, true);
  }

  function init() { menuBar(); TABS.forEach(t => U.$(`[data-tab="${t}"]`).onclick = () => switchTab(t)); switchTab('media'); splitters(); Events.on('media:changed', () => { if (activeTab === 'media') renderMediaPanel(); }); Events.on('history:changed', refreshToolbar); Events.on('project:changed', refreshToolbar); refreshToolbar(); }
  return { init, toast, modal, prompt, confirm, alert, menu, clipContextMenu, timelineContextMenu, trackContextMenu, markerDialog, speedDialog, pickColorFromPreview, switchTab, renderPanel, toggleSnap, toggleRipple, refreshToolbar, importMedia, shortcutsDialog, TEMPLATES, applyTemplate };
})();
