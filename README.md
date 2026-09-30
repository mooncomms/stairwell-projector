# stairwall

A projector turns the 1.2 × 2.4 m stairwell wall into a "window". Scenes are p5.js sketches that draw in wall space (a 1:2 buffer). A shader warps them onto the projector frame with a 4-corner homography and masks everything outside the wall to black.

```
npm start            # http://localhost:8080   (remote: http://<box-ip>:8080/remote)
npm test             # homography math
```

URL flags: `?scene=boids` · `?calibrate` · `?hud` · `?still` (freeze motion, for comparing scenes against their originals) · `?lids` (painting scene: hold eyelids shut) · `?seek=90` (destroyer scene: start 90 s into its loop)

## Calibrating on the wall
1. Mount the projector **rotated 90°** (portrait). Turn the projector's own keystone **off**.
2. Press `c`, or tap **Calibrate** on the phone remote. The grid test card appears.
3. Move the 4 corners (TL/TR/BR/BL) onto the wall's real corners. You can drag with a mouse, or use `Tab` plus the arrow keys (`shift` ×10, `alt` ×0.25 px). The phone remote's d-pad does the same.
4. Check the grid lines look square and the 1 m circle looks round. If an edge of the wall isn't straight, select a point and press `a` to add an edge point there, then move it to follow the edge. Edge points only bend the mask.
5. Press `p` to cycle patterns:
   - `white`: look for light spilling onto the side walls, and fix it with inset (`-` / `=`) or edge points.
   - `gray`: judge whether brightness is even.
   - `frame`: shows the whole projector frame, so you can see where the beam lands.
6. Press `,` and `.` to set **flatten**. It evens out brightness when the projector hits the wall at a steep angle, at the cost of peak brightness.
7. Calibration saves itself about a second after each change, and when you leave calibration (`s` also saves immediately). It's stored in `data/calibration.json` and loaded on every start.

Other keys: `←` / `→` previous / next scene (outside calibration) · `n` next scene · `1–9` pick scene · `b` blackout · `h` HUD/fps · `;` `'` brightness.

## Writing a scene
Create a file in `public/src/scenes/`, then add it to `SCENES` in `main.js` and to the `playlist` in `data/config.json`:

```js
export default {
  name: 'myscene',
  webgl: false,                  // true → g is a WEBGL buffer (for shaders)
  create(p, g, { W, H, pxPerM }) {
    // setup: p = p5 instance (noise, random…), g = your W×H wall-space buffer
    return {
      draw(t, dt) { g.background(0); /* … */ },
      dispose() {},              // free any extra buffers / videos
    };
  },
};
```

The top-left of `g` is the top-left corner of the wall, and `pxPerM` converts metres to pixels.

## Media
Put photos (`jpg`/`png`/`webp`) and videos (`mp4`/`webm`) in `media/`. The `nature` scene shuffles them, crops them to fill the wall, and plays them with slow zooms and crossfades. Portrait or 4K material works best. Pexels, Pixabay and NASA's image library are good free sources.

## Paintings
Put images in `media/paintings/`. The `painting` scene fits each one to the wall's width, sits it on the bottom edge, and grows the missing sky from the painting's own top edge. Tweak the look in `SKY` at the top of `public/src/scenes/painting.js`. The scene cycles through the paintings every `paintingSeconds`.

**Blinking:** add a sidecar file with the same name as the image (for example `american-gothic.json`) that lists each figure's eyes. Coordinates are `[centre x, centre y, width, height]` of each eye opening, in the image's own pixels:

```json
{ "blinkers": [ { "eyes": [[199, 330, 38, 14], [259, 333, 34, 12]], "every": [2.5, 6] } ] }
```

`every` is the random gap between blinks, in seconds. Open `?scene=painting&lids` to hold every lid shut while you check the positions.

## Live sky
The `sky` scene shows the real sky right now: sun position, colours, clouds, stars and moon phase. Set it up in `data/config.json` under `"sky"`:
- `lat` and `lon`: your location.
- `facing`: which way the "window" looks, in degrees (270 = west, so sunsets come into view).
- `clouds`: cloud cover, 0–1.

To preview a time, use `?scene=sky&hour=20.5`. `&speed=600` makes time run 600× faster.

## Deploying on the projector box
- Copy the repo to `~/stairwall` and install Node 18 or later plus Chromium.
- Install `deploy/stairwall.service` as a systemd user service (instructions are inside the file).
- Autostart `deploy/kiosk.sh` in the desktop session.
- `data/config.json`:
  - `playlist` and `sceneSeconds` (0 = never auto-advance)
  - `crossfadeSeconds`
  - `schedule` (`{"on":"18:00","off":"00:30"}`, fades to black outside those hours)
  - `contentHeight` (buffer resolution)
