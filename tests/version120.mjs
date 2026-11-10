import { launch } from './harness.mjs';

const { check, results, errors, done } = await launch();
async function regression(name, test) {
  await check(name, `(async () => {
    await Project.load({ project: Model.newProject() });
    state.ripple = false;
    return (${test.toString()})();
  })()`);
}

await regression('insert splits both sides of a linked pair at the same source frame', () => {
  const v = videoTracks()[0], a = audioTracks()[0];
  for (const tr of [v,a]) tr.clips.push(Model.newClip(tr.kind, { duration: 5, offset: 1, speed: 2, linkId: 'pair' }));
  KF.set(v.clips[0], 'transform.x', 0, 0); KF.set(v.clips[0], 'transform.x', 4, 100);
  Cmd.addMarker(4, 'Beat'); Cmd.insertSpace(2, 3);
  const [left,right] = v.clips;
  return left.duration === 2 && right.start === 5 && right.offset === 5 && right.duration === 3
    && right.linkId !== left.linkId && a.clips[1].linkId === right.linkId
    && KF.value(right, 'transform.x', 0) === 50 && state.project.markers[0].time === 7;
});
await regression('undo and redo media removal restore the source bytes and all uses', async () => {
  const cv = document.createElement('canvas');
  const file = new File([await new Promise(resolve => cv.toBlob(resolve))], 'undo.png', { type: 'image/png' });
  const [m] = await Media.importFiles([file]), clip = await Cmd.addMedia(m.id);
  Cmd.removeMedia(m.id);
  if (findMedia(m.id) || findClip(clip.id)) return false;
  History.undo();
  if (findMedia(m.id)?.file !== file || !findClip(clip.id) || (await (await fetch(findMedia(m.id).url)).blob()).size !== file.size) return false;
  History.redo(); return !findMedia(m.id) && !findClip(clip.id);
});
await regression('track and source deletion respect locked tracks', () => {
  const m = Media.placeholder('locked-photo', 'Locked photo', 'image'), tr = videoTracks()[0];
  tr.clips.push(Model.newClip('image', { mediaId: m.id })); tr.locked = true;
  Cmd.removeMedia(m.id); Cmd.removeTrack(tr.id); Cmd.cleanEmptyTracks();
  return findMedia(m.id) === m && findTrack(tr.id) === tr && tr.clips.length === 1;
});
await regression('pasted attributes retain effect animation and destination text', () => {
  const a = Cmd.addGenerated('text'), b = Cmd.addGenerated('text', { text: { content: 'Keep me' } });
  const fx = Model.newEffect('blur'); a.effects.push(fx);
  KF.set(a, KF.fxPath(fx, 'radius'), 0, 4); KF.set(a, KF.fxPath(fx, 'radius'), 2, 12);
  Cmd.select(a.id); Cmd.copy(); Cmd.select(b.id); Cmd.pasteAttributes();
  return b.text.content === 'Keep me' && b.effects[0].id !== fx.id && KF.fxValue(b, b.effects[0], 'radius', 1) === 8;
});
await regression('fractional frame rates round-trip a long timecode and project file', async () => {
  for (const fps of [23.976,29.97,59.94]) {
    Cmd.setFps(fps); const time = 126312 / fps, str = U.toTimecode(time, fps);
    if (str.includes('.') || Math.abs(U.parseTimecode(str, fps) - time) > 1e-8) return false;
    await Project.load(Project.serialize()); if (state.project.fps !== fps) return false;
  }
  return true;
});
await regression('playback clamps stale out points and ignores an empty marked range', () => {
  Cmd.addGenerated('solid', {}, {duration: 3});
  state.project.inPoint = 1; state.project.outPoint = 20;
  if (Player.markedRange()?.join() !== '1,3') return false;
  state.project.inPoint = 4; return Player.markedRange() === null;
});
await regression('a marker-only autosave recovers its settings', async () => {
  Cmd.addMarker(8, 'Opening'); Cmd.cropCanvas({x:10,y:10,width:400,height:300});
  await DB.set('autosave', Project.serialize()); await Project.load({project: Model.newProject()});
  return await Project.restoreAutosave() && state.project.markers[0].name === 'Opening' && state.project.width === 400;
});
await regression('invalid shape, media and effect data leave the active project intact', async () => {
  const c = Cmd.addGenerated('shape'); c.effects.push(Model.newEffect('blur'));
  for (const damage of [
    data => data.project.tracks[0].clips[0].shape.points = 1e9,
    data => data.project.tracks[0].clips[0].effects.push(c.effects[0]),
    data => data.media = [{id:'bad',type:'image',name:'image',tags:'bad'}],
  ]) {
    const data = U.deepClone(Project.serialize()); damage(data);
    try { await Project.load(data); return false; } catch { if (findClip(c.id) !== c) return false; }
  }
  return true;
});
await regression('offline audio flags missing sources and renders an exact short range', async () => {
  const tr = audioTracks()[0]; tr.clips.push(Model.newClip('audio', {mediaId:'missing-audio'}));
  try { await AudioEngine.renderOffline(0,.02); return false; } catch (error) { if (!/Relink/.test(error.message)) return false; }
  tr.muted = true;
  return (await AudioEngine.renderOffline(0,.02)).length === 960;
});
await regression('transition source stays available through the entire dissolve', () => {
  const tr = videoTracks()[0], a = Model.newClip('video', {duration:4}), b = Model.newClip('video', {start:4,duration:4});
  b.transitionIn = {type:'dissolve', duration:3}; tr.clips.push(a,b);
  if (Compositor.visibleSpans().find(s => s.clip === a).end !== 7) return false;
  tr.hidden = true; return !Compositor.visibleSpans().length;
});
await regression('MP4 writes signed presentation offsets and a 64-bit duration', async () => {
  const mux = new MP4Muxer({width:16,height:16,fps:10});
  for (const [timestamp,duration] of [[0,100000],[200000,100000],[100000,100000],[300000,3000000000],[3000300000,2000000000]]) {
    mux.addVideo({timestamp,duration,type:'key',byteLength:1,copyTo: u => u[0] = 1});
  }
  const buf = await mux.finalize().arrayBuffer(), view = new DataView(buf), ascii = new TextDecoder('latin1').decode(buf);
  const composition = ascii.indexOf('ctts'), duration = ascii.indexOf('mdhd');
  return composition > 0 && view.getUint8(composition+4) === 1 && view.getInt32(composition+32) === -100000
    && duration > 0 && view.getUint8(duration+4) === 1 && view.getBigUint64(duration+28) === 5000300000n;
});
await regression('an MP4 encoder that fails after configuration retries the export as WebM', async () => {
  Cmd.addGenerated('shape', {}, {duration:1});
  const Native = window.VideoEncoder, download = U.download;
  let file;
  window.VideoEncoder = class {
    static isConfigSupported(cfg) { return cfg.codec.startsWith('avc1') ? Promise.resolve({supported:true}) : Native.isConfigSupported(cfg); }
    constructor(callbacks) { this.callbacks = callbacks; this.encodeQueueSize = 0; }
    configure(cfg) {
      if (!cfg.codec.startsWith('avc1')) { this.real = new Native(this.callbacks); this.real.configure(cfg); }
    }
    encode(...args) { if (this.real) this.real.encode(...args); else this.callbacks.error(Error('Encoder unavailable')); }
    flush() { return this.real?.flush() ?? Promise.resolve(); }
    close() { this.real?.close(); }
  };
  U.download = (blob,name) => { file = {name,bytes:blob.size}; };
  try {
    const ok = await Exporter.exportWebCodecs({format:Exporter.FORMATS[0],width:160,height:90,fps:10,bitrate:300000,audio:false,from:0,to:.2,name:'fallback'});
    return ok && file.name === 'fallback.webm' && file.bytes > 100 && !state.exporting;
  } finally { window.VideoEncoder = Native; U.download = download; }
});
for (const [name, result] of results) console.log(result + ': ' + name);
console.log('Console errors:', errors.length ? errors : '(none)');
await done();
process.exit(results.some(([,result]) => result !== 'PASS') || errors.length ? 1 : 0);
