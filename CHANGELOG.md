# Changelog

## 1.3.0 — 2026-11-27

### Major Updates

- Added optional Short Form Studio with a workspace for edits and reels. It includes animated text, beat detection and BPM grids, fitting cuts to beats, point tracking, manual animated rotoscoping, speed ramps, zooms, shakes, visual overlays, transitions, masking, transform motion blur, perspective animation, audio-reactive scale, color correction, templates, and baked expressions.
- Added an optional-component checkbox to Windows setup and update installers. Other editions offer the choice in first-launch setup and before opening update packages. Components can be enabled or disabled later from Help.
- Changed this release's project license to GNU GPL version 3, with attribution to NotThatRandomGuy.

### Minor Updates

- Short-form edits save as editable clips, effects, animation keys, and outline data. Saved masks and perspective continue rendering when the authoring component is disabled.
- Short Form Studio installs from a bundled payload, so accepting the component does not require an internet connection.
- Added tests for component consent, base-only operation, linked source timing, texture tracking, rendering, undo, saved projects, and tutorial visibility.
- Documented tool workflows and the limits of local point tracking, manual rotoscoping, and plane-based perspective animation.

### Bug Fixes

- Removed background blur from the tutorial and moved its dialog to the lower corner so highlighted workspace areas are easier to see.
- Refreshes cached title rendering when downloaded fonts finish loading, so fallback lettering is replaced correctly.
- Fixed split operations using link identifiers that matched built-in object property names.
- Prevented trimming inconsistent source metadata from producing a negative clip duration.
- Animated outlines shift and scale with trims, splits, and speed changes.
- Component selection is preserved across launches. Disabling the component removes its installed code without deleting project data.
- Tracking respects source crop, anchor, rotation, and animated positioning, and stops when the selected project or source changes.

## 1.2.10 — 2026-11-26

### Major Updates

- Added a user-controlled updater. The editor checks GitHub for the latest stable release in the background and displays a quiet update button. Checking works independently of startup, editing, and export.
- Update Now starts a download only after you choose where to save it. Desktop downloads are selected for your edition and processor, checked against the signed release list, and verified before installation or replacement guidance is offered.
- Added Remind Me Later, Skip This Update, and a persistent option to disable background checks. Help includes manual checks and update settings so you can change your mind at any time.

### Minor Updates

- Added friendly update messages, release notes, reminder choices, download cancellation, and platform-specific instructions for installers, portable apps, AppImage, Debian packages, and Mac disk images.
- The hosted web editor can offer a reload after saving when a newer version has been deployed to that site. Downloaded web editions link to the new archive with instructions for reopening saved projects.
- Added historical project fixtures from all four earlier releases, update preference checks, offline checks, signature rejection, and edition-selection checks.

### Bug Fixes

- Version 1.0.0 projects containing the older list of LUT names can open again. Their lookup references are preserved. Available lookup contents are retained, and missing .cube files are identified for reimport.
- Extra project, view, and media metadata survive opening and saving instead of being silently dropped.
- Opening a file checks its contents before asking to replace unsaved work. Changes made while the file is being read are included in that confirmation.
- Undo and redo refresh the displayed playhead time after restoring the timeline.
- Update failures leave the editor usable offline. Drafts, preview versions, unexpected download addresses, invalid signatures, damaged files, and unexpected Windows signers are rejected.
- Update downloads use temporary files and clean up cancelled or failed transfers. Opening an installer waits for saved work and idle playback, recording, and export. The editor stays open until you choose to close it.

## 1.2.5 — 2026-11-25

### Major Updates

- Added a startup welcome screen with Create New Project, Open Existing Project, Open File in Editor, and Continue Editing. Imported files open in sequence on the timeline.
- Added an optional guided tutorial covering media, the timeline, tracks, ripple editing, preview, cropping, alignment, animation, effects, titles, audio, recording, saving, recovery, and export. First startup offers the tour, and every welcome screen includes a small tutorial button.

### Minor Updates

- Welcome and Tutorial are available in Help. The tutorial has Next, Back, Skip, and Finish controls and highlights the area being explained.
- Added project-file and startup regression checks, including downloaded saves, legacy project migration, damaged files, first-run preferences, and tutorial navigation.
- Checked the packaging dependencies for published security advisories.

### Bug Fixes

- Saved projects now preserve master volume and mute, so reopening keeps the export mix. Earlier projects open with the default master mix.
- Project snapshots are independent copies, preventing later edits from changing an already captured save.
- Saving validates the file before download. Failed saves keep the project marked as unsaved.
- Older project files with missing effect settings receive defaults. Files containing a leading byte-order mark open correctly.
- Clips referring to missing sources get a relinkable Media entry even when the older project file omits its media list. Saved media names and tags are restored for cached sources.
- Invalid lookup tables, master mixes, transitions, keyframes, clip entries, and unsupported format versions are rejected before replacing the current project or undo history.
- Opening another project during export is prevented. Undo and redo stop stale playback and reset audio connections.
- A failed media replacement keeps the original source. Successful replacement preserves its name and tags. Removing media releases its scratch video decoder.
- Keyboard focus enters dialogs containing only buttons. Closing or skipping the tutorial removes its highlight and listeners.

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
- An MP4 encoder that stops responding mid-export now retries in WebM. Closing or cancelling a stalled encoding job releases its resources. The paused preview redraws when media or fonts arrive and can otherwise stay idle.
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
