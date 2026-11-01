/* ============================================================
   MEDIA — import, metadata, audio decode, waveforms, thumbnails,
   per-clip video elements, IndexedDB persistence
============================================================ */
'use strict';

const DB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('veditor_pro', 2);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files'); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const req = fn(t.objectStore(store)); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  return {
    putFile: (id, rec) => tx('files', 'readwrite', s => s.put(rec, id)).catch(e => console.warn('idb put', e)),
    getFile: (id) => tx('files', 'readonly', s => s.get(id)),
    delFile: (id) => tx('files', 'readwrite', s => s.delete(id)).catch(() => { }),
    allFiles: async () => { const d = await open(); return new Promise((res) => { const out = []; const c = d.transaction('files').objectStore('files').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ id: cur.key, ...cur.value }); cur.continue(); } else res(out); }; c.onerror = () => res(out); }); },
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(e => console.warn('idb set', e)),
    get: (k) => tx('kv', 'readonly', s => s.get(k)).catch(() => null),
    clearAll: async () => { await tx('files', 'readwrite', s => s.clear()); await tx('kv', 'readwrite', s => s.clear()); },
  };
})();

const Media = (() => {
  const clipEls = new Map(); // clipId -> HTMLVideoElement
  let sharedCtx = null;
  const actx = () => sharedCtx || (sharedCtx = (typeof AudioEngine !== 'undefined' ? AudioEngine.ctx() : new (window.AudioContext || window.webkitAudioContext)()));

  function typeOf(file) {
    const t = file.type || '';
    if (t.startsWith('video')) return 'video'; if (t.startsWith('image')) return 'image'; if (t.startsWith('audio')) return 'audio';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'weba'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return 'image';
    return null;
  }

  async function importFiles(files, { persist = true, id = null } = {}) {
    const added = [];
    for (const file of files) {
      const type = typeOf(file);
      if (!type) { UI.toast(`Unsupported file: ${file.name}`); continue; }
      const m = { id: id || U.uid('m'), name: file.name, type, file, url: URL.createObjectURL(file), size: file.size, duration: 0, width: 0, height: 0, el: null, audioBuffer: null, peaks: null, thumb: null, strip: null, hasAudio: false, loading: true, tags: [] };
      state.media.push(m); added.push(m);
      Events.emit('media:changed');
      try { await loadMetadata(m); } catch (e) { console.warn('metadata', e); }
      if (persist) DB.putFile(m.id, { name: file.name, type: file.type, blob: file, tags: m.tags });
      // background: audio decode + thumbnails
      m.audioReady = decodeAudio(m).then(() => { Events.emit('media:changed'); Events.emit('timeline:refresh'); });
      makeThumb(m).then(() => Events.emit('media:changed'));
      m.loading = false; Events.emit('media:changed');
    }
    return added;
  }

  function loadMetadata(m) {
    return new Promise((res) => {
      if (m.type === 'video') {
        const v = document.createElement('video'); v.src = m.url; v.preload = 'auto'; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
        m.el = v;
        v.onloadedmetadata = () => { m.duration = isFinite(v.duration) ? v.duration : 0; m.width = v.videoWidth; m.height = v.videoHeight; res(); };
        v.onerror = () => { m.error = 'Cannot decode video'; res(); };
        setTimeout(res, 8000);
      } else if (m.type === 'audio') {
        const a = document.createElement('audio'); a.src = m.url; a.preload = 'auto'; m.el = a;
        a.onloadedmetadata = () => { m.duration = isFinite(a.duration) ? a.duration : 0; res(); };
        a.onerror = () => { m.error = 'Cannot decode audio'; res(); };
        setTimeout(res, 8000);
      } else {
        const img = new Image(); img.src = m.url; m.el = img;
        img.onload = () => { m.width = img.naturalWidth; m.height = img.naturalHeight; m.duration = 5; res(); };
        img.onerror = () => { m.error = 'Cannot load image'; res(); };
      }
    });
  }

  async function decodeAudio(m) {
    if (m.type === 'image') return;
    try {
      const buf = await U.readFileBuffer(m.file);
      const ab = await actx().decodeAudioData(buf.slice(0));
      m.audioBuffer = ab; m.hasAudio = true;
      if (!m.duration || !isFinite(m.duration)) m.duration = ab.duration;
      m.peaks = computePeaks(ab, 100);
    } catch (e) {
      // video without audio track, or unsupported container for decodeAudioData
      m.hasAudio = m.type === 'audio'; // element fallback for pure audio files
      m.audioBuffer = null;
    }
  }

  /* peaks: Float32Array of max-abs values, `pps` per second */
  function computePeaks(ab, pps = 100) {
    const ch = ab.numberOfChannels, len = ab.length, per = Math.max(1, Math.floor(ab.sampleRate / pps)), n = Math.ceil(len / per);
    const out = new Float32Array(n); const data = []; for (let c = 0; c < ch; c++) data.push(ab.getChannelData(c));
    for (let i = 0; i < n; i++) { let mx = 0; const s0 = i * per, s1 = Math.min(len, s0 + per); for (let s = s0; s < s1; s += 2) { for (let c = 0; c < ch; c++) { const v = Math.abs(data[c][s]); if (v > mx) mx = v; } } out[i] = mx; }
    return { data: out, pps };
  }

  async function makeThumb(m) {
    const cvs = document.createElement('canvas'); const W = 160, H = 90; cvs.width = W; cvs.height = H; const c = cvs.getContext('2d');
    if (m.type === 'image') { if (!m.el || !m.width) return; drawCover(c, m.el, m.width, m.height, W, H); m.thumb = cvs.toDataURL('image/jpeg', .7); return; }
    if (m.type === 'video') { const frame = await grabFrame(m, Math.min(1, m.duration * .1)); if (frame) { drawCover(c, frame, frame.width, frame.height, W, H); m.thumb = cvs.toDataURL('image/jpeg', .7); } return; }
    if (m.type === 'audio') { c.fillStyle = '#2a2230'; c.fillRect(0, 0, W, H); if (m.peaks) drawPeaks(c, m.peaks, 0, m.duration, 0, 0, W, H, '#e0a060'); m.thumb = cvs.toDataURL('image/png'); }
  }
  function drawCover(c, img, sw, sh, dw, dh) { const s = Math.max(dw / sw, dh / sh); const w = sw * s, h = sh * s; c.drawImage(img, (dw - w) / 2, (dh - h) / 2, w, h); }
  function drawPeaks(c, peaks, t0, t1, x, y, w, h, color) {
    if (!peaks || !peaks.data.length) return;
    c.fillStyle = color; const mid = y + h / 2; const n = Math.max(1, Math.floor(w));
    const per = (t1 - t0) / n * peaks.pps;
    for (let i = 0; i < n; i++) { const a = Math.floor((t0 * peaks.pps) + i * per), b = Math.max(a + 1, Math.floor(a + per)); let mx = 0; for (let j = a; j < b && j < peaks.data.length; j++) if (peaks.data[j] > mx) mx = peaks.data[j]; const hh = Math.max(1, mx * h * .95); c.fillRect(x + i, mid - hh / 2, 1, hh); }
  }

  /* grab a single frame from a video media at time t (uses a dedicated scratch element) */
  const scratch = new Map();
  function grabFrame(m, t, maxW = 320) {
    return new Promise((res) => {
      if (!m.el || m.type !== 'video') return res(null);
      let v = scratch.get(m.id); if (!v) { v = document.createElement('video'); v.src = m.url; v.muted = true; v.preload = 'auto'; scratch.set(m.id, v); }
      const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); try { const s = Math.min(1, maxW / (v.videoWidth || 1)); const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.round(v.videoWidth * s)); cv.height = Math.max(2, Math.round(v.videoHeight * s)); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); res(cv); } catch (e) { res(null); } };
      const to = setTimeout(() => { v.removeEventListener('seeked', done); res(null); }, 4000);
      const go = () => { v.addEventListener('seeked', done); v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - .05)); };
      if (v.readyState >= 1) go(); else v.onloadedmetadata = go;
    });
  }

  /* filmstrip: N frames evenly across the source; cached; async */
  const stripPending = new Set();
  async function filmstrip(m, n = 12) {
    if (m.type !== 'video' || m.strip || stripPending.has(m.id) || !m.duration) return m.strip;
    stripPending.add(m.id); const frames = [];
    for (let i = 0; i < n; i++) { const f = await grabFrame(m, (i + .5) / n * m.duration, 160); if (f) frames.push({ t: (i + .5) / n * m.duration, cvs: f }); }
    m.strip = frames; stripPending.delete(m.id); Events.emit('timeline:refresh'); return frames;
  }

  function remove(id) {
    const m = findMedia(id); if (!m) return;
    state.media = state.media.filter(x => x.id !== id);
    try { URL.revokeObjectURL(m.url); } catch (e) { }
    scratch.delete(id); DB.delFile(id); Events.emit('media:changed');
  }

  /* per-clip video element so the same media can appear multiple times simultaneously */
  function clipVideo(clip) {
    let v = clipEls.get(clip.id);
    const m = findMedia(clip.mediaId); if (!m || m.type !== 'video') return null;
    if (!v) { v = document.createElement('video'); v.src = m.url; v.muted = true; v.preload = 'auto'; v.playsInline = true; clipEls.set(clip.id, v); v.load(); }
    return v;
  }
  function releaseClip(clipId) { const v = clipEls.get(clipId); if (v) { v.pause(); v.removeAttribute('src'); v.load(); clipEls.delete(clipId); } }
  function gcClipEls() { const live = new Set(allClips().map(c => c.id)); for (const id of [...clipEls.keys()]) if (!live.has(id)) releaseClip(id); }
  function allClipEls() { return clipEls; }

  /* restore persisted media from IndexedDB */
  async function restore() {
    try {
      const recs = await DB.allFiles();
      for (const r of recs) { const f = new File([r.blob], r.name, { type: r.type }); await importFiles([f], { persist: false, id: r.id }); const m = findMedia(r.id); if (m && r.tags) m.tags = r.tags; }
    } catch (e) { console.warn('restore media', e); }
  }

  /* relink: user picks a file for a missing media id */
  async function relink(m) {
    const [f] = await U.pickFiles('video/*,audio/*,image/*', false); if (!f) return;
    if (typeOf(f) !== m.type) return UI.toast('Choose a replacement of the same media type');
    Player.pause(); AudioEngine.resetMedia();
    // Existing clip players otherwise keep the old missing/replaced object URL.
    mediaUsedBy(m.id).forEach(c => releaseClip(c.id));
    scratch.delete(m.id);
    if (m.url) URL.revokeObjectURL(m.url);
    const idx = state.media.indexOf(m); if (idx >= 0) state.media.splice(idx, 1);
    await importFiles([f], { id: m.id }); Events.emit('project:changed');
  }

  /* placeholder media entry for a project loaded without its files */
  function placeholder(id, name, type) { const m = { id, name, type, url: '', file: null, size: 0, duration: 0, width: 0, height: 0, el: null, audioBuffer: null, peaks: null, thumb: null, missing: true, tags: [] }; state.media.push(m); return m; }

  return { importFiles, remove, clipVideo, releaseClip, gcClipEls, allClipEls, grabFrame, filmstrip, drawPeaks, restore, relink, placeholder, typeOf, computePeaks };
})();
