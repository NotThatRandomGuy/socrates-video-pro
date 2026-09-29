# Agent notes

Static, zero-dependency browser app (no bundler or runtime npm dependencies). Optional Electron desktop packaging uses npm dev dependencies. Classic `<script>` tags in `index.html` load in dependency order; modules share globals (`U`, `state`, `Model`, `History`, `Cmd`, `Media`, `Compositor`, `GLFX`, `AudioEngine`, `Player`, `Preview`, `CanvasTools`, `Timeline`, `Inspector`, `UI`, `Exporter`, `Project`, `Recorder`).

## Layout
- `js/core/` state/data model/history/keyframes, utils, project save/load
- `js/media/` import, IndexedDB persistence, thumbnails/waveforms, recording
- `js/render/` WebGL effects (`glfx.js`) and the canvas compositor
- `js/audio/` Web Audio playback engine + offline mixdown
- `js/editing/commands.js` every undoable edit (wrap mutations in `mutate(label, fn)`)
- `js/ui/` timeline, preview/player, inspector, panels/menus/dialogs
- `js/export/` WebM + MP4 muxers, WebCodecs exporter

## Conventions
- Never store `Infinity`/`NaN`/functions in `state.project` — history and autosave use `JSON.stringify`. Use `isUnbounded(clip)` for generated clips.
- Emit `project:changed` after mutations (done by `mutate`), `clip:live` for high-frequency drag updates, `selection:changed` for selection.
- All rendering is in project coordinates; the caller sets the canvas transform.
- `project.width/height` are output dimensions. When `canvasCrop` exists, its `sourceWidth/sourceHeight` retain composition coordinates and its `x/y` define the output origin. Do not rescale clips when cropping.
- Desktop renderer remains sandboxed with Node integration disabled. Do not add broad filesystem or shell bridges.

## Verify
```
node --check js/**/*.js        # syntax (PowerShell: Get-ChildItem -Recurse -Filter *.js js | % { node --check $_.FullName })
node tests/smoke.mjs           # headless Chrome functional suite (must print no console errors)
node tests/interact.mjs        # mouse/keyboard interaction suite
node tests/fileproto.mjs       # file:// mode
node tests/canvas.mjs          # output crop, center alignment, dialogs, cropped export
```
Tests need Chrome/Edge installed; they spawn unique headless profiles and local servers on dynamically assigned ports. `npm test` runs all checks. `npm run build:win` builds the Windows installer and portable EXE; `npm run build:web` copies the static app into `dist/web`.

## Encoding
All files are UTF-8 (no BOM) and contain emoji/symbols in UI labels. Never round-trip them through PowerShell `Get-Content`/`Set-Content` (defaults to cp1252 and mangles them); use the edit tool or Node for file rewrites.
