/* ============================================================
   MUXERS — WebM (EBML/Matroska) and MP4 (ISOBMFF) written from scratch
   Both accept WebCodecs EncodedVideoChunk / EncodedAudioChunk data.
============================================================ */
'use strict';

/* ---------- byte helpers ---------- */
class ByteWriter {
  constructor() { this.parts = []; this.length = 0; }
  push(u8) { this.parts.push(u8); this.length += u8.byteLength; return this; }
  u8(v) { return this.push(new Uint8Array([v & 255])); }
  u16(v) { return this.push(new Uint8Array([(v >> 8) & 255, v & 255])); }
  u24(v) { return this.push(new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255])); }
  u32(v) { return this.push(new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255])); }
  u64(v) { const hi = Math.floor(v / 4294967296), lo = v >>> 0; return this.u32(hi).u32(lo); }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  f64(v) { const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, v); return this.push(new Uint8Array(b)); }
  f32(v) { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v); return this.push(new Uint8Array(b)); }
  str(s) { return this.push(new TextEncoder().encode(s)); }
  bytes() { const out = new Uint8Array(this.length); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.byteLength; } return out; }
}
const toU8 = (chunk) => { if (chunk instanceof Uint8Array) return chunk; if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk); const u = new Uint8Array(chunk.byteLength); chunk.copyTo(u); return u; };

/* ============================================================
   WebM
============================================================ */
class WebMMuxer {
  constructor({ width, height, fps, videoCodec = 'V_VP9', audio = null, duration = 0 }) {
    this.width = width; this.height = height; this.fps = fps; this.videoCodec = videoCodec; this.audio = audio; // audio: {codec:'A_OPUS', sampleRate, channels}
    this.videoDesc = null; this.audioDesc = null; this.blocks = []; this.duration = duration;
  }
  /* EBML element: id (number), payload Uint8Array */
  static vint(n) { // size vint
    if (n < 0x7F) return new Uint8Array([0x80 | n]); if (n < 0x3FFF) return new Uint8Array([0x40 | (n >> 8), n & 255]); if (n < 0x1FFFFF) return new Uint8Array([0x20 | (n >> 16), (n >> 8) & 255, n & 255]); if (n < 0x0FFFFFFF) return new Uint8Array([0x10 | (n >> 24), (n >> 16) & 255, (n >> 8) & 255, n & 255]);
    const hi = Math.floor(n / 4294967296); return new Uint8Array([0x08 | hi, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  }
  static id(n) { const w = new ByteWriter(); if (n >= 0x1000000) w.u32(n); else if (n >= 0x10000) w.u24(n); else if (n >= 0x100) w.u16(n); else w.u8(n); return w.bytes(); }
  static el(id, payload) { const w = new ByteWriter(); w.push(WebMMuxer.id(id)); w.push(WebMMuxer.vint(payload.byteLength)); w.push(payload); return w.bytes(); }
  static uint(id, v) { const w = new ByteWriter(); if (v < 256) w.u8(v); else if (v < 65536) w.u16(v); else if (v < 16777216) w.u24(v); else w.u32(v); return WebMMuxer.el(id, w.bytes()); }
  static float(id, v) { const w = new ByteWriter(); w.f64(v); return WebMMuxer.el(id, w.bytes()); }
  static string(id, s) { return WebMMuxer.el(id, new TextEncoder().encode(s)); }
  static master(id, ...children) { const w = new ByteWriter(); children.filter(Boolean).forEach(c => w.push(c)); return WebMMuxer.el(id, w.bytes()); }

  addVideo(chunk, meta) { if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.videoDesc) this.videoDesc = toU8(meta.decoderConfig.description); this.blocks.push({ track: 1, ts: chunk.timestamp / 1000, key: chunk.type === 'key', data: toU8(chunk) }); }
  addAudio(chunk, meta) { if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.audioDesc) this.audioDesc = toU8(meta.decoderConfig.description); this.blocks.push({ track: 2, ts: chunk.timestamp / 1000, key: true, data: toU8(chunk) }); }

  opusHead() { const w = new ByteWriter(); w.str('OpusHead'); w.u8(1); w.u8(this.audio.channels); w.u8(0x38); w.u8(0x01); /* preskip 312 LE */ w.push(new Uint8Array([this.audio.sampleRate & 255, (this.audio.sampleRate >> 8) & 255, (this.audio.sampleRate >> 16) & 255, (this.audio.sampleRate >> 24) & 255])); w.u16(0); w.u8(0); return w.bytes(); }

  finalize() {
    const M = WebMMuxer;
    const header = M.master(0x1A45DFA3, M.uint(0x4286, 1), M.uint(0x42F7, 1), M.uint(0x42F2, 4), M.uint(0x42F3, 8), M.string(0x4282, 'webm'), M.uint(0x4287, 4), M.uint(0x4285, 2));
    this.blocks.sort((a, b) => a.ts - b.ts || a.track - b.track);
    const dur = this.duration > 0 ? this.duration * 1000 : this.blocks.reduce((end, b) => Math.max(end, b.ts + (b.track === 1 ? 1000 / this.fps : 20)), 0);
    const info = M.master(0x1549A966, M.uint(0x2AD7B1, 1000000), M.string(0x4D80, 'VideoEditorPro'), M.string(0x5741, 'VideoEditorPro'), M.float(0x4489, dur));
    const vtrack = M.master(0xAE, M.uint(0xD7, 1), M.uint(0x73C5, 1), M.uint(0x83, 1), M.string(0x86, this.videoCodec), M.uint(0x23E383, Math.round(1e9 / this.fps)), this.videoDesc ? M.el(0x63A2, this.videoDesc) : null, M.master(0xE0, M.uint(0xB0, this.width), M.uint(0xBA, this.height)));
    const atrack = this.audio ? M.master(0xAE, M.uint(0xD7, 2), M.uint(0x73C5, 2), M.uint(0x83, 2), M.string(0x86, this.audio.codec), M.uint(0x56AA, 6500000), M.uint(0x56BB, 80000000), M.el(0x63A2, this.audioDesc && this.audioDesc.byteLength > 8 ? this.audioDesc : this.opusHead()), M.master(0xE1, M.float(0xB5, this.audio.sampleRate), M.uint(0x9F, this.audio.channels))) : null;
    const tracks = M.master(0x1654AE6B, vtrack, atrack);
    // clusters: new cluster on video keyframe if > 4s since cluster start, or if relative timecode would overflow
    const clusters = []; let cur = null; const cues = [];
    const flush = () => { if (!cur) return; const w = new ByteWriter(); w.push(M.uint(0xE7, cur.tc)); cur.blocks.forEach(b => w.push(b)); clusters.push({ bytes: M.el(0x1F43B675, w.bytes()), tc: cur.tc }); cur = null; };
    for (const b of this.blocks) {
      const tsMs = Math.round(b.ts);
      if (!cur || (b.track === 1 && b.key && tsMs - cur.tc >= 4000) || tsMs - cur.tc > 32000) { flush(); cur = { tc: Math.max(0, tsMs), blocks: [] }; if (b.track === 1) cues.push({ time: tsMs, cluster: clusters.length }); }
      const w = new ByteWriter(); w.u8(0x80 | b.track); w.i16(tsMs - cur.tc); w.u8(b.key ? 0x80 : 0); w.push(b.data); cur.blocks.push(M.el(0xA3, w.bytes()));
    }
    flush();
    // compute cluster positions relative to segment data start (after seekhead-less: info + tracks precede clusters)
    const segHeadLen = info.byteLength + tracks.byteLength; const positions = []; let acc = segHeadLen; for (const c of clusters) { positions.push(acc); acc += c.bytes.byteLength; }
    const cuesEl = M.master(0x1C53BB6B, ...cues.map(cu => M.master(0xBB, M.uint(0xB3, cu.time), M.master(0xB7, M.uint(0xF7, 1), M.uint(0xF1, positions[cu.cluster])))));
    const segmentSize = acc + cuesEl.byteLength;
    return new Blob([header, M.id(0x18538067), M.vint(segmentSize), info, tracks,
      ...clusters.map(cluster => cluster.bytes), cuesEl], { type: 'video/webm' });
  }
}

/* ============================================================
   MP4
============================================================ */
class MP4Muxer {
  constructor({ width, height, fps, audio = null }) { // audio: {codec:'aac'|'opus', sampleRate, channels}
    this.width = width; this.height = height; this.fps = fps; this.audio = audio; this.videoDesc = null; this.audioDesc = null;
    this.vSamples = []; this.aSamples = []; this.mdat = []; this.mdatSize = 0; this.vCodecName = 'avc1';
  }
  addVideo(chunk, meta) {
    if (meta && meta.decoderConfig) { if (meta.decoderConfig.description && !this.videoDesc) this.videoDesc = toU8(meta.decoderConfig.description); if (meta.decoderConfig.codec && meta.decoderConfig.codec.startsWith('hvc1')) this.vCodecName = 'hvc1'; }
    const data = toU8(chunk); this.vSamples.push({ ts: chunk.timestamp, dur: chunk.duration || Math.round(1e6 / this.fps), size: data.byteLength, key: chunk.type === 'key', offset: this.mdatSize }); this.mdat.push(data); this.mdatSize += data.byteLength;
  }
  addAudio(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.audioDesc) this.audioDesc = toU8(meta.decoderConfig.description);
    const sr = this.audio ? this.audio.sampleRate : 48000; const defDur = this.audio && this.audio.codec === 'aac' ? 1024 : 960;
    const dur = chunk.duration ? Math.round(chunk.duration * sr / 1e6) : defDur;
    const data = toU8(chunk); this.aSamples.push({ ts: chunk.timestamp, dur, size: data.byteLength, offset: this.mdatSize }); this.mdat.push(data); this.mdatSize += data.byteLength;
  }
  static box(type, ...payload) { const w = new ByteWriter(); const inner = new ByteWriter(); payload.filter(Boolean).forEach(p => inner.push(p)); const size = 8 + inner.length; w.u32(size); w.str(type); w.push(inner.bytes()); return w.bytes(); }
  static full(type, version, flags, ...payload) { const w = new ByteWriter(); w.u8(version); w.u24(flags); payload.filter(Boolean).forEach(p => w.push(p)); return MP4Muxer.box(type, w.bytes()); }
  static W() { return new ByteWriter(); }

  finalize() {
    const B = MP4Muxer.box, F = MP4Muxer.full, W = MP4Muxer.W;
    const ftyp = B('ftyp', W().str('isom').u32(0x200).str('isom').str('iso2').str(this.vCodecName).str('mp41').bytes());
    const mdatHeaderSize = this.mdatSize + 8 > 0xFFFFFFFF ? 16 : 8; const mdatOffset = ftyp.byteLength + mdatHeaderSize;
    const mvTimescale = 1000; const vTimescale = 1000000; const aTimescale = this.audio ? this.audio.sampleRate : 48000;
    const vDurUs = this.vSamples.reduce((s, x) => s + x.dur, 0); const aDurSamples = this.aSamples.reduce((s, x) => s + x.dur, 0);
    const movieDur = Math.round(Math.max(vDurUs / 1e6, aDurSamples / aTimescale) * mvTimescale);
    const now = Math.floor(Date.now() / 1000) + 2082844800;
    const mvhd = F('mvhd', 0, 0, W().u32(now).u32(now).u32(mvTimescale).u32(movieDur).u32(0x00010000).u16(0x0100).u16(0).u32(0).u32(0).push(matrix()).push(new Uint8Array(24)).u32(this.audio ? 3 : 2).bytes());
    function matrix() { return W().u32(0x00010000).u32(0).u32(0).u32(0).u32(0x00010000).u32(0).u32(0).u32(0).u32(0x40000000).bytes(); }
    const tkhd = (id, dur, w, h, isAudio) => F('tkhd', 0, 3, W().u32(now).u32(now).u32(id).u32(0).u32(dur).u32(0).u32(0).u16(0).u16(0).u16(isAudio ? 0x0100 : 0).u16(0).push(matrix()).u32(w << 16).u32(h << 16).bytes());
    const mdhd = (timescale, dur) => {
      const wide = dur > 0xffffffff;
      const fields = wide ? W().u64(now).u64(now).u32(timescale).u64(dur) : W().u32(now).u32(now).u32(timescale).u32(dur);
      return F('mdhd', wide ? 1 : 0, 0, fields.u16(0x55c4).u16(0).bytes());
    };
    const hdlr = (type, name) => F('hdlr', 0, 0, W().u32(0).str(type).u32(0).u32(0).u32(0).str(name).u8(0).bytes());
    const dinf = B('dinf', F('dref', 0, 0, W().u32(1).push(F('url ', 0, 1)).bytes()));
    const timingTable = (type, version, samples, getDur) => { const runs = []; for (const s of samples) { const d = getDur(s); if (runs.length && runs[runs.length - 1].d === d) runs[runs.length - 1].n++; else runs.push({ d, n: 1 }); } const w = W().u32(runs.length); runs.forEach(r => w.u32(r.n).u32(r.d)); return F(type, version, 0, w.bytes()); };
    const stts = (samples, getDur) => timingTable('stts', 0, samples, getDur);
    const stsc = F('stsc', 0, 0, W().u32(1).u32(1).u32(1).u32(1).bytes());
    const stsz = (samples) => { const w = W().u32(0).u32(samples.length); samples.forEach(s => w.u32(s.size)); return F('stsz', 0, 0, w.bytes()); };
    const stco = (samples) => { const big = samples.some(s => mdatOffset + s.offset > 0xFFFFFFFF); const w = W().u32(samples.length); samples.forEach(s => big ? w.u64(mdatOffset + s.offset) : w.u32(mdatOffset + s.offset)); return F(big ? 'co64' : 'stco', 0, 0, w.bytes()); };
    // video
    const avcC = this.videoDesc ? B(this.vCodecName === 'hvc1' ? 'hvcC' : 'avcC', this.videoDesc) : null;
    const sampleEntryV = B(this.vCodecName, W().push(new Uint8Array(6)).u16(1).u16(0).u16(0).u32(0).u32(0).u32(0).u16(this.width).u16(this.height).u32(0x00480000).u32(0x00480000).u32(0).u16(1).push(new Uint8Array(32)).u16(0x18).i16(-1).bytes(), avcC);
    const stsdV = F('stsd', 0, 0, W().u32(1).push(sampleEntryV).bytes());
    const keys = this.vSamples.map((s, i) => s.key ? i + 1 : 0).filter(Boolean); const stss = (() => { const w = W().u32(keys.length); keys.forEach(k => w.u32(k)); return F('stss', 0, 0, w.bytes()); })();
    let decodeTime = 0;
    const offsets = this.vSamples.map(sample => {
      const offset = sample.ts - decodeTime;
      decodeTime += sample.dur;
      return offset;
    });
    const ctts = offsets.some(offset => offset !== 0) ? timingTable('ctts', offsets.some(n => n < 0) ? 1 : 0, offsets, n => n) : null;
    const stblV = B('stbl', stsdV, stts(this.vSamples, s => s.dur), ctts, stss, stsc, stsz(this.vSamples), stco(this.vSamples));
    const minfV = B('minf', F('vmhd', 0, 1, W().u16(0).u16(0).u16(0).u16(0).bytes()), dinf, stblV);
    const trakV = B('trak', tkhd(1, Math.round(vDurUs / 1e6 * mvTimescale), this.width, this.height, false), B('mdia', mdhd(vTimescale, vDurUs), hdlr('vide', 'VideoHandler'), minfV));
    // audio
    let trakA = null;
    if (this.audio && this.aSamples.length) {
      let entry;
      if (this.audio.codec === 'aac') {
        const asc = this.audioDesc || new Uint8Array([0x11, 0x90]); // AAC-LC 48k stereo fallback
        const dsi = W().u8(0x05).u8(asc.byteLength).push(asc).bytes();
        const dcd = W().u8(0x04).u8(13 + dsi.byteLength).u8(0x40).u8(0x15).u24(0).u32(256000).u32(128000).push(dsi).bytes();
        const sl = W().u8(0x06).u8(1).u8(0x02).bytes();
        const es = W().u8(0x03).u8(3 + dcd.byteLength + sl.byteLength).u16(1).u8(0).push(dcd).push(sl).bytes();
        const esds = F('esds', 0, 0, es);
        entry = B('mp4a', W().push(new Uint8Array(6)).u16(1).u16(0).u16(0).u32(0).u16(this.audio.channels).u16(16).u16(0).u16(0).u32(this.audio.sampleRate << 16).bytes(), esds);
      } else { // Opus in MP4
        const dOps = B('dOps', W().u8(0).u8(this.audio.channels).u16(312).u32(this.audio.sampleRate).u16(0).u8(0).bytes());
        entry = B('Opus', W().push(new Uint8Array(6)).u16(1).u16(0).u16(0).u32(0).u16(this.audio.channels).u16(16).u16(0).u16(0).u32(48000 << 16).bytes(), dOps);
      }
      const stsdA = F('stsd', 0, 0, W().u32(1).push(entry).bytes());
      const stblA = B('stbl', stsdA, stts(this.aSamples, s => s.dur), stsc, stsz(this.aSamples), stco(this.aSamples));
      const minfA = B('minf', F('smhd', 0, 0, W().u16(0).u16(0).bytes()), dinf, stblA);
      trakA = B('trak', tkhd(2, Math.round(aDurSamples / aTimescale * mvTimescale), 0, 0, true), B('mdia', mdhd(aTimescale, aDurSamples), hdlr('soun', 'SoundHandler'), minfA));
    }
    const moov = B('moov', mvhd, trakV, trakA);
    const mdatHead = W(); if (mdatHeaderSize === 16) { mdatHead.u32(1).str('mdat').u64(this.mdatSize + 16); } else { mdatHead.u32(this.mdatSize + 8).str('mdat'); }
    return new Blob([ftyp, mdatHead.bytes(), ...this.mdat, moov], { type: 'video/mp4' });
  }
}
