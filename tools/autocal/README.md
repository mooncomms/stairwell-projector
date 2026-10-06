# autocal: automatic calibration with the projector's own camera

The HY320's built-in camera sits next to the lens and sees the whole projected area. This tool projects patterns, photographs them with that camera, works out exactly which projector pixel lands where, then finds the wall's print and writes the calibration.

## How it works
1. **Capture** (`capture.mjs`, ~25 s): `public/autocal.html` shows white, black and 11-bit Gray codes for x and y, each with its inverse. The camera grabs each frame over adb (`camgrab serve`, manual exposure).
2. **Decode** (`decode.mjs`): for each camera pixel, the projector pixel it sees. Bits are compared pattern-vs-inverse, and stripes too fine for the camera are dropped. The output also includes a RANSAC plane fit.
3. **Find the print** (`find_print.py`, OpenCV SIFT):
   - Features are matched between the reference image and the camera's white frame.
   - Each camera match is taken through the measured map, so lens distortion is included.
   - A homography reference → projector is fitted, giving the corners in projector pixels.
   - With `--panels`, each pane is also fitted on its own, giving per-pane shift and scale.
4. **Write the calibration** (`run.mjs --apply`): corners, plus per-pane corrections; other settings are kept.

## Accuracy (studio test, 2026-10-06)
- **Plane fit:** 0.67 camera px RMS.
- **Dots check** (`verify-dots.mjs`): median 2 projector px, max 4.5.
- **Synthetic print** (`synth-print.mjs`: the reference projected at a known place, then found): corners within **0.3–1.2 projector px**.

## Running it
- **Requirements:**
  - The stairwall server, with the wall active.
  - The projector page open (the kiosk). `run.mjs` switches it to `autocal.html` for the capture and back afterwards.
  - The projector on USB debugging, with camgrab pushed there (`tools/camgrab/snap.sh` does it).
  - The tools venv with OpenCV: `python3 -m venv data/tools/venv && data/tools/venv/bin/pip install opencv-python-headless numpy`.
- **Command:** `node tools/autocal/run.mjs --apply`. Add `--adb`, `--serial`, `--port` or `--exposure` as needed.
- **Output:** each run's data goes to `data/autocal/<wall>-<time>/`, including the previous calibration.

## Not yet
- Walls without a print (the stairwell). There, the wall's edges have to be found instead.
