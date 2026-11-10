// Captures a screenshot of the editor with a populated project → tests/screenshot.png
import { launch } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const { evalJs, send, errors, done, sleep } = await launch();
await evalJs(`(async () => {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const ctx = cv.getContext('2d');
  const ac = AudioEngine.ctx(); await AudioEngine.ready(); const osc = ac.createOscillator(); osc.frequency.value = 220; const g = ac.createGain(); g.gain.value = .3; const dest = ac.createMediaStreamDestination(); osc.connect(g); g.connect(dest); osc.start();
  const lfo = ac.createOscillator(); lfo.frequency.value = 2; const lg = ac.createGain(); lg.gain.value = .3; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  const stream = cv.captureStream(0); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
  let f = 0; const iv = setInterval(() => { const gr = ctx.createLinearGradient(0,0,640,360); gr.addColorStop(0,'hsl('+(f*3%360)+',70%,45%)'); gr.addColorStop(1,'hsl('+((f*3+120)%360)+',70%,35%)'); ctx.fillStyle = gr; ctx.fillRect(0,0,640,360); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(320+Math.sin(f/10)*200, 180+Math.cos(f/13)*100, 40, 0, 7); ctx.fill(); f++; stream.getVideoTracks()[0].requestFrame(); }, 33);
  const started = new Promise(r => rec.onstart = r), stopped = new Promise(r => rec.onstop = r); rec.start(100); await started; await new Promise(r => setTimeout(r, 3000)); rec.stop(); await stopped; clearInterval(iv); osc.stop(); stream.getTracks().forEach(t => t.stop()); lfo.stop();
  const [m] = await Media.importFiles([new File(chunks, 'sample_footage.webm', { type: 'video/webm' })], { persist: false }); await m.audioReady;
  const c1 = await Cmd.addMedia(m.id, { start: 0 }); const c2 = await Cmd.addMedia(m.id, { start: clipEnd(c1) });
  c2.transitionIn = { type: 'dissolve', duration: .6 };
  Cmd.addEffect([c1.id], 'color'); c1.effects[0].params.saturation = 40; Cmd.addEffect([c1.id], 'vignette');
  const t = Cmd.addGenerated('text', { text: Object.assign(Model.defaultText(), { content: 'Socrates Video Pro', size: 120, animation: 'char-pop', shadowBlur: 20 }) }, { start: .5, duration: 3 });
  Cmd.addGenerated('shape', { shape: { type: 'star', fill: '#ffcf4a' }, transform: { x: -600, y: -250, scaleX: .5, scaleY: .5, rotation: 15, anchorX: 0, anchorY: 0, opacity: 1, uniform: true } }, { start: 0, duration: 4 });
  Cmd.addMarker(1.2, 'Intro'); Cmd.setIn(.3); Cmd.setOut(3.5);
  Cmd.select(t.id); Player.seek(1.2); Timeline.zoomFit();
  await new Promise(r => setTimeout(r, 1500));
})()`);
await sleep(800);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(import.meta.dirname, 'screenshot.png'), Buffer.from(shot.result.data, 'base64'));
console.log('saved tests/screenshot.png', errors.length ? errors : 'no errors');
await done();
