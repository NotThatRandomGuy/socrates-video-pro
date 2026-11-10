'use strict';
const Recorder = (() => {
  let recording = false;
  async function record(stream, { name, kind, live = false, cleanup = () => {} }) {
    if (recording) { stream.getTracks().forEach(t => t.stop()); cleanup(); return UI.toast('A recording is already in progress'); }
    recording = true;
    const modal = new AbortController(), insertAt = state.currentTime;
    let rec, interval, stopMeter, playbackStarted = false;
    try {
      const types = kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = types.find(m => MediaRecorder.isTypeSupported(m));
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
      const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      let recordingError;
      const stopped = new Promise(resolve => { rec.onstop = resolve; rec.onerror = e => { recordingError = e.error || Error('Recording failed'); resolve(); }; });
      const timer = U.el('div', { class: 'rec-timer' }, '00:00');
      const preview = live ? U.el('video', { autoplay: true, muted: true, playsinline: true, class: 'rec-preview' }) : null;
      if (preview) { preview.muted = true; preview.srcObject = stream; }
      const playAlong = U.el('input', { type: 'checkbox', checked: kind === 'audio' });
      playAlong.onchange = () => { if (playAlong.checked) { Player.play(); playbackStarted = true; } else { Player.pause(); playbackStarted = false; } };
      if (stream.getAudioTracks().length) await AudioEngine.ready();
      const meter = kind === 'audio' ? U.el('div', { class: 'rec-meter' }, U.el('div', { class: 'rec-meter-fill' })) : null;
      if (meter) {
        const source = AudioEngine.ctx().createMediaStreamSource(stream), analyser = AudioEngine.ctx().createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
        const samples = new Float32Array(512); let raf;
        const draw = () => { analyser.getFloatTimeDomainData(samples); let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v)); meter.firstChild.style.width = Math.min(100, peak * 140) + '%'; raf = requestAnimationFrame(draw); }; draw();
        stopMeter = () => { cancelAnimationFrame(raf); source.disconnect(); analyser.disconnect(); };
      }
      const started = performance.now();
      interval = setInterval(() => timer.textContent = U.fmtDur((performance.now() - started) / 1000), 250);
      const body = U.el('div', { style: { textAlign: 'center' } }, preview, U.el('div', { class: 'rec-dot' }), timer, meter, kind === 'audio' ? U.el('label', {}, playAlong, ' Play timeline while recording') : null);
      rec.start(250);
      if (kind === 'audio') { Player.play(); playbackStarted = true; }
      stream.getTracks().forEach(track => track.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); }, { once: true }));
      await Promise.race([UI.modal(name, body, [{ label: '■ Stop recording', primary: true }], { signal: modal.signal }), stopped]);
      if (rec.state !== 'inactive') rec.stop(); await stopped;
      if (recordingError) throw recordingError;
      const duration = (performance.now() - started) / 1000;
      modal.abort(); clearInterval(interval); stopMeter?.(); stopMeter = null; stream.getTracks().forEach(t => t.stop()); cleanup(); cleanup = () => {};
      if (playbackStarted) { Player.pause(); playbackStarted = false; }
      if (!chunks.length) return UI.toast('Nothing recorded');
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' });
      const file = new File([blob], `${name.replace(/\W+/g, '_')}_${Date.now()}.webm`, { type: blob.type });
      const [media] = await Media.importFiles([file]); if (!media) return;
      await media.audioReady;
      if (!Number.isFinite(media.duration) || media.duration <= 0) media.duration = duration;
      await Cmd.addMedia(media.id, { start: insertAt }); UI.toast(`Recorded ${U.fmtDur(media.duration)}`);
      return media;
    } catch (e) { UI.toast('Recording failed: ' + e.message); }
    finally { if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch {} } clearInterval(interval); stopMeter?.(); stream.getTracks().forEach(t => t.stop()); cleanup(); modal.abort(); if (playbackStarted) Player.pause(); recording = false; }
  }
  function mixAudio(stream, mic) {
    const ac = AudioEngine.ctx(); const dest = ac.createMediaStreamDestination(), original = stream.getAudioTracks(), nodes = [];
    try {
      if (original.length) { const src = ac.createMediaStreamSource(new MediaStream(original)); nodes.push(src); src.connect(dest); }
      const src = ac.createMediaStreamSource(mic); nodes.push(src); src.connect(dest);
    } catch (error) {
      nodes.forEach(n => n.disconnect()); dest.stream.getTracks().forEach(t => t.stop());
      throw error;
    }
    original.forEach(t => stream.removeTrack(t)); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    return () => { nodes.forEach(n => n.disconnect()); [...original, ...mic.getTracks(), ...dest.stream.getTracks()].forEach(t => t.stop()); };
  }
  async function screen() {
    let stream, cleanup = () => {};
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true });
      if (await UI.confirm('Microphone', 'Also record your microphone?', 'Yes')) { let mic; try { await AudioEngine.ready(); mic = await navigator.mediaDevices.getUserMedia({ audio: true }); cleanup = mixAudio(stream, mic); } catch { mic?.getTracks().forEach(t => t.stop()); UI.toast('Microphone unavailable'); } }
      return await record(stream, { name: 'Screen recording', kind: 'video', live: true, cleanup });
    } catch { stream?.getTracks().forEach(t => t.stop()); cleanup(); UI.toast('Screen capture cancelled or unavailable'); }
  }
  async function webcam() { try { return await record(await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: true }), { name: 'Webcam recording', kind: 'video', live: true }); } catch { UI.toast('Camera unavailable'); } }
  async function voice() { try { return await record(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), { name: 'Voice-over', kind: 'audio' }); } catch { UI.toast('Microphone unavailable'); } }
  return { screen, webcam, voice, record, mixAudio };
})();
