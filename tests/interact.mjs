// Mouse-interaction tests via CDP Input events: clip drag, trim, marquee, ruler scrub, preview gizmo, context menu.
import { launch } from './harness.mjs';
const { check, evalJs, send, results, errors, done, sleep } = await launch();

const mouse = async (type, x, y, opts = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: opts.button || 'left', buttons: type === 'mouseMoved' && opts.down ? 1 : (type === 'mousePressed' ? 1 : 0), clickCount: opts.clickCount ?? (type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0), modifiers: opts.modifiers || 0 });
const drag = async (x0, y0, x1, y1, steps = 8, modifiers = 0) => { await mouse('mouseMoved', x0, y0); await mouse('mousePressed', x0, y0, { modifiers }); for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, { down: true, modifiers }); await sleep(15); } await mouse('mouseReleased', x1, y1, { modifiers }); await sleep(120); };
const rect = async (sel) => evalJs(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
const clipRect = async (id) => rect(`.clip[data-id="${id}"]`);

// setup: two text clips on V1 + a shape on V2
await evalJs(`(() => { window.A_ = Cmd.addGenerated('text', { text: { content: 'A' } }, { start: 0, duration: 3, trackIndex: 0 }); window.B_ = Cmd.addGenerated('text', { text: { content: 'B' } }, { start: 5, duration: 3, trackIndex: 0 }); window.S_ = Cmd.addGenerated('shape', {}, { start: 1, duration: 2, trackIndex: 1 }); Timeline.setZoom(100); document.getElementById('tlScroll').scrollLeft = 0; Cmd.deselect(); Player.seek(0); Object.defineProperty(window, 'A', { get: () => findClip(A_.id) }); Object.defineProperty(window, 'B', { get: () => findClip(B_.id) }); Object.defineProperty(window, 'S', { get: () => findClip(S_.id) }); })()`);
await sleep(300);

// 1. click selects
let r = await clipRect(await evalJs('A.id')); await mouse('mouseMoved', r.x + r.w / 2, r.y + r.h / 2); await mouse('mousePressed', r.x + r.w / 2, r.y + r.h / 2); await mouse('mouseReleased', r.x + r.w / 2, r.y + r.h / 2); await sleep(100);
await check('click selects clip', `state.selection.has(A.id) && state.selection.size === 1`);
// 2. drag moves (100px = 1s)
r = await clipRect(await evalJs('A.id')); await drag(r.x + r.w / 2, r.y + r.h / 2, r.x + r.w / 2 + 100, r.y + r.h / 2);
await check('drag moves clip ~1s', `Math.abs(A.start - 1) < 0.15 ? true : A.start`);
await check('drag is undoable', `(() => { History.undo(); const ok = A.start === 0; History.redo(); return ok && Math.abs(A.start - 1) < .15; })()`);
// 3. snapping: drag A's end near B's start (B.start=5 → A.start should snap to 2)
r = await clipRect(await evalJs('A.id')); await drag(r.x + r.w / 2, r.y + r.h / 2, r.x + r.w / 2 + 100 - 4, r.y + r.h / 2);
await check('snap to adjacent clip edge', `Math.abs(clipEnd(A) - B.start) < 1e-6 ? true : [A.start, clipEnd(A), B.start]`);
// 4. trim right handle of B by +100px
r = await clipRect(await evalJs('B.id')); await drag(r.x + r.w - 3, r.y + r.h / 2, r.x + r.w - 3 + 100, r.y + r.h / 2);
await check('trim right extends 1s', `Math.abs(B.duration - 4) < 0.15 ? true : B.duration`);
// 5. trim left handle of B by +50px
r = await clipRect(await evalJs('B.id')); await drag(r.x + 3, r.y + r.h / 2, r.x + 3 + 50, r.y + r.h / 2);
await check('trim left', `Math.abs(B.start - 5.5) < 0.15 && Math.abs(B.duration - 3.5) < 0.15 ? true : [B.start, B.duration]`);
// 6. drag to another track (V2 is above V1 in display; shape is on V2). Move B up one row
r = await clipRect(await evalJs('B.id')); const rowH = await evalJs(`document.querySelector('.track').getBoundingClientRect().height`);
await drag(r.x + r.w / 2, r.y + r.h / 2, r.x + r.w / 2, r.y + r.h / 2 - rowH);
await check('drag between tracks', `findTrackOfClip(B.id) === videoTracks()[1] ? true : findTrackOfClip(B.id).name`);
// 7. overwrite: drag B onto the shape's range on V2 (shape at 1..3) → shape should be trimmed
r = await clipRect(await evalJs('B.id')); await drag(r.x + r.w / 2, r.y + r.h / 2, r.x + r.w / 2 - 350, r.y + r.h / 2);
await check('overwrite trims underlying clip', `(() => { const s = findClip(S.id); return !s || clipEnd(s) <= B.start + 1e-6 || s.start >= clipEnd(B) - 1e-6 ? true : [s.start, clipEnd(s), B.start, clipEnd(B)]; })()`);
// 8. marquee select empty area over both tracks
const tr = await rect('#tlTracks'); await drag(tr.x + 5, tr.y + 5, tr.x + 500, tr.y + rowH * 2 - 5);
await check('marquee selects multiple', `state.selection.size >= 2 ? true : state.selection.size`);
// 9. ruler scrub
const ru = await rect('#tlRuler'); await drag(ru.x + 50, ru.y + 15, ru.x + 250, ru.y + 15);
await check('ruler scrub seeks', `Math.abs(state.currentTime - 2.5) < 0.2 ? true : state.currentTime`);
// 10. razor tool split via click
await evalJs(`Timeline.setTool('razor'); Player.seek(0)`); r = await clipRect(await evalJs('A.id')); const nBefore = await evalJs('allClips().length');
await mouse('mouseMoved', r.x + r.w / 2, r.y + r.h / 2); await mouse('mousePressed', r.x + r.w / 2, r.y + r.h / 2); await mouse('mouseReleased', r.x + r.w / 2, r.y + r.h / 2); await sleep(100);
await check('razor click splits', `allClips().length === ${nBefore} + 1`);
await evalJs(`Timeline.setTool('select')`);
// 11. preview gizmo: select A, drag it in the preview
await evalJs(`Cmd.setEnabled([S.id, B.id], false); Cmd.select(A.id); Player.seek(A.start + 0.5)`); await sleep(200);
const ov = await rect('#previewOverlay'); const s = ov.w / await evalJs('state.project.width');
await drag(ov.x + ov.w / 2, ov.y + ov.h / 2, ov.x + ov.w / 2 + 100 * s, ov.y + ov.h / 2 + 50 * s);
await check('gizmo drag moves clip', `Math.abs(A.transform.x - 100) < 3 && Math.abs(A.transform.y - 50) < 3 ? true : [A.transform.x, A.transform.y]`);
// 12. gizmo corner scale
const g = await evalJs(`(() => { const b = Compositor.clipBounds(A, state.currentTime); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w }; })()`);
await drag(ov.x + g.x * s, ov.y + g.y * s, ov.x + (g.x + g.w * .25) * s, ov.y + (g.y + 10) * s);
await check('gizmo corner scales', `A.transform.scaleX > 1.1 ? true : A.transform.scaleX`);
// 13. context menu opens
r = await clipRect(await evalJs('A.id')); await mouse('mousePressed', r.x + r.w / 2, r.y + r.h / 2, { button: 'right' }); await mouse('mouseReleased', r.x + r.w / 2, r.y + r.h / 2, { button: 'right' }); await sleep(100);
await check('context menu opens', `!!document.querySelector('.ctx-menu') && document.querySelectorAll('.ctx-menu .item').length > 10`);
await evalJs(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
// 14. keyboard: space toggles play
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' }); await sleep(200);
await check('space plays', `state.playing === true`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' }); await sleep(100);
await check('space pauses', `state.playing === false`);
// 15. inspector slider changes value (drag range input)
await evalJs(`Cmd.select(A.id); state.activeInspectorTab = 'video'; Inspector.render();`); await sleep(100);
const rr = await rect('#inspector input[type=range][data-path="transform.opacity"]'); await drag(rr.x + rr.w - 2, rr.y + rr.h / 2, rr.x + rr.w / 2, rr.y + rr.h / 2);
await check('inspector slider edits + undo', `(() => { const v = A.transform.opacity; History.undo(); const back = A.transform.opacity; return v < 0.7 && back === 1 ? true : [v, back]; })()`);
// 16. keyframe button in inspector
await evalJs(`Inspector.render()`); const kb = await rect('#inspector .field .kf-btn'); await mouse('mousePressed', kb.x + 5, kb.y + 5); await mouse('mouseReleased', kb.x + 5, kb.y + 5); await sleep(100);
await check('kf button adds keyframe', `KF.allTimes(A).length === 1`);

console.log('\n=== INTERACTION RESULTS ===');
for (const [n, res] of results) console.log(`${res.startsWith('PASS') ? 'OK ' : 'XX '} ${n}: ${res}`);
console.log('\n=== ERRORS ==='); console.log(errors.length ? errors.join('\n') : '(none)');
await done(); process.exit(results.some(x => !x[1].startsWith('PASS')) || errors.length ? 1 : 0);
