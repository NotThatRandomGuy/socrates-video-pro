/* ============================================================
   EXPORTER — frame-accurate WebCodecs render → MP4/WebM, WAV, fallback
============================================================ */
'use strict';

const Exporter = (() => {
  let cancelFlag = false;
  const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  const FORMATS = [
    { id: 'mp4-h264', label: 'MP4 (H.264 + AAC)', container: 'mp4', codecs: (w, h) => [avcCodec(w, h), 'avc1.640033', 'avc1.4d0033', 'avc1.42e033'], audio: 'aac', ext: 'mp4' },
    { id: 'webm-vp9', label: 'WebM (VP9 + Opus)', container: 'webm', codecs: () => ['vp09.00.51.08', 'vp09.00.40.08', 'vp09.00.10.08'], webmCodec: 'V_VP9', audio: 'opus', ext: 'webm' },
    { id: 'webm-av1', label: 'WebM (AV1 + Opus)', container: 'webm', codecs: () => ['av01.0.08M.08', 'av01.0.04M.08'], webmCodec: 'V_AV1', audio: 'opus', ext: 'webm' },
    { id: 'webm-vp8', label: 'WebM (VP8 + Opus)', container: 'webm', codecs: () => ['vp8'], webmCodec: 'V_VP8', audio: 'opus', ext: 'webm' },
    { id: 'mp4-hevc', label: 'MP4 (HEVC/H.265 + AAC)', container: 'mp4', codecs: () => ['hvc1.1.6.L153.B0', 'hvc1.1.6.L123.B0'], audio: 'aac', ext: 'mp4' },
  ];
  function avcCodec(w, h) { const mb = (w * h) / 256; const level = mb > 8192 * 4 ? '33' : mb > 8192 ? '32' : mb > 3600 ? '1f' : '1e'; return 'avc1.6400' + level; } // High profile, level by macroblocks
  const RES = [['project', 'Project size'], ['3840x2160', '4K UHD (3840×2160)'], ['2560x1440', '1440p (2560×1440)'], ['1920x1080', '1080p (1920×1080)'], ['1280x720', '720p (1280×720)'], ['854x480', '480p (854×480)'], ['1080x1920', 'Vertical 1080×1920'], ['1080x1080', 'Square 1080×1080']];
  const QUALITY = [['low', 'Low (fast, small)', 2.5], ['medium', 'Medium', 6], ['high', 'High', 12], ['ultra', 'Ultra', 24], ['custom', 'Custom…', 0]];

  async function pickCodec(fmt, w, h, fps, bitrate) {
    if (!hasWebCodecs()) return null;
    for (const codec of fmt.codecs(w, h)) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' }; if (fmt.container === 'mp4' && codec.startsWith('avc1')) cfg.avc = { format: 'avc' }; if (codec.startsWith('hvc1')) cfg.hevc = { format: 'hevc' };
      try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return cfg; } catch (e) { }
      // some browsers reject high bitrates for certain levels; try bitrateMode variable
    }
    return null;
  }
  async function pickAudioCodec(kind, sampleRate, channels, bitrate) {
    if (typeof AudioEncoder === 'undefined') return null;
    const tries = kind === 'aac' ? [{ codec: 'mp4a.40.2', aac: { format: 'aac' } }, { codec: 'opus' }] : [{ codec: 'opus' }];
    for (const t of tries) { const cfg = { ...t, sampleRate, numberOfChannels: channels, bitrate }; try { const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) return cfg; } catch (e) { } }
    return null;
  }

  /* ---------------- dialog ---------------- */
  async function dialog() {
    if (state.duration <= 0) return UI.toast('Nothing to export');
    const P = state.project; const fmtSel = U.el('select', {}, FORMATS.map(f => U.el('option', { value: f.id }, f.label)));
    const resSel = U.el('select', {}, RES.map(([v, l]) => U.el('option', { value: v }, v === 'project' ? `${l} (${P.width}×${P.height})` : l)));
    const fpsSel = U.el('select', {}, [['project', `Project (${P.fps})`], ['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60']].map(([v, l]) => U.el('option', { value: v }, l)));
    const qSel = U.el('select', {}, QUALITY.map(([v, l]) => U.el('option', { value: v, selected: v === 'high' }, l)));
    const custom = U.el('input', { type: 'number', value: 12, min: .5, max: 200, step: .5, class: 'num', style: { display: 'none' } }); qSel.onchange = () => custom.style.display = qSel.value === 'custom' ? '' : 'none';
    const audioChk = U.el('input', { type: 'checkbox', checked: true }); const aBr = U.el('select', {}, [96, 128, 192, 256, 320].map(b => U.el('option', { value: b, selected: b === 192 }, b + ' kbps')));
    const rangeSel = U.el('select', {}, [['all', 'Entire timeline'], ['inout', 'In → Out range']].map(([v, l]) => U.el('option', { value: v, disabled: v === 'inout' && (P.inPoint === null || P.outPoint === null) }, l)));
    const name = U.el('input', { type: 'text', value: P.name.replace(/[^\w\- ]+/g, '_'), style: { width: '100%' } });
    const engine = U.el('select', {}, [['webcodecs', 'Frame-accurate (WebCodecs)' + (hasWebCodecs() ? '' : ' — unavailable')], ['realtime', 'Real-time capture (MediaRecorder)']].map(([v, l]) => U.el('option', { value: v, disabled: v === 'webcodecs' && !hasWebCodecs() }, l)));
    if (!hasWebCodecs()) engine.value = 'realtime';
    const est = U.el('div', { class: 'meta' });
    const updEst = () => { const [w, h] = outSize(resSel.value); const dur = rangeSel.value === 'inout' ? P.outPoint - P.inPoint : state.duration; const mbps = qSel.value === 'custom' ? +custom.value : QUALITY.find(q => q[0] === qSel.value)[2]; const br = scaledBitrate(mbps, w, h); est.textContent = `Output ${w}×${h} · ${U.toTimecode(dur, P.fps)} · ~${U.fmtBytes((br + (audioChk.checked ? +aBr.value * 1000 : 0)) / 8 * dur)} estimated`; };
    [resSel, qSel, custom, audioChk, aBr, rangeSel].forEach(e => e.addEventListener('change', updEst)); updEst();
    const f = (l, e) => U.el('div', { class: 'field' }, U.el('label', {}, l), e);
    const body = U.el('div', {}, f('File name', name), U.el('div', { class: 'row2' }, f('Format', fmtSel), f('Resolution', resSel)), U.el('div', { class: 'row2' }, f('Frame rate', fpsSel), f('Quality', U.el('div', { class: 'row' }, qSel, custom))), U.el('div', { class: 'row2' }, f('Range', rangeSel), f('Engine', engine)), U.el('div', { class: 'field row' }, U.el('label', {}, 'Include audio'), audioChk, aBr), est);
    const ok = await UI.modal('Export Video', body, [{ label: 'Cancel' }, { label: 'Export', primary: true }], { width: 520 });
    if (!ok) return;
    const [w, h] = outSize(resSel.value); const fps = fpsSel.value === 'project' ? P.fps : +fpsSel.value;
    const mbps = qSel.value === 'custom' ? +custom.value : QUALITY.find(q => q[0] === qSel.value)[2];
    const opts = { format: FORMATS.find(x => x.id === fmtSel.value), width: w, height: h, fps, bitrate: scaledBitrate(mbps, w, h), audio: audioChk.checked, audioBitrate: +aBr.value * 1000, from: rangeSel.value === 'inout' ? P.inPoint : 0, to: rangeSel.value === 'inout' ? P.outPoint : state.duration, name: name.value || 'export' };
    if (engine.value === 'realtime') return exportRealtime(opts); return exportWebCodecs(opts);
  }
  function outSize(v) { const P = state.project; if (v === 'project') return [even(P.width), even(P.height)]; const [w, h] = v.split('x').map(Number); return [even(w), even(h)]; }
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  function scaledBitrate(mbps, w, h) { return Math.round(mbps * 1e6 * Math.min(2.5, (w * h) / (1920 * 1080))); }

  /* ---------------- progress UI ---------------- */
  function progressUI(total) {
    const bar = U.el('div', { class: 'progress' }, U.el('div', { class: 'progress-fill' })); const txt = U.el('div', { class: 'meta' }, 'Preparing…'); const thumb = U.el('canvas', { width: 320, height: 180, class: 'export-thumb' });
    const back = U.el('div', { class: 'modal-back' }, U.el('div', { class: 'modal', style: { width: '420px' } }, U.el('div', { class: 'modal-head' }, U.el('span', {}, 'Exporting…')), U.el('div', { class: 'modal-body', style: { textAlign: 'center' } }, thumb, bar, txt), U.el('div', { class: 'modal-foot' }, U.el('button', { class: 'danger', onclick: () => { cancelFlag = true; } }, 'Cancel'))));
    document.body.appendChild(back); const t0 = performance.now();
    return {
      set(i, label) { const p = total ? i / total : 0; bar.firstChild.style.width = (p * 100).toFixed(1) + '%'; const el = (performance.now() - t0) / 1000; const eta = p > .02 ? el / p - el : 0; txt.textContent = label || `Frame ${i} / ${total} · ${(p * 100).toFixed(0)}% · elapsed ${U.fmtDur(el)}${eta ? ' · remaining ~' + U.fmtDur(eta) : ''}`; },
      thumb(src) { try { thumb.getContext('2d').drawImage(src, 0, 0, 320, 180); } catch (e) { } },
      close() { back.remove(); },
    };
  }

  /* wait until all active video clips are seeked to the frame's time */
  async function seekAll(t) {
    const waits = [];
    for (const tr of videoTracks()) { if (tr.hidden) continue; for (const c of tr.clips) { if (c.kind !== 'video' || !c.enabled) continue; if (t < c.start - .01 || t >= clipEnd(c) + 1.5) continue; const el = Media.clipVideo(c); if (!el) continue; const want = Math.max(0, c.offset + (t - c.start) * c.speed); if (el.readyState < 1) waits.push(new Promise(r => { el.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 3000); })); if (Math.abs(el.currentTime - want) > .0005) { waits.push(new Promise(r => { const done = () => { el.removeEventListener('seeked', done); r(); }; el.addEventListener('seeked', done); setTimeout(done, 2500); el.currentTime = Math.min(want, (el.duration || want) - .0001); })); } } }
    if (waits.length) await Promise.all(waits);
  }

  /* ---------------- WebCodecs export ---------------- */
  async function exportWebCodecs(o) {
    cancelFlag = false; Player.pause(); AudioEngine.stopPreview();
    const P = state.project; const dur = o.to - o.from; const total = Math.ceil(dur * o.fps);
    const vcfg = await pickCodec(o.format, o.width, o.height, o.fps, o.bitrate);
    if (!vcfg) { UI.toast(`${o.format.label} not supported by this browser — falling back to VP9/WebM`); o.format = FORMATS[1]; const alt = await pickCodec(o.format, o.width, o.height, o.fps, o.bitrate); if (!alt) return exportRealtime(o); return exportWebCodecs(o); }
    const ui = progressUI(total);
    // audio prep
    let acfg = null, audioBuf = null;
    if (o.audio) { try { audioBuf = await AudioEngine.renderOffline(o.from, o.to, 48000); acfg = await pickAudioCodec(o.format.audio, 48000, 2, o.audioBitrate); } catch (e) { console.warn('audio render', e); } }
    const audioInfo = acfg ? { codec: acfg.codec.startsWith('mp4a') ? 'aac' : 'opus', sampleRate: 48000, channels: 2 } : null;
    const mux = o.format.container === 'mp4' ? new MP4Muxer({ width: o.width, height: o.height, fps: o.fps, audio: audioInfo }) : new WebMMuxer({ width: o.width, height: o.height, fps: o.fps, videoCodec: o.format.webmCodec, audio: audioInfo ? { codec: 'A_OPUS', sampleRate: 48000, channels: 2 } : null, duration: dur });
    let encErr = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => mux.addVideo(chunk, meta), error: (e) => { encErr = e; } });
    venc.configure(vcfg);
    // canvas at output resolution
    const cv = document.createElement('canvas'); cv.width = o.width; cv.height = o.height; const ctx = cv.getContext('2d', { willReadFrequently: false });
    const sx = o.width / P.width, sy = o.height / P.height; const s = Math.min(sx, sy); const ox = (o.width - P.width * s) / 2, oy = (o.height - P.height * s) / 2;
    const savedT = state.currentTime; const keyInt = Math.round(o.fps * 2);
    try {
      for (let i = 0; i < total; i++) {
        if (cancelFlag) throw new Error('cancelled'); if (encErr) throw encErr;
        const t = o.from + i / o.fps; state.currentTime = t;
        await seekAll(t);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.background; ctx.fillRect(0, 0, o.width, o.height); ctx.setTransform(s, 0, 0, s, ox, oy);
        Compositor.renderFrame(ctx, t);
        const frame = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / o.fps), duration: Math.round(1e6 / o.fps) });
        venc.encode(frame, { keyFrame: i % keyInt === 0 }); frame.close();
        while (venc.encodeQueueSize > 4) await U.sleep(2);
        if (i % 5 === 0) { ui.set(i); if (i % 15 === 0) ui.thumb(cv); await U.nextFrame(); }
      }
      ui.set(total, 'Finishing video…'); await venc.flush(); venc.close();
      if (acfg && audioBuf) {
        ui.set(total, 'Encoding audio…');
        const aenc = new AudioEncoder({ output: (chunk, meta) => mux.addAudio(chunk, meta), error: (e) => console.warn('aenc', e) }); aenc.configure(acfg);
        const frames = acfg.codec === 'opus' ? 960 : 1024; const L = audioBuf.getChannelData(0), R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L; const n = audioBuf.length;
        for (let p = 0; p < n; p += frames) {
          const len = Math.min(frames, n - p); const data = new Float32Array(frames * 2); data.set(L.subarray(p, p + len), 0); data.set(R.subarray(p, p + len), frames);
          const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round(p / 48000 * 1e6), data }); aenc.encode(ad); ad.close();
          if (aenc.encodeQueueSize > 20) await U.sleep(1);
        }
        await aenc.flush(); aenc.close();
      }
      ui.set(total, 'Writing file…'); await U.nextFrame();
      const blob = mux.finalize(); U.download(blob, `${o.name}.${o.format.ext}`);
      UI.toast(`Exported ${o.name}.${o.format.ext} (${U.fmtBytes(blob.size)})`, 5000);
    } catch (e) {
      if (e.message !== 'cancelled') { console.error(e); UI.alert('Export failed', U.esc(e.message || String(e))); } else UI.toast('Export cancelled');
      try { venc.close(); } catch (_) { }
    } finally { ui.close(); state.currentTime = savedT; Player.seek(savedT); }
  }

  /* ---------------- MediaRecorder fallback (real-time) ---------------- */
  async function exportRealtime(o) {
    cancelFlag = false; Player.pause(); const P = state.project; const dur = o.to - o.from;
    const cv = document.createElement('canvas'); cv.width = o.width; cv.height = o.height; const ctx = cv.getContext('2d'); const s = Math.min(o.width / P.width, o.height / P.height); const ox = (o.width - P.width * s) / 2, oy = (o.height - P.height * s) / 2;
    const stream = cv.captureStream(o.fps); const dest = AudioEngine.streamDestination(); if (o.audio) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.bitrate, audioBitsPerSecond: o.audioBitrate }); const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const ui = progressUI(Math.ceil(dur * o.fps)); const done = new Promise(r => rec.onstop = r);
    rec.start(250); Player.seek(o.from); Player.play(1);
    const t0 = performance.now(); let frames = 0;
    await new Promise(resolve => { const loop = () => { if (cancelFlag || !state.playing || state.currentTime >= o.to - .001) return resolve(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.background; ctx.fillRect(0, 0, o.width, o.height); ctx.setTransform(s, 0, 0, s, ox, oy); Compositor.renderFrame(ctx, state.currentTime); frames++; if (frames % 10 === 0) { ui.set(Math.round((state.currentTime - o.from) * o.fps)); ui.thumb(cv); } requestAnimationFrame(loop); }; loop(); });
    Player.pause(); rec.stop(); await done; ui.close();
    if (cancelFlag) return UI.toast('Export cancelled');
    const blob = new Blob(chunks, { type: 'video/webm' }); U.download(blob, `${o.name}.webm`); UI.toast(`Exported ${o.name}.webm (${U.fmtBytes(blob.size)})`);
  }

  /* ---------------- WAV ---------------- */
  async function exportWav() {
    if (state.duration <= 0) return UI.toast('Nothing to export'); const P = state.project;
    const from = P.inPoint !== null && P.outPoint !== null ? P.inPoint : 0, to = P.inPoint !== null && P.outPoint !== null ? P.outPoint : state.duration;
    UI.toast('Rendering audio…'); const buf = await AudioEngine.renderOffline(from, to, 48000);
    const n = buf.length, ch = 2; const out = new DataView(new ArrayBuffer(44 + n * ch * 2)); const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, 48000, true); out.setUint32(28, 48000 * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L; let o = 44; for (let i = 0; i < n; i++) { out.setInt16(o, U.clamp(L[i], -1, 1) * 32767, true); out.setInt16(o + 2, U.clamp(R[i], -1, 1) * 32767, true); o += 4; }
    U.download(new Blob([out], { type: 'audio/wav' }), `${P.name}.wav`); UI.toast('Audio exported');
  }

  return { dialog, exportWebCodecs, exportRealtime, exportWav, FORMATS };
})();
