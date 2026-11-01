# Changelog

## 1.1.0 — 2026-11-01

### Major Updates

- Added Linux desktop editions: a portable AppImage and an installable Debian/Ubuntu package. They include the same editing, cropping, alignment, effects, recording, and export tools as Windows and the web app.
- Added local signing for the Windows application, installer, and portable executable. A signed checksum list also protects every downloadable package, including Linux and the web edition. The certificate is self-signed; it does not establish a trusted publisher in Windows.
- Added strict project-file checks before opening a project, so damaged or unsafe files cannot replace your current work.

### Minor Updates

- Saved projects now include imported color lookup tables, so their looks survive reopening and transfer to another machine.
- Exports preserve the picture's proportions when the chosen output size has a different aspect ratio.
- Locked tracks clearly disable clip controls in the Inspector.
- Updated the desktop runtime and packaging tools, added Linux package checks, and expanded automated regression coverage.
- Added reproducible signing and release-verification tools, Linux installation instructions, and a documented audit scope.

### Bug Fixes

- Fixed linked audio/video ripple deletion moving later clips twice, and ripple paste leaving incorrect spacing.
- Fixed trimming repeatedly shifting animation keys during a single drag, and splitting clips changing animated curves.
- Prevented edits, inserts, ripple movement, effects, and speed changes from modifying locked tracks.
- Preserved a video's linked audio when the first audio track is locked, and prevented transitions from changing locked clips.
- Fixed relinking audio continuing to play the previous source, and rejected replacements of the wrong media type.
- Fixed invalid numbers and failed edits corrupting project history; failed edits now restore the previous project.
- Fixed stale playback, audio connections, and timeline scrolling after opening or creating a project.
- Fixed middle-mouse timeline panning and malformed drag-and-drop data errors.
- Fixed blur/glow combinations reusing the wrong graphics buffers, stale color lookup textures, and adjustment-layer animation timing during export.
- Fixed content bleeding beyond cropped output into preview margins.
- Fixed exported audio ignoring master mute/volume, and audio envelopes using the wrong timing during shuttle playback.
- Fixed recording startup before the audio device is ready, recording resources left active after closing or ending capture, and mixed microphone/screen tracks not being released.
- Fixed real-time export ignoring its selected range, stopping shared audio tracks, and starting playback before the recorder is ready.
- Fixed concurrent exports, invalid export settings, encoder failure cleanup, cancellation cleanup, and export playback-position restoration.
- Fixed cancelled file pickers and programmatically closed dialogs leaving pending work or keyboard listeners behind.

## 1.0.0

### Major Updates

- Released the web editor and Windows installer/portable editions with an MIT license.
- Added adjustable, undoable canvas cropping and horizontal/vertical center snapping.

### Minor Updates

- Added crop presets, exact crop dimensions, center buttons, alignment guides, and accessible dialogs.
- Added installation documentation and automated browser and desktop packaging checks.

### Bug Fixes

- Repaired issues found during the initial editing, rendering, saving, and export checks.
