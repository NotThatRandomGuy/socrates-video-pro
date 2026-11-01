# 1.1.0 review and verification

The review covers the project's state and history, project loading and recovery, media import and recording, timeline commands and pointer interactions, keyframes, preview playback, canvas cropping and alignment, WebGL effects, audio playback and offline mixing, export and muxing, dialogs, and desktop permissions and packaging.

The 100 automated checks exercise generated and recorded media, linked clips, trimming/splitting/ripple edits, animation, effects, crop pixels, center snapping, save/load and undo, malformed projects, file-picker cancellation, locked tracks, audio mute, recording cleanup, failure recovery, and actual MP4/WebM exports. Browser console errors fail the suites. Each suite uses its own temporary browser profile and local server. Packaged-desktop checks render a cropped composition and produce a small WebM inside the sandboxed application.

Windows checks run locally and in GitHub Actions. Linux browser checks, AppImage extraction/launch, and Debian installation/launch run on Ubuntu 22.04 in GitHub Actions. The Linux application keeps Chromium's sandbox enabled. Packaging checks use a virtual X11 display; they do not simulate every desktop environment.

## Limits of this review

- Automated checks cannot prove the absence of all bugs or exercise every codec, GPU, device, font, or project size.
- Physical microphone/camera selection, screen-sharing permission dialogs, Wayland/PipeWire portals, and hardware acceleration require testing on the user's actual desktop. Linux system-audio loopback is not supplied by this Electron capture integration; microphone capture remains available.
- Codec availability remains platform-dependent. Some Linux Electron builds do not provide the same proprietary codecs as Chrome; WebM is the compatible export fallback.
- Exports are assembled in memory. Large projects can exceed available memory. Browser media caches may be evicted; keep original media and saved project files.
- The updated development dependency tree still reports moderate upstream packaging-tool advisories. There are no runtime npm dependencies in the browser app. Replacing incompatible transitive libraries solely to silence an audit would risk the installer; revisit these advisories as upstream updates arrive.
- Local signatures establish integrity against the published certificate, not third-party identity validation. The certificate is self-signed and has no trusted timestamp. Never install it as a trusted root merely to suppress an operating-system warning.

See [CHANGELOG](../CHANGELOG.md) for the plain-English fixes and [README](../README.md) for reproduction commands and installation instructions.
