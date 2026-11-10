# Changelog

## 1.2.0 — 2026-11-09

### Major Updates

- Added native Mac downloads for Apple silicon and Intel. Both include the full editor, local project recovery, canvas cropping, snapping, recording, and video, audio, and image export.
- Added Mac application and editing menus, Command shortcuts, and Dock reopening. The app asks macOS for camera, microphone, and screen access when you use recording.

### Minor Updates

- Each Mac download is mounted on a matching Mac runner. Release checks verify its disk image, app signature, processor type, sandboxed startup, and exported video. The signed download list now covers both Mac images.
- Updated the desktop runtime and patched a security advisory in a file-matching tool used to build the downloads. The local web server serves only editor files.
- Release verification now checks the publisher's certificate, the complete list of downloads, and GitHub's checksums. Each version stages its files in a separate folder.
- Expanded regression coverage for editing, recovery, playback, export timing, and invalid projects. Browser checks wait for the editor to finish starting and remove their temporary profiles when finished.

### Bug Fixes

- Inserting in the middle of linked clips now splits video and audio together and preserves their source positions and animation. Moving, duplicating, or pasting a group in ripple mode makes room once. Left ripple trims move later clips in the correct direction.
- Freeze frames make room for the still image and its matching audio gap. A selection rectangle can shrink again during an additive selection. Dropping several files on the preview places them in sequence, and undoing a preview drop removes its newly created track.
- Removing source media can be undone and redone together with its timeline clips. Locked tracks protect their clips and sources from removal. Pasting onto a locked track no longer moves other clips.
- Pasting attributes keeps copied animation attached to its effects. Undo works for effect colors, project backgrounds, and applied color lookup tables. Two different lookup tables with the same filename can coexist.
- The editor restores projects containing only settings, crop changes, or markers. Media names and tags survive cache recovery. Invalid media metadata, duplicate effect identifiers, malformed dragged presets, and excessive shape sizes are caught before they damage an edit.
- The fractional frame rates offered in the Inspector now save, reopen, and display whole frame numbers. Playback and export clamp marked ranges after the timeline is shortened.
- Preview, snapshots, and video export use the full duration of a transition. Thumbnail and freeze-frame requests no longer compete to seek the same video. Missing visible sources are reported during export.
- Short audio exports now contain the requested number of samples. Audible missing sources produce an actionable message. Muted tracks can export silence. Switching audio previews or losing microphone access during setup releases the affected resources.
- MP4 preserves presentation order for reordered frames and duration for long tracks. WebM handles audio starting before the first video frame and uses less memory when assembling the download. Partial final frames respect the selected end time.
- Graphics effects recover after a lost graphics context. Shape complexity and effect values are bounded, and wrapped text preserves word animation timing.

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
