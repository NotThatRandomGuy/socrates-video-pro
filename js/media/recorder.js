/* ============================================================
   RECORDER — screen capture, webcam, voice-over → media library
============================================================ */
'use strict';

const Recorder = (() => {
  async function record(stream, { name, kind, live = null }) {
    const mime = kind === 'audio' ? (['audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '') : (['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '');
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined); const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const t0 = performance.now(); const timer = U.el('div', { class: 'rec-timer' }, '00:00');
    const preview = live ? U.el('video', { autoplay: true, muted: true, playsinline: true, class: 'rec-preview' }) : null; if (preview) preview.srcObject = stream;
    const meter = kind === 'audio' ? U.el('div', { class: 'rec-meter' }, U.el('div', { class: 'rec-meter-fill' })) : null;
    let stopMeter = null;
    if (meter) { const ac = AudioEngine.ctx(); const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an); const buf = new Float32Array(512); let raf; const loop = () => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); meter.firstChild.style.width = Math.min(100, m * 140) + '%'; raf = requestAnimationFrame(loop); }; loop(); stopMeter = () => { cancelAnimationFrame(raf); src.disconnect(); }; }
    const iv = setInterval(() => timer.textContent = U.fmtDur((performance.now() - t0) / 1000), 250);
    const stopped = new Promise(r => rec.onstop = r);
    const playAlong = U.el('input', { type: 'checkbox', checked: kind === 'audio' }); const insertAt = state.currentTime;
    const body = U.el('div', { style: { textAlign: 'center' } }, preview, U.el('div', { class: 'rec-dot' }), timer, meter, kind === 'audio' ? U.el('label', { style: { display: 'block', marginTop: '8px' } }, playAlong, ' Play timeline while recording (voice-over)') : null);
    rec.start(500);
    if (kind === 'audio' && playAlong.checked) { Player.seek(insertAt); Player.play(1); }
    stream.getTracks().forEach(t => t.onended = () => { if (rec.state === 'recording') rec.stop(); });
    const modalP = UI.modal(name, body, [{ label: '■ Stop recording', primary: true }]);
    await Promise.race([modalP, stopped]);
    if (rec.state === 'recording') rec.stop(); await stopped; clearInterval(iv); stopMeter && stopMeter(); Player.pause();
    stream.getTracks().forEach(t => t.stop()); U.$('.modal-back')?.remove();
    if (!chunks.length) return UI.toast('Nothing recorded');
    const blob = new Blob(chunks, { type: mime || (kind === 'audio' ? 'audio/webm' : 'video/webm') });
    const file = new File([blob], `${name.replace(/\W+/g, '_')}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.webm`, { type: blob.type });
    const [m] = await Media.importFiles([file]); UI.toast(`Recorded ${U.fmtDur(m.duration || (performance.now() - t0) / 1000)}`);
    // webm from MediaRecorder often lacks duration metadata → probe via decoded audio or seek trick
    if (!m.duration || !isFinite(m.duration)) { await fixDuration(m); }
    if (kind === 'audio' || playAlong.checked) { await Cmd.addMedia(m.id, { start: insertAt, trackId: Cmd.ensureTrack('audio', audioTracks().length).id }); } else { await Cmd.addMedia(m.id, { start: insertAt }); }
    return m;
  }
  async function fixDuration(m) {
    if (m.audioReady) await m.audioReady; if (m.audioBuffer) { m.duration = m.audioBuffer.duration; }
    if ((!m.duration || !isFinite(m.duration)) && m.el) { await new Promise(r => { m.el.currentTime = 1e9; m.el.ontimeupdate = () => { m.el.ontimeupdate = null; m.duration = m.el.duration; m.el.currentTime = 0; r(); }; setTimeout(r, 3000); }); }
    Events.emit('media:changed');
  }
  async function screen() {
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true }); let mic = null; if (await UI.confirm('Microphone', 'Also record your microphone?', 'Yes')) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); mixAudio(stream, mic); } catch (e) { UI.toast('Microphone unavailable'); } } return record(stream, { name: 'Screen recording', kind: 'video', live: true }); } catch (e) { UI.toast('Screen capture cancelled or unavailable'); }
  }
  function mixAudio(stream, mic) { const ac = AudioEngine.ctx(); const dest = ac.createMediaStreamDestination(); if (stream.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest); ac.createMediaStreamSource(mic).connect(dest); stream.getAudioTracks().forEach(t => stream.removeTrack(t)); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
  async function webcam() {
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: true }); return record(stream, { name: 'Webcam recording', kind: 'video', live: true }); } catch (e) { UI.toast('Camera unavailable'); }
  }
  async function voice() {
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); return record(stream, { name: 'Voice-over', kind: 'audio' }); } catch (e) { UI.toast('Microphone unavailable'); }
  }
  return { screen, webcam, voice };
})();
