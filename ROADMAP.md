# Roadmap

Ideas and future phases. Nothing here is scheduled.

## Scenes and ideas
- **Party mode: go-go dancer silhouette** (maybe pole dancing): a life-size dancer silhouette on a beat-synced background. Ideas for how, in rough order of realism:
  - **Video → silhouette:** dancer footage (stock or filmed against a plain wall), segmented offline into a mask video (MediaPipe / rembg); the scene plays the mask, filled flat or rim-lit, over the background. Most realistic; the only practical route for pole work.
  - **Motion capture:** free dance mocap (Mixamo, CMU) driving a 2D/3D skeleton drawn as a filled silhouette. Fully generative timing (can follow the BPM), less natural.
  - **Procedural:** a hand-animated skeleton with sine-driven joints. Cheapest, looks robotic.
  - Background: colour washes and gradients on the beat (BPM tapped on the remote, or a mic on the box). Keep flashes slow (≤ 3 Hz, no full-wall strobe): it's a stairwell, and people walk it in the dark.

## Phase: public release
Not planned yet; what it would take to make the project usable by others.

### Before anything is public
- Publish from a fresh repo (clean tree), not this history: it has personal hosts, paths and wall configs.
- Don't ship copyrighted media: the Camden print's reference photo, the spotlight logo. Bundle CC0 or self-made demo media instead.
- Pick a licence for the code; credit vendored p5.js (LGPL) and any bundled media.
- One example wall with made-up dimensions; real walls stay private (local folder, ignored).

### Security (today it trusts the whole LAN)
- Pairing: a token/PIN (e.g. a QR code on the projected testcard) the remote scans once.
- Bind to localhost + LAN only; document "don't port-forward this".
- Endpoints that run processes (autocal, projector power, shutdown) take only fixed arguments, never request input.

### Hardware abstraction
- Projector control as drivers (`on`, `off`, `toHdmi`, `status`): `none` (default), `hdmi-cec` (`cec-ctl`, most universal), `pjlink`, `adb-allwinner` (today's).
- Autocal capture from a USB webcam next to the projector and/or a phone photo uploaded from the remote, instead of this projector's internal camera. Decode and fitting (camproj, find_print, find_wall) stay as they are.
- Autocal optional, with its Python deps (opencv, numpy) installed separately or in a container; the core stays Node + a browser.

### Setup experience
- Wall wizard in the remote: name, size in cm, optional panes and reference image → creates `walls/<name>/`.
- Validate wall configs at load with clear errors; version calibration files so they can be migrated.
- Install script for one supported target (Debian/Ubuntu/Mint + Chromium kiosk + systemd), no hardcoded user, paths, port or repo name in `deploy/`; others as "community".
- First run with no walls opens the testcard and the wizard.

### Docs
- Quick start: laptop + any projector, manual calibration, ~15 minutes.
- Hardware guide: portrait mounting, throw-ratio maths, black level and spill.
- Scene and frame API (`setup`/`draw`/`dispose`, wall space, cm units) with a minimal example.
- Troubleshooting from experience: HDMI "no signal" reselect, GPU-canvas compositing, tinted lens film.

### Quality
- More `node --test` coverage (warp, config loading, command bus), plus a headless render smoke test per scene.
- CI (GitHub Actions): tests + lint.
- An fps target and a low-power setting for weaker boxes.

Start with the projector drivers and webcam/phone-photo capture: they're what separates "this house" from "any house".
