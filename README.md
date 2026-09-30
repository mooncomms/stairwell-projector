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
   - `levels`: dark and bright grey steps. Set the projector's **Brightness** (really its black level) as low as possible while step 2 or 4 is still visible, then raise **Contrast** until the top steps start merging with white, and back off one step.
   - `edges`: grey on the wall, red stripes everywhere else. Walk to where people actually look (for example halfway down the stairs). Red stripes on the back wall mean the edge must move out; grey on a side wall means it must move in. It's right when the colour change sits exactly on the corner line. Perspective can't fool this check, because the pattern lands on the real surfaces.
   - `white`: look for light spilling onto the side walls, and fix it with inset (`-` / `=`) or edge points.
   - `gray`: judge whether brightness is even.
   - `frame`: shows the whole projector frame, so you can see where the beam lands.
6. **Colour balance:** use the phone remote's Red/Green/Blue sliders to warm up a cold (blue) projector. Lower blue first, and green a little if needed.
7. Press `,` and `.` to set **flatten**. It evens out brightness when the projector hits the wall at a steep angle, at the cost of peak brightness.
8. Calibration saves itself about a second after each change, and when you leave calibration (`s` also saves immediately). It's stored in `data/calibration.json` and loaded on every start.

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

## The always-on box
Any small Linux PC that can run Chromium with GPU acceleration works. An Intel Gemini Lake box such as an MSI Cubi N is fine; check the fps with `h`.

**One-time setup, on the box:**
1. Install Node 22 system-wide, plus Chromium and git:
   `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs chromium git openssh-server avahi-daemon`
   (Use the system package, not nvm: the service needs to find `node` at boot.)
2. Clone and install: `git clone https://github.com/mooncomms/stairwell-projector.git ~/stairwall && cd ~/stairwall && ./deploy/install.sh`
   There's nothing to build. This sets up the server service (starts at boot) and the kiosk browser (starts at login).
3. In the desktop settings: enable **automatic login**, and turn off **screen blanking, screensaver and suspend**.
4. Copy your calibration and media from the old machine:
   `scp data/calibration.json box:~/stairwall/data/` and `scp -r media box:~/stairwall/`
5. Optionally, rename the box so it's easy to find: `sudo hostnamectl set-hostname stairwall` (then it's `stairwall.local` on the network).
6. In the BIOS, set **"restore on AC power loss" → on**, so it comes back after a power cut.

**Day to day:**
- **Phone remote:** `http://stairwall.local:8080/remote`, or use the box's IP address.
- **Updating from your laptop:** push to GitHub, then run `ssh stairwall.local '~/stairwall/deploy/update.sh'`. It pulls, restarts the server and reloads the projector page.
- **Editing directly on the box:** VS Code's Remote-SSH works well.
- The server has no password, so keep it to your home network and don't forward port 8080 on your router. For access away from home, use a VPN such as Tailscale.

**Power:**
- The phone remote has **Sleep** and **Shut down** buttons. Shut down fades the wall to black first. `install.sh` allows this without a password.
- **Waking from the phone (Wake-on-LAN):** this needs the box on **wired Ethernet**, since Wi-Fi wake is rarely supported.
  1. Enable "Wake on LAN" (sometimes called "PCIE PME wake") in the BIOS. For waking from full shutdown, also disable "ErP".
  2. Make it persistent in Linux: `nmcli connection modify "<wired connection>" 802-3-ethernet.wake-on-lan magic`.
  3. On the phone, install any Wake-on-LAN app and give it the box's MAC address (`ip link` shows it).
- **Waking with a remote control:** a cheap 2.4 GHz "air mouse" remote with a USB dongle acts as a keyboard. Its arrow keys change scenes, and its power button can wake the box from sleep once "USB wake" is enabled in the BIOS.

**Settings** (`data/config.json`):
- `playlist` and `sceneSeconds` (0 = never auto-advance)
- `crossfadeSeconds`
- `schedule` (`{"on":"18:00","off":"00:30"}`, fades to black outside those hours)
- `contentHeight` (buffer resolution)
- `sky` (see Live sky)
