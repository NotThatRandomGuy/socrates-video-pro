// Verifies the app works when index.html is opened directly from disk (file://): media import, GPU effects on video, export.
import { launch } from './harness.mjs';
const { check, results, errors, done } = await launch({ fileProtocol: true });
await check('booted over file://', `location.protocol === 'file:' && !document.body.classList.contains('booting')`);
await check('secure context (recording APIs)', `window.isSecureContext === true`);
await check('import + GLFX on video + export', `(async () => {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const ctx = cv.getContext('2d');
  const ac = AudioEngine.ctx(); await AudioEngine.ready(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination(); osc.connect(dest); osc.start();
  const stream = cv.captureStream(0); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
  let f = 0; const iv = setInterval(() => { ctx.fillStyle = 'rgb(0,200,0)'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#fff'; ctx.fillRect(100 + f, 60, 60, 60); f++; stream.getVideoTracks()[0].requestFrame(); }, 33);
  const started = new Promise(r => rec.onstart = r), stopped = new Promise(r => rec.onstop = r); rec.start(100); await started; await new Promise(r => setTimeout(r, 1500)); rec.stop(); await stopped; clearInterval(iv); osc.stop(); stream.getTracks().forEach(t => t.stop());
  const [m] = await Media.importFiles([new File(chunks, 'g.webm', { type: 'video/webm' })]); await m.audioReady;
  const c = await Cmd.addMedia(m.id, { start: 0 }); Cmd.addEffect([c.id], 'chromakey');
  const el = Media.clipVideo(c); await new Promise(r => { if (el.readyState >= 2) r(); else { el.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 4000); } }); el.currentTime = .5; await new Promise(r => { el.addEventListener('seeked', r, { once: true }); setTimeout(r, 2000); });
  const out = document.createElement('canvas'); out.width = 1920; out.height = 1080; const octx = out.getContext('2d'); Compositor.renderFrame(octx, .5);
  const px = octx.getImageData(400, 540, 1, 1).data; // green area should be keyed → background black
  let got = null; const orig = U.download; U.download = (b, n) => { got = b.size; }; try { await Exporter.exportWebCodecs({ format: Exporter.FORMATS[0], width: 320, height: 180, fps: 10, bitrate: 400000, audio: true, audioBitrate: 96000, from: 0, to: .4, name: 't' }); } finally { U.download = orig; }
  const persisted = (await DB.allFiles()).length;
  return px[1] < 60 && got > 500 && persisted >= 1 ? true : { px: Array.from(px), got, persisted, hasAudio: m.hasAudio };
})()`);
console.log('\n=== FILE:// RESULTS ==='); for (const [n, r] of results) console.log(`${r.startsWith('PASS') ? 'OK ' : 'XX '} ${n}: ${r}`);
console.log('errors:', errors.length ? errors : '(none)'); done(); process.exit(results.some(x => !x[1].startsWith('PASS')) || errors.length ? 1 : 0);
