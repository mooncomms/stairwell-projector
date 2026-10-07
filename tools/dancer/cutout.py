#!/usr/bin/env python3
"""Cut a dancer out of a video clip, as per-frame vector outlines for the `party` scene.

  cutout.py CLIP.mp4 OUT.json --method dark|shadow|person [options]

Methods:
  dark    a dark figure on a bright, saturated background (a silhouette shot): keyed on the
          red channel (works for any background with plenty of red: red, orange, white).
  shadow  a shadow on a round spotlight disc (orange light, no blue): the lit disc is found
          over the whole clip, the shadow is the unlit part of it. Also stores the disc.
  person  anything else: MediaPipe person segmentation (hair, skin, clothes) kept only
          where MediaPipe's pose model sees the dancer, so props and furniture drop out.

Options:
  --crop X0,X1        (person) horizontal part of the frame to segment, as fractions
  --pole X            (pole clips) the pole's x in the first frame, in pixels: it's then
                      tracked through the clip, so the scene can pin the dancer to its pole
  --pole-band Y0,Y1   rows (fractions) where the pole is visible and the dancer rarely is
  --floor Y           the pole's base (fraction of the height), if not the bottom of the band
  --full-body         keep only stretches where the whole figure is in frame
  --px-per-m N        source pixels per metre at the dancer (for life-size display)

Output: { fps, w, h, frames: [[ring, …], …] (rings: flat [x, y, …], holes included, fill
even-odd), segments: [[first, last], …], anchor: {x: [...], y: [...]} per frame (pole or
feet), pxPerM, disc?, pole? }.

Needs: pip install opencv-python-headless mediapipe (models are fetched on first use).
"""
import argparse, json, os, sys, urllib.request
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument('clip'); ap.add_argument('out')
ap.add_argument('--method', required=True, choices=['dark', 'shadow', 'person'])
ap.add_argument('--crop', default='0,1')
ap.add_argument('--pole', type=int)
ap.add_argument('--pole-band', default='0.85,0.93')
ap.add_argument('--floor', type=float, help='(pole clips) the pole\'s base, as a fraction of the height (default: bottom of --pole-band)')
ap.add_argument('--full-body', action='store_true')
ap.add_argument('--px-per-m', type=float, default=0)
ap.add_argument('--eps', type=float, default=1.2, help='outline simplification, px')
ap.add_argument('--models', default=os.path.join(os.path.dirname(__file__), '../../data/dancer/models'))
a = ap.parse_args()

MODELS = {
    'selfie_multiclass.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
    'pose_heavy.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
}

def model(name):
    path = os.path.join(a.models, name)
    if not os.path.exists(path):
        os.makedirs(a.models, exist_ok=True)
        print(f'fetching {name}…', file=sys.stderr)
        urllib.request.urlretrieve(MODELS[name], path)
    return path

v = cv2.VideoCapture(a.clip)
fps, W, H = v.get(cv2.CAP_PROP_FPS), int(v.get(cv2.CAP_PROP_FRAME_WIDTH)), int(v.get(cv2.CAP_PROP_FRAME_HEIGHT))
frames = []
while True:
    ok, im = v.read()
    if not ok:
        break
    frames.append(im)
N = len(frames)
print(f'{a.clip}: {W}x{H} {fps:.2f} fps, {N} frames', file=sys.stderr)
clamp = lambda x: np.clip(x, 0, 1)

# ---- per-frame alpha (0..1, 1 = dancer) ----
extra = {}
if a.method == 'dark':
    alphas = [clamp((140 - im[:, :, 2].astype(np.float32)) / 80) for im in frames]

elif a.method == 'shadow':
    # The disc's orange light has no blue at all; the shadow and the room around it do.
    lit = [clamp((14 - im[:, :, 0].astype(np.float32)) / 8) for im in frames]
    union = (np.max(np.stack(lit[::3]), axis=0) > 0.5).astype(np.uint8)
    cnts, _ = cv2.findContours(union, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    # The disc is an ellipse in the picture (seen at an angle); keep a little inside its
    # rim, where the light fades out and would read as shadow.
    big = cv2.convexHull(max(cnts, key=cv2.contourArea))
    (cx, cy), (ew, eh), ang = cv2.fitEllipse(big)
    ew, eh = ew * 0.95, eh * 0.95
    disc = np.zeros((H, W), np.float32)
    cv2.ellipse(disc, ((cx, cy), (ew, eh), ang), 1, -1, cv2.LINE_AA)
    alphas = [disc * (1 - l) for l in lit]
    extra['disc'] = {'x': round(cx, 1), 'y': round(cy, 1), 'rx': round(ew / 2, 1), 'ry': round(eh / 2, 1), 'angle': round(ang, 1)}

else:
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mpt.BaseOptions(model_asset_path=model('selfie_multiclass.tflite')),
        running_mode=vision.RunningMode.IMAGE, output_confidence_masks=True))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model('pose_heavy.task')),
        running_mode=vision.RunningMode.VIDEO, output_segmentation_masks=True, num_poses=1))
    x0, x1 = (int(float(f) * W) for f in a.crop.split(','))
    alphas, last_pm, k = [], None, np.ones((31, 31), np.uint8)
    for i, im in enumerate(frames):
        crop = np.ascontiguousarray(cv2.cvtColor(im[:, x0:x1], cv2.COLOR_BGR2RGB))
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)
        m = 1 - np.squeeze(seg.segment(img).confidence_masks[0].numpy_view())
        pr = pose.detect_for_video(img, int(i * 1000 / fps))
        if pr.segmentation_masks:
            last_pm = cv2.dilate((np.squeeze(pr.segmentation_masks[0].numpy_view()) > 0.3).astype(np.uint8), k)
        near = last_pm if last_pm is not None else np.ones_like(m, np.uint8)
        full = np.zeros((H, W), np.float32)
        full[:, x0:x1] = m * cv2.GaussianBlur(near.astype(np.float32), (0, 0), 4)
        alphas.append(full)
        if i % 50 == 0:
            print(f'  {i}/{N}', file=sys.stderr)

# ---- temporal smoothing (less edge boil), threshold, clean up ----
def cleanup(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return mask
    areas = st[1:, cv2.CC_STAT_AREA]; big = 1 + int(np.argmax(areas))
    bx, by, bw, bh = st[big, :4]; pad = 40
    keep = np.zeros(n, bool); keep[big] = True
    for j in range(1, n):
        x, y, w, h, ar = st[j]
        if ar >= 0.02 * areas.max() and x < bx + bw + pad and x + w > bx - pad and y < by + bh + pad and y + h > by - pad:
            keep[j] = True
    return keep[lab].astype(np.uint8)

masks, out_frames, boxes = [], [], []
for i in range(N):
    al = 0.25 * alphas[max(0, i - 1)] + 0.5 * alphas[i] + 0.25 * alphas[min(N - 1, i + 1)]
    m = cleanup((al > 0.5).astype(np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    masks.append(m)
    cnts, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    rings = []
    for c in cnts:
        if cv2.contourArea(c) < 30:
            continue
        p = cv2.approxPolyDP(c, a.eps, True).reshape(-1, 2)
        if len(p) >= 3:
            rings.append([int(v) for v in p.flatten()])
    out_frames.append(rings)
    ys, xs = np.nonzero(m)
    boxes.append((xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None)

# ---- usable stretches ----
ok = [b is not None for b in boxes]
if a.full_body:
    ok = [b is not None and b[1] > 3 and b[3] < H - 5 and b[0] > 3 and b[2] < W - 4 for b in boxes]
segments, start = [], None
for i, f in enumerate(ok + [False]):
    if f and start is None:
        start = i
    if not f and start is not None:
        if i - start >= fps:            # at least a second
            segments.append([start, i - 1])
        start = None

# ---- anchor: the pole (tracked), or the feet ----
def smooth(xs, r):
    xs = np.float64(xs); k = np.ones(2 * r + 1) / (2 * r + 1)
    return np.convolve(np.pad(xs, r, mode='edge'), k, mode='valid')

if a.pole is not None:
    y0, y1 = (float(f) for f in a.pole_band.split(','))
    px, prev = [], a.pole
    for i, im in enumerate(frames):
        band = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)[int(y0 * H):int(y1 * H)].astype(np.float32)
        P = np.median(cv2.Sobel(band, cv2.CV_32F, 1, 0, ksize=3), axis=0)
        best, bx = -1, prev
        for x in range(max(10, prev - 30), min(W - 10, prev + 30)):
            for w in range(5, 16):
                l, r = x - w // 2, x + (w + 1) // 2
                s = abs(P[l] - P[r]) if np.sign(P[l]) != np.sign(P[r]) else 0
                if s > best:
                    best, bx = s, x
        prev = bx; px.append(bx)
    ax = smooth(np.convolve(np.pad(px, 3, mode='edge'), np.ones(7) / 7, 'valid'), 3)   # jitter out
    if np.ptp(ax) < 25:                                                   # a static camera
        ax = np.full(N, float(np.median(px)))
    # The pole's base (floor or stage): given, or the bottom of the band.
    ay = np.full(N, (a.floor if a.floor is not None else y1) * H)
    extra['pole'] = True
else:
    feet = [b[3] if b else H for b in boxes]
    cxs = [(b[0] + b[2]) / 2 if b else W / 2 for b in boxes]
    # Feet: the floor under them, so a jump lifts the figure (a running max over ~1 s).
    r = int(fps / 2)
    ay = np.array([max(feet[max(0, i - r):i + r + 1]) for i in range(N)], float)
    ax = smooth(cxs, int(fps))
    if a.method == 'shadow':
        ax, ay = np.full(N, extra['disc']['x']), np.full(N, extra['disc']['y'])

out = {'source': os.path.basename(a.clip), 'method': a.method, 'fps': round(fps, 3), 'w': W, 'h': H,
       'pxPerM': a.px_per_m or None, 'segments': segments,
       'anchor': {'x': [round(float(x), 1) for x in ax], 'y': [round(float(y), 1) for y in ay]},
       **extra, 'frames': out_frames}
with open(a.out, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
pts = sum(len(r) // 2 for fr in out_frames for r in fr)
print(f'{a.out}: {N} frames, {pts / max(1, N):.0f} pts/frame, segments {segments}, {os.path.getsize(a.out) / 1e6:.1f} MB', file=sys.stderr)

# Diagnostic sheet: outlines over 8 frames.
tiles = []
for k in range(8):
    i = int(N * (k + 0.5) / 8); vis = (frames[i] * 0.5).astype(np.uint8)
    for r in out_frames[i]:
        cv2.polylines(vis, [np.int32(r).reshape(-1, 1, 2)], True, (0, 255, 0), 2)
    cv2.line(vis, (int(ax[i]), 0), (int(ax[i]), H), (255, 0, 255), 1)
    cv2.circle(vis, (int(ax[i]), int(ay[i])), 8, (0, 255, 255), 2)
    tiles.append(cv2.resize(vis, (int(240 * W / H), 240)))
cv2.imwrite(os.path.splitext(a.out)[0] + '.png', np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])]))
