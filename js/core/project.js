/* ============================================================
   PROJECT — new / open / save / autosave (IndexedDB) / recovery
============================================================ */
'use strict';

const Project = (() => {
  const AUTOSAVE_KEY = 'autosave';
  function serialize() {
    return { app: 'VideoEditorPro', version: 2, savedAt: Date.now(), project: U.deepClone(state.project), media: state.media.map(m => ({ id: m.id, name: m.name, type: m.type, duration: m.duration ?? 0, width: m.width ?? 0, height: m.height ?? 0, size: m.size ?? 0, tags: m.tags || [] })), mix: { volume: state.masterVolume, muted: state.muted }, view: { pxPerSec: state.pxPerSec, currentTime: state.currentTime }, luts: Compositor.exportLUTs() };
  }
  async function load(data, { keepMedia = true } = {}) {
    data = ProjectValidation.validate(data);
    if (state.exporting) throw Error('Finish or cancel the export before opening another project');
    const references = new Map((data.media || []).map(m => [m.id, m]));
    for (const track of data.project.tracks) for (const clip of track.clips) {
      if (clip.mediaId && !references.has(clip.mediaId)) {
        const cached = findMedia(clip.mediaId);
        references.set(clip.mediaId, { id: clip.mediaId, name: cached?.name || clip.name, type: cached?.type || clip.kind });
      }
    }
    Player.pause(); History.clear();
    state.project = data.project; state.selection.clear(); state.selectedTrackId = null;
    for (const id of [...Media.allClipEls().keys()]) Media.releaseClip(id);
    AudioEngine.resetMedia(); Compositor.restoreLUTs(data.luts);
    // media: anything referenced but not present becomes a placeholder to relink
    for (const md of references.values()) {
      const item = findMedia(md.id) || Media.placeholder(md.id, md.name, md.type);
      item.name = md.name; item.tags = md.tags || [];
      if (item.missing) Object.assign(item, { duration: md.duration ?? 0, width: md.width ?? 0, height: md.height ?? 0, size: md.size ?? 0 });
    }
    state.masterVolume = data.mix?.volume ?? 1; state.muted = data.mix?.muted ?? false;
    document.getElementById('masterVol').value = state.masterVolume;
    document.getElementById('btnMute').textContent = state.muted ? '🔇' : '🔊';
    AudioEngine.updateMix();
    state.currentTime = 0;
    if (data.view) { if (Number.isFinite(data.view.pxPerSec)) state.pxPerSec = U.clamp(data.view.pxPerSec, 1, 1500); if (Number.isFinite(data.view.currentTime)) state.currentTime = Math.max(0, data.view.currentTime); }
    Media.gcClipEls(); Compositor.clearCaches(); recalcDuration(); state.dirty = false;
    Events.emit('project:loaded'); Events.emit('project:changed'); Events.emit('selection:changed'); Events.emit('media:changed'); Events.emit('project:resized');
  }
  async function newProject() {
    if (state.dirty && !(await UI.confirm('New project', 'Discard unsaved changes?', 'Discard'))) return;
    await load({ project: Model.newProject() }); Timeline.zoomFit(); UI.toast('New project'); return true;
  }
  function save() { try { const blob = new Blob([JSON.stringify(ProjectValidation.validate(serialize()), null, 1)], { type: 'application/json' }); U.download(blob, `${state.project.name.replace(/[^\w\- ]+/g, '_')}.vep.json`); state.dirty = false; UI.refreshToolbar(); UI.toast('Project saved (downloaded). Media files are cached in this browser; keep the originals to relink on another machine.'); return true; } catch (e) { UI.toast('Save failed. ' + e.message, 6000); return false; } }
  async function saveAs() { const n = await UI.prompt('Project name', state.project.name); if (n === null) return; mutate('Rename', () => state.project.name = n); save(); }
  async function open() {
    const [f] = await U.pickFiles('.json,application/json', false); if (!f) return;
    if (state.dirty && !(await UI.confirm('Open project', 'Discard unsaved changes to the current project?', 'Open'))) return;
    return openFile(f);
  }
  async function openFile(f) {
    try { const data = JSON.parse((await U.readFileText(f)).replace(/^\uFEFF/, '')); await load(data); UI.toast(`Opened ${state.project.name}`); const missing = state.media.filter(m => m.missing && mediaUsedBy(m.id).length); if (missing.length) UI.alert('Missing media', `${missing.length} media file(s) are not in this browser's cache. Double-click them in the Media panel to relink.`); return true; }
    catch (e) { UI.alert('Open failed', U.esc(e.message)); return false; }
  }
  /* autosave */
  const autosave = U.debounce(async () => { if (!state.autosave) return; try { await DB.set(AUTOSAVE_KEY, ProjectValidation.validate(serialize())); } catch (e) { } }, 1500);
  async function restoreAutosave() {
    try { const data = await DB.get(AUTOSAVE_KEY); if (data?.project) { await load(data); state.dirty = false; return true; } } catch (e) { console.warn('autosave restore', e); }
    return false;
  }
  function init() { Events.on('project:changed', autosave); Events.on('history:changed', autosave); window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } }); }
  return { serialize, load, newProject, save, saveAs, open, openFile, restoreAutosave, init };
})();
