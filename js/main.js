/* ============================================================
   MAIN — bootstrap, transport controls, keyboard shortcuts
============================================================ */
'use strict';

(async function main() {
  const $ = U.$;
  UI.init(); Preview.init(); Timeline.init(); Inspector.init(); Project.init();

  /* ---- transport ---- */
  const playBtn = $('#btnPlay');
  Events.on('playback:changed', () => { playBtn.textContent = state.playing ? '⏸' : '▶'; playBtn.title = state.playing ? 'Pause (Space)' : 'Play (Space)'; $('#rateLabel').textContent = state.playing && state.playRate !== 1 ? state.playRate + 'x' : ''; });
  Events.on('time:changed', () => { $('#tcCurrent').textContent = U.toTimecode(state.currentTime, state.project.fps); $('#tcTotal').textContent = U.toTimecode(state.duration, state.project.fps); });
  Events.on('project:changed', () => { $('#tcTotal').textContent = U.toTimecode(state.duration, state.project.fps); });
  Events.on('project:resized', () => { Preview.layout(); Player.requestRender(); });
  Events.on('project:loaded', () => { Timeline.render(); Preview.layout(); Player.seek(state.currentTime); });
  $('#btnPlay').onclick = () => Player.toggle(); $('#btnStart').onclick = () => Player.goStart(); $('#btnEnd').onclick = () => Player.goEnd(); $('#btnPrev').onclick = () => Player.step(-1); $('#btnNext').onclick = () => Player.step(1);
  $('#btnLoop').onclick = () => { state.loop = !state.loop; UI.refreshToolbar(); };
  $('#btnIn').onclick = () => Cmd.setIn(); $('#btnOut').onclick = () => Cmd.setOut(); $('#btnMarker').onclick = () => Cmd.addMarker();
  $('#btnCanvasCrop').onclick = () => CanvasTools.open();
  $('#btnCenterX').onclick = () => Cmd.centerClip('x');
  $('#btnCenterY').onclick = () => Cmd.centerClip('y');
  $('#btnPreviewSnap').onclick = () => UI.toggleSnap();
  const canvasStatus = () => { $('#canvasSize').textContent = `${state.project.width} × ${state.project.height}`; $('#btnCanvasCrop').classList.toggle('active', !!state.project.canvasCrop); };
  Events.on('project:changed', canvasStatus); canvasStatus();
  $('#btnSnapshot').onclick = () => Preview.snapshot('png'); $('#btnFullscreen').onclick = () => Preview.fullscreen();
  $('#btnSafe').onclick = () => { state.showSafeAreas = !state.showSafeAreas; $('#btnSafe').classList.toggle('active', state.showSafeAreas); Preview.drawOverlay(); };
  $('#previewZoomSel').onchange = (e) => Preview.setZoom(e.target.value);
  $('#qualitySel').onchange = (e) => { state.previewQuality = +e.target.value; Player.requestRender(); };
  $('#masterVol').oninput = (e) => { state.masterVolume = +e.target.value; AudioEngine.updateMix(); };
  $('#btnMute').onclick = () => { state.muted = !state.muted; $('#btnMute').textContent = state.muted ? '🔇' : '🔊'; AudioEngine.updateMix(); };
  $('#tcCurrent').onclick = async () => { const v = await UI.prompt('Go to timecode', U.toTimecode(state.currentTime, state.project.fps)); if (v !== null) { const t = U.parseTimecode(v, state.project.fps); if (!isNaN(t)) Player.seek(t); } };
  const tlTc = $('#tlTimecode'); tlTc.onchange = () => { const t = U.parseTimecode(tlTc.value, state.project.fps); if (!isNaN(t)) Player.seek(t); tlTc.blur(); }; tlTc.onkeydown = (e) => { if (e.key === 'Enter') tlTc.onchange(); e.stopPropagation(); };
  /* toolbar */
  $('#btnUndo').onclick = () => History.undo(); $('#btnRedo').onclick = () => History.redo();
  $('#btnSnap').onclick = () => UI.toggleSnap(); $('#btnRipple').onclick = () => UI.toggleRipple();
  U.$$('[data-tool]').forEach(b => b.onclick = () => Timeline.setTool(b.dataset.tool));
  $('#btnSplit').onclick = () => Cmd.splitAt(); $('#btnDelete').onclick = () => Cmd.deleteClips(); $('#btnRippleDelete').onclick = () => Cmd.deleteClips([...state.selection], true);
  $('#btnAddText').onclick = () => Cmd.addGenerated('text'); $('#btnExport').onclick = () => Exporter.dialog(); $('#btnImport').onclick = () => UI.importMedia();
  $('#btnSave').onclick = () => Project.save(); $('#btnOpen').onclick = () => Project.open(); $('#btnHelp').onclick = () => UI.shortcutsDialog();
  const zoom = $('#tlZoom'); zoom.min = Math.log(1); zoom.max = Math.log(1500); zoom.step = .01; zoom.value = Math.log(state.pxPerSec); zoom.oninput = () => Timeline.setZoom(Math.exp(+zoom.value)); $('#btnZoomFit').onclick = () => Timeline.zoomFit(); $('#btnZoomIn').onclick = () => Timeline.setZoom(state.pxPerSec * 1.3); $('#btnZoomOut').onclick = () => Timeline.setZoom(state.pxPerSec / 1.3);
  Timeline.setTool('select');

  /* ---- level meters ---- */
  const meterL = $('#meterL'), meterR = $('#meterR'); let peakL = 0, peakR = 0;
  (function meters() { const { l, r } = AudioEngine.levels(); peakL = Math.max(l, peakL * .92); peakR = Math.max(r, peakR * .92); meterL.style.height = Math.min(100, peakL * 100) + '%'; meterR.style.height = Math.min(100, peakR * 100) + '%'; meterL.classList.toggle('clip', peakL > .98); meterR.classList.toggle('clip', peakR > .98); requestAnimationFrame(meters); })();

  /* ---- global drag & drop of files ---- */
  window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async e => { if (e.target.closest('#tlTracks, #panel-media, #previewOverlay')) return; if (e.dataTransfer.files.length) { e.preventDefault(); const added = await Media.importFiles(Array.from(e.dataTransfer.files)); UI.toast(`Imported ${added.length} file(s)`); UI.switchTab('media'); } });

  /* ---- keyboard shortcuts ---- */
  let lRate = 0;
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back')) return;
    const tag = e.target.tagName; const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    if (typing && !(e.ctrlKey || e.metaKey) && e.key !== 'Escape') return;
    if (typing && (e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z', 'y'].includes(e.key.toLowerCase()) && tag !== 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey; const k = e.key; const fps = state.project.fps; const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') { if (typing) e.target.blur(); else Cmd.deselect(); return; }
    if (mod) {
      switch (k.toLowerCase()) {
        case 'z': stop(); e.shiftKey ? History.redo() : History.undo(); return; case 'y': stop(); History.redo(); return;
        case 'c': stop(); Cmd.copy(); return; case 'x': stop(); Cmd.cut(); return; case 'v': stop(); e.altKey ? Cmd.pasteAttributes() : Cmd.paste(); return;
        case 'd': stop(); e.shiftKey ? Cmd.deselect() : Cmd.duplicate(); return; case 'a': stop(); e.shiftKey ? Cmd.selectForward() : Cmd.selectAll(); return;
        case 's': stop(); e.shiftKey ? Project.saveAs() : Project.save(); return; case 'o': stop(); Project.open(); return; case 'n': stop(); Project.newProject(); return;
        case 'i': stop(); UI.importMedia(); return; case 'm': stop(); Exporter.dialog(); return; case 't': stop(); Cmd.addGenerated('text'); return;
        case 'l': stop(); if (e.shiftKey) Cmd.unlink(); else if (state.selection.size > 1) Cmd.link(); else { state.loop = !state.loop; UI.refreshToolbar(); } return;
        case 'r': stop(); { const c = primaryClip(); if (c) UI.speedDialog(c); } return;
        case 'e': if (e.shiftKey) { stop(); Preview.snapshot('png'); } return;
        case 'f': if (e.shiftKey) { stop(); Preview.fullscreen(); } return;
        case "'": stop(); state.showSafeAreas = !state.showSafeAreas; Preview.drawOverlay(); return;
        case '=': case '+': stop(); Timeline.setZoom(state.pxPerSec * 1.3); return; case '-': stop(); Timeline.setZoom(state.pxPerSec / 1.3); return;
      }
      return;
    }
    switch (k) {
      case ' ': stop(); Player.toggle(); lRate = 0; return;
      case 'k': case 'K': stop(); Player.pause(); lRate = 0; return;
      case 'l': case 'L': stop(); lRate = state.playing && state.playRate > 0 ? Math.min(8, state.playRate * 2) : 1; Player.shuttle(lRate); return;
      case 'j': case 'J': stop(); { const r = state.playing && state.playRate < 0 ? Math.max(-8, state.playRate * 2) : -1; Player.shuttle(r); } return;
      case 'ArrowLeft': stop(); if (e.altKey) Cmd.nudge(-(e.shiftKey ? 10 : 1) / fps); else Player.step(e.shiftKey ? -10 : -1); return;
      case 'ArrowRight': stop(); if (e.altKey) Cmd.nudge((e.shiftKey ? 10 : 1) / fps); else Player.step(e.shiftKey ? 10 : 1); return;
      case 'ArrowUp': stop(); if (e.altKey) Cmd.nudgeTrack(1); else { const edges = allClips().flatMap(c => [c.start, clipEnd(c)]).filter(t => t < state.currentTime - 1e-4); if (edges.length) Player.seek(Math.max(...edges)); else Player.seek(0); } return;
      case 'ArrowDown': stop(); if (e.altKey) Cmd.nudgeTrack(-1); else { const edges = allClips().flatMap(c => [c.start, clipEnd(c)]).filter(t => t > state.currentTime + 1e-4); if (edges.length) Player.seek(Math.min(...edges)); } return;
      case 'Home': stop(); Player.goStart(); return; case 'End': stop(); Player.goEnd(); return;
      case 'Delete': case 'Backspace': stop(); Cmd.deleteClips([...state.selection], e.shiftKey || state.ripple); return;
      case 'i': stop(); Cmd.setIn(); return; case 'o': stop(); Cmd.setOut(); return;
      case 'm': stop(); Cmd.addMarker(); return; case 'M': stop(); { const mk = state.project.markers.find(x => Math.abs(x.time - state.currentTime) < .5 / fps); if (mk) UI.markerDialog(mk); else Cmd.addMarker(); } return;
      case 's': stop(); Cmd.splitAt(); return;
      case 'c': stop(); Timeline.setTool('razor'); return; case 'v': stop(); Timeline.setTool('select'); return; case 'h': stop(); Timeline.setTool('hand'); return;
      case 'n': stop(); UI.toggleSnap(); return; case 'r': stop(); UI.toggleRipple(); return;
      case 'E': stop(); { const c = primaryClip(); if (c) Cmd.setEnabled([...state.selection], !c.enabled); } return;
      case 'F': stop(); Cmd.freezeFrame(); return;
      case ',': stop(); Cmd.nudge(-(e.shiftKey ? 10 : 1) / fps); return; case '.': stop(); Cmd.nudge((e.shiftKey ? 10 : 1) / fps); return;
      case '=': case '+': stop(); Timeline.setZoom(state.pxPerSec * 1.3); return; case '-': case '_': stop(); Timeline.setZoom(state.pxPerSec / 1.3); return;
      case 'Z': stop(); Timeline.zoomFit(); return;
      case 'X': if (e.altKey) { stop(); Cmd.clearInOut(); } return;
      case "'": stop(); Cmd.extractInOut(false); return; case ';': stop(); Cmd.extractInOut(true); return;
      case '?': stop(); UI.shortcutsDialog(); return;
      case 'Tab': stop(); document.body.classList.toggle('hide-right'); Preview.layout(); return;
    }
    if (e.altKey && k.toLowerCase() === 'x') { stop(); Cmd.clearInOut(); }
  });

  /* ---- boot: restore media + autosave ---- */
  UI.toast('Loading…', 1200);
  await Media.restore();
  const restored = await Project.restoreAutosave();
  if (restored) UI.toast('Recovered previous session'); else Events.emit('project:changed');
  Events.emit('media:changed'); Events.emit('selection:changed'); Events.emit('time:changed'); Events.emit('playback:changed');
  Preview.layout(); Player.requestRender(); UI.refreshToolbar();
  document.body.classList.remove('booting');
  // unlock audio on first interaction
  const unlock = () => { AudioEngine.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); }; window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  // periodic re-render while paused so late-loading media shows up
  setInterval(() => { if (!state.playing) Player.requestRender(); }, 1000);
})();
