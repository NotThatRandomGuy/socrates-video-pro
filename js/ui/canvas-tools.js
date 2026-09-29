/* Non-destructive output framing. Clip coordinates stay in the original composition. */
'use strict';
const CanvasTools = (() => {
  async function open() {
    Player.pause();
    const p = state.project, W = p.canvasCrop?.sourceWidth || p.width, H = p.canvasCrop?.sourceHeight || p.height;
    let rect = { x: p.canvasCrop?.x || 0, y: p.canvasCrop?.y || 0, width: p.width, height: p.height };
    const cv = U.el('canvas', { id: 'cropPreview', class: 'crop-preview', 'aria-label': 'Crop preview: drag inside to move; drag corners to resize; drag outside to draw a new crop' });
    const s = Math.min(720 / W, 350 / H); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
    const frame = document.createElement('canvas'); frame.width = cv.width; frame.height = cv.height;
    const ctx = frame.getContext('2d'); ctx.scale(cv.width / W, cv.height / H);
    Compositor.renderFrame(ctx, state.currentTime, { uncropped: true });
    const ratio = U.el('select', { id: 'cropRatio', 'aria-label': 'Crop aspect ratio' }, [['free', 'Freeform'], ['1.7777777778', '16:9 · Landscape'], ['0.5625', '9:16 · Portrait'], ['1', '1:1 · Square'], ['1.3333333333', '4:3 · Classic'], ['2.3333333333', '21:9 · Cinema']].map(([v, l]) => U.el('option', { value: v }, l)));
    const fields = {}, hint = U.el('p', { class: 'crop-hint', role: 'status' });
    const fieldRow = U.el('div', { class: 'crop-fields' });
    for (const [key, label] of [['x', 'Left'], ['y', 'Top'], ['width', 'Width'], ['height', 'Height']]) {
      const input = fields[key] = U.el('input', { id: 'crop-' + key, type: 'number', min: key === 'width' || key === 'height' ? 2 : 0, step: 1, value: rect[key], 'aria-label': label + ' in pixels' });
      fieldRow.append(U.el('label', {}, label + ' (px)', input));
      input.onchange = () => {
        const value = Number(input.value); if (!input.value || !Number.isFinite(value)) { sync(); return; }
        rect[key] = Math.round(value);
        if (ratio.value !== 'free') { const r = +ratio.value; if (key === 'width') rect.height = Math.round(rect.width / r); if (key === 'height') rect.width = Math.round(rect.height * r); }
        constrain(); sync();
      };
    }
    function constrain() {
      if (ratio.value !== 'free') {
        const factor = Math.min(1, W / Math.max(2, rect.width), H / Math.max(2, rect.height));
        rect.width *= factor; rect.height *= factor;
      }
      rect.width = U.clamp(Math.round(rect.width), 2, W); rect.height = U.clamp(Math.round(rect.height), 2, H);
      rect.x = U.clamp(Math.round(rect.x), 0, W - rect.width); rect.y = U.clamp(Math.round(rect.y), 0, H - rect.height);
    }
    function sync() {
      for (const k of Object.keys(fields)) fields[k].value = rect[k];
      hint.textContent = `${rect.width} × ${rect.height} output · ${Math.round(rect.width * rect.height / (W * H) * 100)}% of original canvas`;
      const c = cv.getContext('2d'), sx = cv.width / W, sy = cv.height / H;
      c.clearRect(0, 0, cv.width, cv.height); c.drawImage(frame, 0, 0);
      c.save(); c.scale(sx, sy); c.fillStyle = 'rgba(5,9,18,.65)';
      c.beginPath(); c.rect(0, 0, W, H); c.rect(rect.x, rect.y, rect.width, rect.height); c.fill('evenodd');
      c.strokeStyle = '#43e3bf'; c.lineWidth = 2 / sx; c.strokeRect(rect.x, rect.y, rect.width, rect.height);
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1 / sx;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(rect.x + rect.width * i / 3, rect.y); c.lineTo(rect.x + rect.width * i / 3, rect.y + rect.height); c.moveTo(rect.x, rect.y + rect.height * i / 3); c.lineTo(rect.x + rect.width, rect.y + rect.height * i / 3); c.stroke(); }
      c.fillStyle = '#fff'; for (const [x, y] of corners()) c.fillRect(x - 5 / sx, y - 5 / sy, 10 / sx, 10 / sy);
      c.restore();
    }
    function corners() { return [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]; }
    function point(e) { const b = cv.getBoundingClientRect(); return [U.clamp((e.clientX - b.left) / b.width * W, 0, W), U.clamp((e.clientY - b.top) / b.height * H, 0, H)]; }
    let drag = null;
    cv.onpointerdown = e => {
      if (e.button !== 0) return; e.preventDefault(); const [x, y] = point(e);
      const hit = corners().findIndex(([cx, cy]) => Math.hypot((cx - x) * s, (cy - y) * s) < 14);
      const inside = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
      const anchor = hit >= 0 ? corners()[3 - hit] : [x, y];
      drag = { x, y, rect: { ...rect }, mode: hit >= 0 ? 'resize' : inside ? 'move' : 'draw', anchor };
      cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = e => {
      if (!drag) return; const [x, y] = point(e);
      if (drag.mode === 'move') { rect.x = drag.rect.x + x - drag.x; rect.y = drag.rect.y + y - drag.y; }
      else {
        const [ax, ay] = drag.anchor, dx = x - ax, dy = y - ay;
        let w = Math.abs(dx), h = Math.abs(dy);
        if (ratio.value !== 'free') {
          const r = +ratio.value; h = w / r;
          const maxW = dx < 0 ? ax : W - ax, maxH = dy < 0 ? ay : H - ay;
          const factor = Math.min(1, maxW / (w || 1), maxH / (h || 1)); w *= factor; h *= factor;
        }
        rect = { x: dx < 0 ? ax - w : ax, y: dy < 0 ? ay - h : ay, width: w, height: h };
      }
      constrain(); sync();
    };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; };
    ratio.onchange = () => {
      if (ratio.value === 'free') return;
      const r = +ratio.value, cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      let w = rect.width, h = w / r; if (h > H) { h = H; w = h * r; }
      rect = { x: cx - w / 2, y: cy - h / 2, width: w, height: h }; constrain(); sync();
    };
    const reset = U.el('button', { onclick: () => { rect = { x: 0, y: 0, width: W, height: H }; ratio.value = 'free'; sync(); } }, 'Full canvas');
    const body = U.el('div', { class: 'crop-editor' }, U.el('p', { class: 'meta' }, 'Drag corners to crop, or drag inside the frame to reposition. Your clips and keyframes keep their original size. You can restore the full canvas at any time.'), U.el('div', { class: 'crop-options' }, ratio, reset), cv, fieldRow, hint);
    sync();
    const result = await UI.modal('Crop canvas', body, [{ label: 'Cancel' }, { label: 'Restore original', value: 'reset' }, { label: 'Apply crop', primary: true }], { width: 780 });
    if (result === 'reset') Cmd.resetCanvasCrop(); else if (result === true) { constrain(); Cmd.cropCanvas(rect); }
  }
  return { open };
})();
