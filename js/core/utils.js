/* ============================================================
   UTILITIES — math, ids, DOM, timecode, easing, color
============================================================ */
'use strict';

const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  round: (v, d = 2) => { const p = Math.pow(10, d); return Math.round(v * p) / p; },
  uid: (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4),
  deepClone: (o) => JSON.parse(JSON.stringify(o)),
  isNum: (v) => typeof v === 'number' && Number.isFinite(v),
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmtBytes: (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB',
  el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  },
  $: (sel, root = document) => root.querySelector(sel),
  $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  throttle(fn, ms) { let last = 0, t; return (...a) => { const now = performance.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(t); t = setTimeout(() => { last = performance.now(); fn(...a); }, ms - (now - last)); } }; },
  download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); },
  readFileText: (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }),
  readFileBuffer: (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }),
  pickFiles(accept, multiple = true) {
    return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res(Array.from(i.files)); i.oncancel = () => res([]); i.click(); });
  },
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  nextFrame: () => new Promise(r => requestAnimationFrame(r)),

  /* ---- timecode ---- */
  toTimecode(sec, fps = 30, showFrames = true) {
    if (!isFinite(sec)) sec = 0;
    const neg = sec < 0; sec = Math.abs(sec);
    const totalFrames = Math.round(sec * fps);
    const f = totalFrames % fps;
    const s = Math.floor(totalFrames / fps) % 60;
    const m = Math.floor(totalFrames / fps / 60) % 60;
    const h = Math.floor(totalFrames / fps / 3600);
    const p = n => String(n).padStart(2, '0');
    return (neg ? '-' : '') + (h ? p(h) + ':' : '') + p(m) + ':' + p(s) + (showFrames ? ':' + p(f) : '');
  },
  parseTimecode(str, fps = 30) {
    if (!str) return NaN;
    str = String(str).trim();
    if (/^[\d.]+s?$/.test(str)) return parseFloat(str);
    const parts = str.split(/[:;.]/).map(Number);
    if (parts.some(isNaN)) return NaN;
    let h = 0, m = 0, s = 0, f = 0;
    if (parts.length === 4) [h, m, s, f] = parts; else if (parts.length === 3) [m, s, f] = parts; else if (parts.length === 2) [s, f] = parts; else[f] = parts;
    return h * 3600 + m * 60 + s + f / fps;
  },
  snapToFrame: (t, fps) => Math.round(t * fps) / fps,
  fmtDur(sec) { if (!isFinite(sec)) return '--:--'; const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + String(s).padStart(2, '0'); },

  /* ---- color ---- */
  hexToRgb(hex) { hex = (hex || '#000000').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const n = parseInt(hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  rgbToHex: (r, g, b) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''),
  hexToRgba(hex, a = 1) { const [r, g, b] = U.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; },

  /* ---- easing ---- */
  ease(type, t) {
    t = U.clamp(t, 0, 1);
    switch (type) {
      case 'hold': return 0;
      case 'ease-in': return t * t * t;
      case 'ease-out': return 1 - Math.pow(1 - t, 3);
      case 'ease-in-out': return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      case 'ease-out-back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
      case 'bounce': { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375; return n1 * (t -= 2.625 / d1) * t + .984375; }
      case 'elastic': { if (t === 0 || t === 1) return t; const c4 = (2 * Math.PI) / 3; return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * c4) + 1; }
      case 'smooth': return t * t * (3 - 2 * t);
      default: return t;
    }
  },
  EASINGS: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'smooth', 'ease-out-back', 'bounce', 'elastic', 'hold'],

  getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); },
  setPath(obj, path, val) { const ks = path.split('.'); if (ks.some(k => ['__proto__', 'prototype', 'constructor'].includes(k)) || (typeof val === 'number' && !Number.isFinite(val))) throw new Error('Invalid property value'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = val; },

  /* ---- geometry ---- */
  rotatePoint(x, y, cx, cy, deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; },
  fit(sw, sh, dw, dh, mode = 'contain') {
    if (!sw || !sh) return { w: dw, h: dh };
    if (mode === 'stretch') return { w: dw, h: dh };
    if (mode === 'none') return { w: sw, h: sh };
    const s = mode === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
    return { w: sw * s, h: sh * s };
  },
};
