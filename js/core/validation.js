'use strict';
// Validate a copy before touching the live project or its undo history.
const ProjectValidation = (() => {
  function validate(data) {
    let nodes = 0;
    function walk(value, depth = 0) {
      if (++nodes > 500000 || depth > 24) throw Error('Project is too complex to open safely');
      if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Project contains an invalid number');
      if (['function', 'symbol', 'bigint', 'undefined'].includes(typeof value)) throw Error('Project contains unsupported data');
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Project contains an unsafe property');
        walk(child, depth + 1);
      }
    }
    walk(data);
    if (!data || !data.project || typeof data.project !== 'object' || Array.isArray(data.project)) throw Error('Not a valid project file');
    const copy = U.deepClone(data), p = copy.project;
    if (p.tracks !== undefined && !Array.isArray(p.tracks)) throw Error('Invalid project tracks');
    for (const t of p.tracks || []) if (!t || !['video','audio'].includes(t.kind) || !Array.isArray(t.clips)) throw Error('Invalid track');
    Model.normalizeProject(p);
    const number = (v, min, max, name) => { if (!Number.isFinite(v) || v < min || v > max) throw Error('Invalid ' + name); };
    number(p.width, 2, 8192, 'canvas width'); number(p.height, 2, 8192, 'canvas height'); number(p.fps, 1, 120, 'frame rate');
    if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || !Number.isInteger(p.fps)) throw Error('Canvas dimensions and frame rate must be whole numbers');
    if (typeof p.name !== 'string' || typeof p.background !== 'string' || !Array.isArray(p.markers)) throw Error('Invalid project properties');
    if (p.canvasCrop) {
      const c = p.canvasCrop; number(c.sourceWidth, p.width, 8192, 'original width'); number(c.sourceHeight, p.height, 8192, 'original height');
      number(c.x, 0, c.sourceWidth - p.width, 'crop position'); number(c.y, 0, c.sourceHeight - p.height, 'crop position');
    }
    const ids = new Set();
    function identity(id) { if (typeof id !== 'string' || !id || ids.has(id)) throw Error('Duplicate or invalid project identifier'); ids.add(id); }
    function shape(value, defaults, label) {
      for (const [key, def] of Object.entries(defaults)) {
        const v = value?.[key]; if (def === null) continue;
        if (Array.isArray(def)) { if (!Array.isArray(v)) throw Error('Invalid ' + label + '.' + key); }
        else if (typeof def === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid ' + label + '.' + key); shape(v, def, label + '.' + key); }
        else if (typeof def !== typeof v) throw Error('Invalid ' + label + '.' + key);
      }
    }
    for (const t of p.tracks) {
      identity(t.id); shape(t, Model.newTrack(t.kind), 'track'); number(t.volume, 0, 10, 'track volume'); number(t.pan, -1, 1, 'track pan'); number(t.height, 20, 1000, 'track height');
      for (const c of t.clips) {
        identity(c.id); if (!CLIP_KINDS.includes(c.kind) || (t.kind === 'audio') !== (c.kind === 'audio')) throw Error('Clip is on an incompatible track');
        shape(c, Model.newClip(c.kind), 'clip');
        number(c.start, 0, 864000, 'clip start'); number(c.duration, 1 / 1000, 864000, 'clip duration'); number(c.speed, .05, 16, 'speed'); number(c.offset, 0, 864000, 'source offset'); number(c.sourceDuration, 0, 864000, 'source duration');
        for (const fx of c.effects) { if (!fx || !EFFECT_DEFS[fx.type]) throw Error('Unknown effect'); shape(fx, Model.newEffect(fx.type), 'effect'); }
        for (const [path, keys] of Object.entries(c.keyframes)) {
          if (!KF.KEYABLE.includes(path) && !/^fx\.[\w-]+\.[\w]+$/.test(path)) throw Error('Invalid animated property');
          if (!Array.isArray(keys)) throw Error('Invalid keyframes');
          for (const k of keys) { number(k.t, -864000, 864000, 'keyframe time'); number(k.v, -1e9, 1e9, 'keyframe value'); }
          keys.sort((a, b) => a.t - b.t);
        }
      }
    }
    for (const m of p.markers) { identity(m.id); number(m.time, 0, 864000, 'marker time'); if (typeof m.name !== 'string') throw Error('Invalid marker'); }
    for (const edge of ['inPoint', 'outPoint']) if (p[edge] !== null) number(p[edge], 0, 864000, edge);
    if (p.inPoint !== null && p.outPoint !== null && p.outPoint <= p.inPoint) throw Error('Out point must follow In point');
    if (copy.media !== undefined && !Array.isArray(copy.media)) throw Error('Invalid media list');
    for (const m of copy.media || []) if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !['video','audio','image'].includes(m.type)) throw Error('Invalid media reference');
    return copy;
  }
  return { validate };
})();
