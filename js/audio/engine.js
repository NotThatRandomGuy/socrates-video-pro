/* ============================================================
   AUDIO ENGINE — Web Audio scheduled playback + offline mixdown
============================================================ */
'use strict';

const AudioEngine = (() => {
  let actx = null, master = null, analyserL = null, analyserR = null, splitter = null, meterBuf = null;
  const trackNodes = new Map(); // trackId -> {gain, pan}
  const active = new Map();     // clipId -> {src, nodes:[], stopAt}
  const elementSources = new Map(); // clipId -> {el, srcNode}
  let playing = false, startCtx = 0, startProj = 0, rate = 1, tickTimer = null;
  const LOOKAHEAD = 1.2;

  function ctx() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      master = actx.createGain(); master.gain.value = state.masterVolume;
      splitter = actx.createChannelSplitter(2); analyserL = actx.createAnalyser(); analyserR = actx.createAnalyser(); analyserL.fftSize = analyserR.fftSize = 1024;
      master.connect(actx.destination); master.connect(splitter); splitter.connect(analyserL, 0); splitter.connect(analyserR, 1);
      meterBuf = new Float32Array(1024);
      actx.onstatechange = () => { if (playing && actx.state === 'running') { const t = now(); play(t, rate); } };
    }
    return actx;
  }
  function resume() { const c = ctx(); if (c.state === 'suspended') c.resume(); }
  async function ready() {
    const c = ctx(); await c.resume(); const initial = c.currentTime, deadline = performance.now() + 10000;
    // A newly opened audio device can resolve resume before its clock starts.
    while (c.currentTime <= initial) {
      if (performance.now() > deadline || c.state === 'closed') throw Error('Audio device did not start');
      await U.sleep(20);
    }
    return c;
  }

  /* ---- track mixing nodes ---- */
  function trackNode(track, c = ctx(), dest = master) {
    if (c !== actx) { const g = c.createGain(), p = c.createStereoPanner(); g.connect(p); p.connect(dest); g.gain.value = trackGainValue(track); p.pan.value = track.pan || 0; return { gain: g, pan: p }; }
    let n = trackNodes.get(track.id);
    if (!n) { const g = c.createGain(), p = c.createStereoPanner(); g.connect(p); p.connect(master); n = { gain: g, pan: p }; trackNodes.set(track.id, n); }
    n.gain.gain.value = trackGainValue(track); n.pan.pan.value = track.pan || 0;
    return n;
  }
  function trackGainValue(track) {
    const anySolo = audioTracks().some(t => t.solo);
    if (track.muted || (anySolo && !track.solo)) return 0;
    return track.volume ?? 1;
  }
  function updateMix() {
    if (!actx) return;
    master.gain.value = state.muted ? 0 : state.masterVolume;
    for (const t of audioTracks()) trackNode(t);
  }

  /* envelope curve for a clip: samples of gain over [from, to] local seconds */
  function envelope(clip, fromLt, toLt, n) {
    const arr = new Float32Array(Math.max(2, n)); const a = clip.audio;
    for (let i = 0; i < arr.length; i++) {
      const lt = fromLt + (toLt - fromLt) * i / (arr.length - 1);
      let g = a.muted ? 0 : (KF.has(clip, 'audio.volume') ? KF.value(clip, 'audio.volume', lt) : a.volume);
      if (a.fadeIn > 0 && lt < a.fadeIn) g *= U.clamp(lt / a.fadeIn, 0, 1);
      if (a.fadeOut > 0 && lt > clip.duration - a.fadeOut) g *= U.clamp((clip.duration - lt) / a.fadeOut, 0, 1);
      arr[i] = Math.max(0, g) * (a.normalize || 1);
    }
    return arr;
  }
  function buildChain(c, clip, track, dest, when, fromLt, durLocal, playbackRate = 1) {
    const a = clip.audio; const nodes = [];
    const gain = c.createGain(); nodes.push(gain);
    const env = envelope(clip, fromLt, fromLt + durLocal * playbackRate, Math.max(2, Math.ceil(durLocal * 25)));
    if (durLocal > 0.02) { try { gain.gain.setValueCurveAtTime(env, when, durLocal); } catch (e) { gain.gain.value = env[0]; } } else gain.gain.value = env[0];
    let last = gain;
    const connect = (n) => { last.connect(n); last = n; nodes.push(n); };
    if (a.eqLow) { const f = c.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = 200; f.gain.value = a.eqLow; connect(f); }
    if (a.eqMid) { const f = c.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 1200; f.Q.value = .8; f.gain.value = a.eqMid; connect(f); }
    if (a.eqHigh) { const f = c.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = 5000; f.gain.value = a.eqHigh; connect(f); }
    if (a.highpass > 0) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = a.highpass; connect(f); }
    if (a.lowpass > 0 && a.lowpass < 20000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = a.lowpass; connect(f); }
    const pan = c.createStereoPanner(); const pv = KF.has(clip, 'audio.pan') ? KF.value(clip, 'audio.pan', fromLt) : a.pan; pan.pan.value = U.clamp(pv, -1, 1); connect(pan);
    if (KF.has(clip, 'audio.pan')) { const pe = new Float32Array(Math.max(2, Math.ceil(durLocal * 25))); for (let i = 0; i < pe.length; i++) pe[i] = U.clamp(KF.value(clip, 'audio.pan', fromLt + durLocal * playbackRate * i / (pe.length - 1)), -1, 1); if (durLocal > .02) try { pan.pan.setValueCurveAtTime(pe, when, durLocal); } catch (e) { } }
    last.connect(dest);
    return { input: gain, nodes };
  }

  function audioClips() { const soloed = audioTracks().some(t => t.solo); return audioTracks().filter(t => !t.muted && !(soloed && !t.solo)).flatMap(t => t.clips.filter(c => c.enabled && c.kind === 'audio').map(c => ({ clip: c, track: t }))); }

  /* schedule a clip in context c, starting at project time projStart (may be inside clip) */
  function scheduleClip(c, clip, track, dest, projT0, ctxT0, r, isLive) {
    const m = findMedia(clip.mediaId); if (!m) return null;
    const startInClip = Math.max(0, projT0 - clip.start);       // local seconds already elapsed
    const when = ctxT0 + Math.max(0, clip.start - projT0) / r;
    const durLocal = clip.duration - startInClip; if (durLocal <= 0) return null;
    const tn = isLive ? trackNode(track) : trackNode(track, c, dest);
    const chain = buildChain(c, clip, track, tn.gain, when, startInClip, durLocal / r, r);
    if (m.audioBuffer) {
      const src = c.createBufferSource(); src.buffer = m.audioBuffer; src.playbackRate.value = clip.speed * r;
      src.connect(chain.input);
      const offset = clip.offset + startInClip * clip.speed;
      if (offset < m.audioBuffer.duration) { src.start(when, offset, Math.min(durLocal * clip.speed, m.audioBuffer.duration - offset)); }
      return { src, nodes: chain.nodes, stopAt: when + durLocal / r };
    }
    if (isLive && m.el && m.hasAudio) { // element fallback (live only)
      let es = elementSources.get(clip.id);
      if (!es) { const el = document.createElement(m.type === 'video' ? 'video' : 'audio'); el.src = m.url; el.preload = 'auto'; const srcNode = c.createMediaElementSource(el); es = { el, srcNode }; elementSources.set(clip.id, es); }
      es.srcNode.disconnect(); es.srcNode.connect(chain.input); es.el.playbackRate = U.clamp(clip.speed * r, .0625, 16);
      es.clip = clip; es.active = true;
      return { el: es.el, nodes: chain.nodes, stopAt: when + durLocal / r, element: true };
    }
    return null;
  }

  function tick() {
    if (!playing) return;
    const now = actx.currentTime; const projNow = startProj + (now - startCtx) * rate;
    for (const { clip, track } of audioClips()) {
      if (active.has(clip.id)) continue;
      if (clipEnd(clip) <= projNow) continue;
      if (clip.start > projNow + LOOKAHEAD * rate) continue;
      const a = scheduleClip(actx, clip, track, master, projNow, now, rate, true);
      if (a) active.set(clip.id, a);
    }
    for (const [id, a] of active) {
      if (a.element) {
        const es = elementSources.get(id); const clip = es.clip; const lt = projNow - clip.start;
        if (lt >= 0 && lt < clip.duration) { const want = clip.offset + lt * clip.speed; if (Math.abs(es.el.currentTime - want) > .25) es.el.currentTime = want; if (es.el.paused) es.el.play().catch(() => { }); }
        else if (!es.el.paused) es.el.pause();
      }
      if (now > a.stopAt + .1) { cleanup(id, a); active.delete(id); }
    }
  }
  function cleanup(id, a) { try { a.src && a.src.stop(); } catch (e) { } try { a.src && a.src.disconnect(); } catch (e) { } a.nodes.forEach(n => { try { n.disconnect(); } catch (e) { } }); if (a.element) { const es = elementSources.get(id); if (es) { es.el.pause(); es.active = false; } } }

  let startWall = 0;
  function play(t, r = 1) {
    resume(); stopAll();
    rate = r; playing = true; startProj = t; startCtx = actx.currentTime + .03; startWall = performance.now() + 30;
    updateMix(); tick(); tickTimer = setInterval(tick, 200);
  }
  function stopAll() { for (const [id, a] of active) cleanup(id, a); active.clear(); if (tickTimer) clearInterval(tickTimer); tickTimer = null; }
  function stop() { playing = false; stopAll(); }
  /* project time: audio clock when the context runs, wall clock otherwise (suspended/autoplay-blocked) */
  function now() { if (!playing) return state.currentTime; if (actx.state === 'running') return startProj + Math.max(0, actx.currentTime - startCtx) * rate; return startProj + Math.max(0, performance.now() - startWall) / 1000 * rate; }
  function isPlaying() { return playing; }
  /* re-schedule (e.g., after edits during playback) */
  function reschedule() { if (!playing) return; const t = now(); play(t, rate); }

  /* level meters: returns {l, r} peak 0..1 */
  function levels() {
    if (!actx || !playing) return { l: 0, r: 0 };
    const pk = (an) => { an.getFloatTimeDomainData(meterBuf); let m = 0; for (let i = 0; i < meterBuf.length; i++) { const v = Math.abs(meterBuf[i]); if (v > m) m = v; } return m; };
    return { l: pk(analyserL), r: pk(analyserR) };
  }

  /* offline mixdown of [from, to] → AudioBuffer (stereo) */
  async function renderOffline(from, to, sampleRate = 48000) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw Error('Choose a nonempty audio range');
    const dur = to - from;
    const oc = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
    const m = oc.createGain(); m.gain.value = state.muted ? 0 : state.masterVolume; m.connect(oc.destination);

    for (const { clip, track } of audioClips()) {
      if (clipEnd(clip) <= from || clip.start >= to) continue;
      if (clip.audio.muted || state.muted || state.masterVolume === 0 || track.volume === 0) continue;
      const media = findMedia(clip.mediaId);
      if (media?.audioReady) await media.audioReady;
      if (!media?.audioBuffer) throw Error('Audio unavailable for ' + clip.name + '. Relink the source before exporting audio.');
      scheduleClip(oc, clip, track, m, from, 0, 1, false);
    }
    return oc.startRendering();
  }

  /* preview a media item (media browser) */
  let previewSrc = null;
  function previewMedia(m) {
    stopPreview(); if (!m.audioBuffer) return; resume();
    previewSrc = actx.createBufferSource(); previewSrc.buffer = m.audioBuffer; previewSrc.connect(master); previewSrc.start(0, 0, Math.min(10, m.audioBuffer.duration)); const source = previewSrc; source.onended = () => { source.disconnect(); if (previewSrc === source) previewSrc = null; };
  }
  function stopPreview() { if (previewSrc) { try { previewSrc.stop(); } catch (e) { } previewSrc = null; } }

  /* MediaStream of the master mix (for MediaRecorder-based export) */
  let streamDest = null;
  function streamDestination() { ctx(); if (!streamDest) { streamDest = actx.createMediaStreamDestination(); master.connect(streamDest); } return streamDest; }

  /* analysis: peak of a clip's audio region -> suggest normalize gain */
  function peakOf(clip) { const m = findMedia(clip.mediaId); if (!m || !m.peaks) return 1; const p = m.peaks; const a = Math.floor(clip.offset * p.pps), b = Math.min(p.data.length, Math.ceil((clip.offset + clip.duration * clip.speed) * p.pps)); let mx = 0; for (let i = a; i < b; i++) if (p.data[i] > mx) mx = p.data[i]; return mx || 1; }

  function resetMedia() { stop(); stopPreview(); for (const es of elementSources.values()) { es.el.pause(); es.srcNode.disconnect(); es.el.removeAttribute('src'); es.el.load(); } elementSources.clear(); for (const n of trackNodes.values()) { n.gain.disconnect(); n.pan.disconnect(); } trackNodes.clear(); }
  return { ctx, resume, ready, play, stop, now, isPlaying, reschedule, updateMix, levels, renderOffline, previewMedia, stopPreview, peakOf, envelope, streamDestination, resetMedia };
})();
