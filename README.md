# stairwall

A projector turns the 1.2 × 2.4 m stairwell wall into a "window". Scenes are p5.js sketches that draw in wall space (a 1:2 buffer). A shader warps them onto the projector frame with a 4-corner homography and masks everything outside the wall to black.

```
npm start            # http://localhost:8080   (remote: http://<box-ip>:8080/remote)
npm test             # homography math
```

URL flags: `?scene=boids` · `?calibrate` · `?hud`

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
7. Press `s` to save. The calibration is stored in `data/calibration.json`.

Other keys: `n` next scene · `1–9` pick scene · `b` blackout · `h` HUD/fps · `;` `'` brightness.

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

## Deploying on the projector box
- Copy the repo to `~/stairwall` and install Node 18 or later plus Chromium.
- Install `deploy/stairwall.service` as a systemd user service (instructions are inside the file).
- Autostart `deploy/kiosk.sh` in the desktop session.
- `data/config.json`:
  - `playlist` and `sceneSeconds` (0 = never auto-advance)
  - `crossfadeSeconds`
  - `schedule` (`{"on":"18:00","off":"00:30"}`, fades to black outside those hours)
  - `contentHeight` (buffer resolution)
