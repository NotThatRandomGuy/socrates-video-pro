/* ============================================================
   STATE — project data model, factories, history (undo/redo), events
============================================================ */
'use strict';

const Events = (() => {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); return () => map.get(name).delete(fn); },
    emit(name, ...args) { (map.get(name) || []).forEach(fn => { try { fn(...args); } catch (e) { console.error('event', name, e); } }); },
  };
})();

const CLIP_KINDS = ['video', 'audio', 'image', 'text', 'shape', 'sticker', 'solid', 'adjustment'];
const VISUAL_KINDS = ['video', 'image', 'text', 'shape', 'sticker', 'solid', 'adjustment'];
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const LABEL_COLORS = { none: null, red: '#e05555', orange: '#e08a3c', yellow: '#d6c04a', green: '#4fb26a', teal: '#3aa9a0', blue: '#4f7fe0', purple: '#9a63d8', pink: '#d86aa8' };

/* ---- Effect definitions (param name -> {min,max,def,step,label}) ---- */
const EFFECT_DEFS = {
  color: {
    name: 'Color Correction', category: 'Color', params: {
      exposure: { min: -3, max: 3, def: 0, step: .01, label: 'Exposure' },
      brightness: { min: -100, max: 100, def: 0, step: 1, label: 'Brightness' },
      contrast: { min: -100, max: 100, def: 0, step: 1, label: 'Contrast' },
      saturation: { min: -100, max: 100, def: 0, step: 1, label: 'Saturation' },
      vibrance: { min: -100, max: 100, def: 0, step: 1, label: 'Vibrance' },
      temperature: { min: -100, max: 100, def: 0, step: 1, label: 'Temperature' },
      tint: { min: -100, max: 100, def: 0, step: 1, label: 'Tint' },
      hue: { min: -180, max: 180, def: 0, step: 1, label: 'Hue' },
      highlights: { min: -100, max: 100, def: 0, step: 1, label: 'Highlights' },
      shadows: { min: -100, max: 100, def: 0, step: 1, label: 'Shadows' },
      gamma: { min: .2, max: 3, def: 1, step: .01, label: 'Gamma' },
    }
  },
  wheels: {
    name: 'Lift / Gamma / Gain', category: 'Color', params: {
      liftR: { min: -.5, max: .5, def: 0, step: .005, label: 'Lift R' }, liftG: { min: -.5, max: .5, def: 0, step: .005, label: 'Lift G' }, liftB: { min: -.5, max: .5, def: 0, step: .005, label: 'Lift B' },
      gammaR: { min: .2, max: 3, def: 1, step: .01, label: 'Gamma R' }, gammaG: { min: .2, max: 3, def: 1, step: .01, label: 'Gamma G' }, gammaB: { min: .2, max: 3, def: 1, step: .01, label: 'Gamma B' },
      gainR: { min: 0, max: 3, def: 1, step: .01, label: 'Gain R' }, gainG: { min: 0, max: 3, def: 1, step: .01, label: 'Gain G' }, gainB: { min: 0, max: 3, def: 1, step: .01, label: 'Gain B' },
    }
  },
  lut: { name: 'LUT (.cube)', category: 'Color', params: { intensity: { min: 0, max: 1, def: 1, step: .01, label: 'Intensity' } }, extra: 'lut' },
  curves: { name: 'Curves (Levels)', category: 'Color', params: { inBlack: { min: 0, max: 1, def: 0, step: .005, label: 'Input Black' }, inWhite: { min: 0, max: 1, def: 1, step: .005, label: 'Input White' }, outBlack: { min: 0, max: 1, def: 0, step: .005, label: 'Output Black' }, outWhite: { min: 0, max: 1, def: 1, step: .005, label: 'Output White' } } },
  chromakey: {
    name: 'Chroma Key', category: 'Keying', params: {
      similarity: { min: 0, max: 1, def: .4, step: .01, label: 'Similarity' },
      smoothness: { min: 0, max: 1, def: .1, step: .01, label: 'Smoothness' },
      spill: { min: 0, max: 1, def: .3, step: .01, label: 'Spill Suppression' },
    }, colorParams: { keyColor: '#00ff00' }
  },
  lumakey: { name: 'Luma Key', category: 'Keying', params: { threshold: { min: 0, max: 1, def: .1, step: .01, label: 'Threshold' }, softness: { min: 0, max: 1, def: .1, step: .01, label: 'Softness' }, invert: { min: 0, max: 1, def: 0, step: 1, label: 'Invert' } } },
  blur: { name: 'Gaussian Blur', category: 'Blur & Sharpen', params: { radius: { min: 0, max: 60, def: 8, step: .5, label: 'Radius' } } },
  sharpen: { name: 'Sharpen', category: 'Blur & Sharpen', params: { amount: { min: 0, max: 3, def: .6, step: .01, label: 'Amount' } } },
  vignette: { name: 'Vignette', category: 'Stylize', params: { amount: { min: 0, max: 1, def: .5, step: .01, label: 'Amount' }, size: { min: 0, max: 1.5, def: .75, step: .01, label: 'Size' }, softness: { min: .01, max: 1, def: .5, step: .01, label: 'Softness' } } },
  grain: { name: 'Film Grain', category: 'Stylize', params: { amount: { min: 0, max: 1, def: .2, step: .01, label: 'Amount' } } },
  pixelate: { name: 'Pixelate', category: 'Stylize', params: { size: { min: 1, max: 100, def: 12, step: 1, label: 'Block Size' } } },
  posterize: { name: 'Posterize', category: 'Stylize', params: { levels: { min: 2, max: 32, def: 6, step: 1, label: 'Levels' } } },
  invert: { name: 'Invert', category: 'Stylize', params: { amount: { min: 0, max: 1, def: 1, step: .01, label: 'Amount' } } },
  sepia: { name: 'Sepia', category: 'Stylize', params: { amount: { min: 0, max: 1, def: 1, step: .01, label: 'Amount' } } },
  mono: { name: 'Black & White', category: 'Stylize', params: { amount: { min: 0, max: 1, def: 1, step: .01, label: 'Amount' } } },
  chromatic: { name: 'Chromatic Aberration', category: 'Stylize', params: { amount: { min: 0, max: 20, def: 4, step: .1, label: 'Amount' } } },
  glow: { name: 'Glow', category: 'Stylize', params: { amount: { min: 0, max: 2, def: .6, step: .01, label: 'Amount' }, threshold: { min: 0, max: 1, def: .6, step: .01, label: 'Threshold' }, radius: { min: 1, max: 60, def: 20, step: 1, label: 'Radius' } } },
  mirror: { name: 'Mirror', category: 'Distort', params: { horizontal: { min: 0, max: 1, def: 1, step: 1, label: 'Horizontal' }, vertical: { min: 0, max: 1, def: 0, step: 1, label: 'Vertical' } } },
  flip: { name: 'Flip', category: 'Distort', params: { horizontal: { min: 0, max: 1, def: 1, step: 1, label: 'Flip Horizontal' }, vertical: { min: 0, max: 1, def: 0, step: 1, label: 'Flip Vertical' } } },
  wave: { name: 'Wave Distortion', category: 'Distort', params: { amplitude: { min: 0, max: .2, def: .03, step: .001, label: 'Amplitude' }, frequency: { min: 1, max: 40, def: 8, step: .5, label: 'Frequency' }, speed: { min: 0, max: 10, def: 2, step: .1, label: 'Speed' } } },
  mask: {
    name: 'Mask', category: 'Mask', params: {
      shape: { min: 0, max: 2, def: 0, step: 1, label: 'Shape (0 rect, 1 ellipse, 2 rounded)' },
      x: { min: 0, max: 1, def: .5, step: .005, label: 'Center X' }, y: { min: 0, max: 1, def: .5, step: .005, label: 'Center Y' },
      w: { min: 0, max: 1, def: .5, step: .005, label: 'Width' }, h: { min: 0, max: 1, def: .5, step: .005, label: 'Height' },
      feather: { min: 0, max: .5, def: .02, step: .005, label: 'Feather' }, rotation: { min: -180, max: 180, def: 0, step: 1, label: 'Rotation' },
      invert: { min: 0, max: 1, def: 0, step: 1, label: 'Invert' },
    }
  },
  dropshadow: { name: 'Drop Shadow', category: 'Stylize', params: { x: { min: -100, max: 100, def: 8, step: 1, label: 'Offset X' }, y: { min: -100, max: 100, def: 8, step: 1, label: 'Offset Y' }, blur: { min: 0, max: 60, def: 12, step: 1, label: 'Blur' }, opacity: { min: 0, max: 1, def: .6, step: .01, label: 'Opacity' } }, colorParams: { color: '#000000' }, canvasOnly: true },
};

const TRANSITION_TYPES = ['none', 'dissolve', 'dip-black', 'dip-white', 'fade', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'push-left', 'push-right', 'zoom-in', 'zoom-out', 'iris', 'blur', 'spin', 'pop', 'clock', 'diagonal', 'blinds', 'pixelate'];

const Model = {
  newProject(name = 'Untitled Project') {
    return {
      version: 2, name, width: 1920, height: 1080, fps: 30, background: '#000000',
      tracks: [Model.newTrack('video', 'V1'), Model.newTrack('audio', 'A1')], markers: [], inPoint: null, outPoint: null, createdAt: Date.now(),
    };
  },
  newTrack(kind, name) {
    return { id: U.uid('t'), kind, name: name || '', clips: [], muted: false, solo: false, locked: false, hidden: false, volume: 1, pan: 0, height: kind === 'audio' ? 64 : 64, color: null };
  },
  newClip(kind, over = {}) {
    const base = {
      id: U.uid('c'), kind, mediaId: null, name: kind, label: 'none', start: 0, duration: 5, offset: 0, sourceDuration: 5,
      speed: 1, enabled: true, linkId: null, fit: 'contain',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0, opacity: 1, uniform: true },
      crop: { l: 0, t: 0, r: 0, b: 0 }, cornerRadius: 0, blend: 'normal',
      effects: [], keyframes: {},
      transitionIn: { type: 'none', duration: .5 }, transitionOut: { type: 'none', duration: .5 },
      audio: { volume: 1, pan: 0, muted: false, fadeIn: 0, fadeOut: 0, eqLow: 0, eqMid: 0, eqHigh: 0, highpass: 0, lowpass: 20000, normalize: 1, pitch: 0 },
      motion: { preset: 'none' },
    };
    if (kind === 'text') base.text = Model.defaultText();
    if (kind === 'shape') base.shape = { type: 'rect', fill: '#6c8cff', stroke: '#ffffff', strokeWidth: 0, width: 600, height: 340, radius: 24, gradient: false, fill2: '#b58cff', gradAngle: 45, points: 5 };
    if (kind === 'sticker') base.sticker = { id: 'star', color: '#ffcf4a', text: '' };
    if (kind === 'solid') base.solid = { color: '#1d1640', gradient: false, color2: '#6c8cff', angle: 45 };
    return Object.assign(base, over);
  },
  defaultText() {
    return {
      content: 'Your Text Here', font: 'Montserrat', weight: '700', italic: false, size: 96, color: '#ffffff', align: 'center', vAlign: 'middle',
      lineHeight: 1.2, letterSpacing: 0, transform: 'none', boxWidth: 0,
      strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0, shadowX: 4, shadowY: 4, shadowOpacity: .8,
      bgColor: '#000000', bgOpacity: 0, bgPadding: 24, bgRadius: 16,
      gradient: false, color2: '#6c8cff', gradAngle: 0,
      animation: 'none', animDuration: .8, animOut: 'none', animOutDuration: .5,
    };
  },
  newEffect(type) {
    const def = EFFECT_DEFS[type]; if (!def) return null;
    const params = {}; for (const [k, p] of Object.entries(def.params)) params[k] = p.def;
    if (def.colorParams) Object.assign(params, def.colorParams);
    return { id: U.uid('fx'), type, enabled: true, params, lut: null };
  },
  newMarker(time, name = '', color = 'blue') { return { id: U.uid('mk'), time, name, color, duration: 0 }; },
  /* migrate/normalize a loaded clip so missing fields get defaults */
  normalizeClip(c) {
    const d = Model.newClip(c.kind || 'video');
    const merge = (a, b) => { for (const k in b) if (a[k] === undefined) a[k] = b[k]; else if (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && typeof b[k] === 'object' && !Array.isArray(b[k])) merge(a[k], b[k]); return a; };
    merge(c, d); return c;
  },
  normalizeProject(p) {
    const d = Model.newProject(); for (const k in d) if (p[k] === undefined) p[k] = d[k];
    if (!p.tracks.some(t => t.kind === 'video')) p.tracks.unshift(Model.newTrack('video', 'V1'));
    if (!p.tracks.some(t => t.kind === 'audio')) p.tracks.push(Model.newTrack('audio', 'A1'));
    p.tracks.forEach(t => { const dt = Model.newTrack(t.kind); for (const k in dt) if (t[k] === undefined) t[k] = dt[k]; t.clips.forEach(Model.normalizeClip); });
    return p;
  },
};

/* ============================================================
   APP STATE
============================================================ */
const state = {
  project: Model.newProject(),
  media: [],                       // {id,name,type,url,file,duration,width,height,el,audioBuffer,peaks,thumb,size}
  selection: new Set(),            // clip ids
  selectedTrackId: null,
  selectedEffectId: null,
  playing: false, currentTime: 0, duration: 0, loop: false, playRate: 1,
  pxPerSec: 60, scrollX: 0, trackHeightScale: 1,
  snap: true, ripple: false, tool: 'select', // select | razor | hand
  masterVolume: 1, muted: false,
  clipboard: null,
  previewZoom: 'fit', showSafeAreas: false, showGrid: false, previewQuality: 1,
  dirty: false,
  autosave: true,
  activeInspectorTab: 'video',
  lutCache: {},
};

/* ============================================================
   HISTORY (undo / redo) — snapshot based
============================================================ */
const History = (() => {
  const undo = [], redo = []; const MAX = 200; let pending = null;
  const snap = () => ({ project: JSON.stringify(state.project, (key, value) => { if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Project values must be finite'); return value; }), sel: [...state.selection] });
  const restore = (s) => {
    state.project = JSON.parse(s.project); state.selection = new Set(s.sel.filter(id => findClip(id)));
    Events.emit('project:changed'); Events.emit('selection:changed');
  };
  return {
    begin(label = '') { pending = { ...snap(), label }; },
    commit(label) {
      if (!pending) pending = { ...snap(), label };
      const cur = snap();
      if (cur.project === pending.project) { pending = null; return; }
      undo.push(pending); if (undo.length > MAX) undo.shift(); redo.length = 0; pending = null;
      state.dirty = true; Events.emit('history:changed');
    },
    push(label) { this.begin(label); }, // alias: call before mutation, then commit()
    cancel() { pending = null; },
    abort() { const previous = pending; pending = null; if (previous) restore(previous); },
    undo() { if (!undo.length) return; redo.push(snap()); restore(undo.pop()); Events.emit('history:changed'); state.dirty = true; },
    redo() { if (!redo.length) return; undo.push(snap()); restore(redo.pop()); Events.emit('history:changed'); state.dirty = true; },
    canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
    clear() { undo.length = 0; redo.length = 0; pending = null; Events.emit('history:changed'); },
  };
})();

/* mutate helper: wraps a mutation into a single undoable step and refreshes UI */
function mutate(label, fn) {
  History.begin(label);
  try { const r = fn(); History.commit(label); Events.emit('project:changed'); return r; }
  catch (error) { History.abort(); throw error; }
}

/* ============================================================
   QUERIES
============================================================ */
function findClip(id) { for (const t of state.project.tracks) { const c = t.clips.find(x => x.id === id); if (c) return c; } return null; }
function findTrackOfClip(id) { return state.project.tracks.find(t => t.clips.some(c => c.id === id)) || null; }
function findTrack(id) { return state.project.tracks.find(t => t.id === id) || null; }
function findMedia(id) { return state.media.find(m => m.id === id) || null; }
function allClips() { return state.project.tracks.flatMap(t => t.clips); }
function selectedClips() { return [...state.selection].map(findClip).filter(Boolean); }
function primaryClip() { const s = selectedClips(); return s.length ? s[s.length - 1] : null; }
function clipEnd(c) { return c.start + c.duration; }
function videoTracks() { return state.project.tracks.filter(t => t.kind === 'video'); }
function audioTracks() { return state.project.tracks.filter(t => t.kind === 'audio'); }
/* display order: video tracks top->bottom = highest index first, then audio */
function displayTracks() { return [...videoTracks().slice().reverse(), ...audioTracks()]; }
function isVisualKind(k) { return VISUAL_KINDS.includes(k); }
/* clips whose source has no fixed length (can be trimmed out indefinitely) */
const UNBOUNDED_KINDS = ['image', 'text', 'shape', 'sticker', 'solid', 'adjustment'];
function isUnbounded(c) { return UNBOUNDED_KINDS.includes(c.kind); }
function clipsAt(t, track) { return (track ? track.clips : allClips()).filter(c => t >= c.start && t < clipEnd(c)); }
function recalcDuration() {
  let max = 0; allClips().forEach(c => { max = Math.max(max, clipEnd(c)); });
  state.duration = max; if (state.currentTime > max) state.currentTime = max;
}
function mediaUsedBy(mediaId) { return allClips().filter(c => c.mediaId === mediaId); }

/* ============================================================
   KEYFRAMES — keyframes[path] = [{t, v, ease}] with t relative to clip start (seconds)
============================================================ */
const KF = {
  KEYABLE: ['transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotation', 'transform.opacity', 'transform.anchorX', 'transform.anchorY', 'audio.volume', 'audio.pan', 'crop.l', 'crop.t', 'crop.r', 'crop.b', 'cornerRadius', 'text.size', 'text.letterSpacing', 'shape.width', 'shape.height'],
  has(clip, path) { return !!(clip.keyframes && clip.keyframes[path] && clip.keyframes[path].length); },
  get(clip, path) { return (clip.keyframes && clip.keyframes[path]) || []; },
  /* evaluate a property at local time lt (seconds from clip start) */
  value(clip, path, lt) {
    const kfs = KF.get(clip, path);
    if (!kfs.length) return U.getPath(clip, path);
    if (lt <= kfs[0].t) return kfs[0].v;
    if (lt >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (lt >= a.t && lt <= b.t) {
        const span = b.t - a.t || 1e-6; const p = U.ease(a.ease || 'linear', (lt - a.t) / span);
        return a.v + (b.v - a.v) * p;
      }
    }
    return kfs[kfs.length - 1].v;
  },
  set(clip, path, lt, v, ease = 'linear') {
    if (!clip.keyframes) clip.keyframes = {};
    if (!clip.keyframes[path]) clip.keyframes[path] = [];
    const arr = clip.keyframes[path]; lt = U.round(lt, 4);
    const ex = arr.find(k => Math.abs(k.t - lt) < 1e-3);
    if (ex) ex.v = v; else { arr.push({ t: lt, v, ease }); arr.sort((a, b) => a.t - b.t); }
  },
  remove(clip, path, lt) { const arr = KF.get(clip, path); const i = arr.findIndex(k => Math.abs(k.t - lt) < 1e-3); if (i >= 0) arr.splice(i, 1); if (!arr.length && clip.keyframes) delete clip.keyframes[path]; },
  at(clip, path, lt) { return KF.get(clip, path).find(k => Math.abs(k.t - lt) < 1e-3) || null; },
  clear(clip, path) { if (clip.keyframes) delete clip.keyframes[path]; },
  /* all keyframe times of a clip (for timeline lane) */
  allTimes(clip) { const s = new Set(); Object.values(clip.keyframes || {}).forEach(arr => arr.forEach(k => s.add(k.t))); return [...s].sort((a, b) => a - b); },
  /* effect param path helper */
  fxPath(fx, param) { return `fx.${fx.id}.${param}`; },
  fxValue(clip, fx, param, lt) {
    const path = KF.fxPath(fx, param);
    if (KF.has(clip, path)) return KF.value(clip, path, lt);
    return fx.params[param];
  },
  /* shift keyframes when clip is trimmed from the left */
  shift(clip, dt) { Object.values(clip.keyframes || {}).forEach(arr => arr.forEach(k => k.t += dt)); },
  scale(clip, factor) { Object.values(clip.keyframes || {}).forEach(arr => arr.forEach(k => k.t *= factor)); },
};

/* evaluated (animated) snapshot of a clip at project time t */
function evalClip(clip, t) {
  const lt = t - clip.start;
  const tr = clip.transform;
  const g = (p, base) => KF.has(clip, p) ? KF.value(clip, p, lt) : base;
  return {
    x: g('transform.x', tr.x), y: g('transform.y', tr.y),
    scaleX: g('transform.scaleX', tr.scaleX), scaleY: tr.uniform ? g('transform.scaleX', tr.scaleX) : g('transform.scaleY', tr.scaleY),
    rotation: g('transform.rotation', tr.rotation), opacity: g('transform.opacity', tr.opacity),
    anchorX: g('transform.anchorX', tr.anchorX), anchorY: g('transform.anchorY', tr.anchorY),
    crop: { l: g('crop.l', clip.crop.l), t: g('crop.t', clip.crop.t), r: g('crop.r', clip.crop.r), b: g('crop.b', clip.crop.b) },
    cornerRadius: g('cornerRadius', clip.cornerRadius || 0),
    volume: g('audio.volume', clip.audio.volume), pan: g('audio.pan', clip.audio.pan),
    textSize: clip.text ? g('text.size', clip.text.size) : 0, letterSpacing: clip.text ? g('text.letterSpacing', clip.text.letterSpacing) : 0,
    shapeW: clip.shape ? g('shape.width', clip.shape.width) : 0, shapeH: clip.shape ? g('shape.height', clip.shape.height) : 0,
    lt,
  };
}
