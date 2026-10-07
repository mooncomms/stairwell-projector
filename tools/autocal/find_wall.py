#!/usr/bin/env python3
"""Find a plain wall (no print) in the projector camera's white frame, and turn it into a
calibration: the wall's corners in projector pixels.

  find_wall.py RUN_DIR [--current calibration.json]

The wall faces the projector, so under white light it's brighter than the side walls,
ceiling and ledge around it, which the light hits at a grazing angle. Each of its four
edges is therefore a brightness step: left/right found row by row, top/bottom column by
column, each fitted as a straight line (RANSAC). Lines are taken through the measured
camera -> projector map and intersected in projector space.

An edge the camera can't see (the beam doesn't reach past it, or it's out of the camera's
view) is taken from --current (the existing calibration) instead, and reported.
Writes RUN_DIR/wall.json and RUN_DIR/wall.png.
"""
import json, sys, argparse
import numpy as np, cv2
from camproj import CamProj

ap = argparse.ArgumentParser()
ap.add_argument('run'); ap.add_argument('--current'); ap.add_argument('--photo', default='white')
ap.add_argument('--w', type=int, default=640); ap.add_argument('--h', type=int, default=480)
a = ap.parse_args()
W, H = a.w, a.h

luma = lambda n: np.fromfile(f'{a.run}/{n}.yuv', np.uint8).reshape(H, W, 2)[:, :, 0].astype(np.float32)
white, black = luma(a.photo), luma('black')
lit = cv2.erode(((white - black) > 20).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0   # away from the beam's edge
img = cv2.GaussianBlur(white, (0, 0), 2.0)
gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=5)
gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=5)
cp = CamProj(a.run, W, H)


def scan(axis, sign, lo, hi):
    """Per row (axis 'x') or column ('y'): the strongest brightness step of the given sign
    inside the lit area, between fractions lo..hi of the lit span."""
    pts = []
    g = gx if axis == 'x' else gy
    n = H if axis == 'x' else W
    for i in range(6, n - 6, 3):
        line = g[i, :] if axis == 'x' else g[:, i]
        m = lit[i, :] if axis == 'x' else lit[:, i]
        idx = np.nonzero(m)[0]
        if len(idx) < 30:
            continue
        a0, a1 = idx[0], idx[-1]
        s0, s1 = int(a0 + (a1 - a0) * lo), int(a0 + (a1 - a0) * hi)
        seg = sign * line[s0:s1] * m[s0:s1]
        if len(seg) < 5:
            continue
        j = int(np.argmax(seg))
        pts.append((s0 + j, i, float(seg[j])))       # (position along scan, index, strength)
    return pts


def fit(pts, tol=2.5):
    """RANSAC line pos = k * idx + c; returns (k, c, inlier share, rms, median strength)."""
    if len(pts) < 10:
        return None
    P = np.float64([(p, i) for p, i, _ in pts]); S = np.float64([s for *_, s in pts])
    rng = np.random.default_rng(1); best = None
    for _ in range(400):
        i, j = rng.choice(len(P), 2, replace=False)
        if abs(P[j, 1] - P[i, 1]) < 20:
            continue
        k = (P[j, 0] - P[i, 0]) / (P[j, 1] - P[i, 1]); c = P[i, 0] - k * P[i, 1]
        inl = np.abs(P[:, 0] - (k * P[:, 1] + c)) < tol
        if best is None or inl.sum() > best.sum():
            best = inl
    if best is None or best.sum() < 8:
        return None
    k, c = np.linalg.lstsq(np.c_[P[best, 1], np.ones(best.sum())], P[best, 0], rcond=None)[0]
    rms = float(np.sqrt(np.mean((P[best, 0] - (k * P[best, 1] + c)) ** 2)))
    return dict(k=float(k), c=float(c), share=float(best.mean()), rms=rms, strength=float(np.median(S[best])),
                span=(float(P[best, 1].min()), float(P[best, 1].max())))


edges = {
    'left': fit(scan('x', +1, 0.0, 0.5)),     # dark side wall -> bright wall, going right
    'right': fit(scan('x', -1, 0.5, 1.0)),    # bright wall -> dark side wall
    'top': fit(scan('y', +1, 0.0, 0.4)),      # dark ceiling -> bright wall, going down
    'bottom': fit(scan('y', -1, 0.6, 1.0)),   # bright wall -> dark ledge
}
# Trust an edge only if it's a clear, straight, consistent step, comparable to the
# strongest one, and not hugging the edge of the camera's view.
ref = max([e['strength'] for e in edges.values() if e] or [1])
for name, e in edges.items():
    if not e:
        continue
    lim = W if name in ('left', 'right') else H
    mid = e['c'] + e['k'] * ((H if name in ('left', 'right') else W) / 2)
    e['ok'] = bool(e['share'] > 0.7 and e['rms'] < 1.5 and e['strength'] > 0.3 * ref and 8 < mid < lim - 8)

# Lines in camera space -> points -> projector space -> fitted lines.
def cam_line_points(name, e):
    if name in ('left', 'right'):
        ys = np.linspace(max(4, e['span'][0]), min(H - 4, e['span'][1]), 25); xs = e['c'] + e['k'] * ys
    else:
        xs = np.linspace(max(4, e['span'][0]), min(W - 4, e['span'][1]), 25); ys = e['c'] + e['k'] * xs
    return np.c_[xs, ys]

def proj_line(pts):
    """Total-least-squares line through projector points: (point, direction)."""
    m = pts.mean(0); _, _, vt = np.linalg.svd(pts - m)
    return m, vt[0]

lines, used = {}, {}
for name, e in edges.items():
    if e and e['ok']:
        lines[name] = proj_line(cp(cam_line_points(name, e)).astype(np.float64)); used[name] = 'camera'

# Fallback for edges not seen: from the current calibration (corners TL TR BR BL).
if len(lines) < 4:
    if not a.current:
        sys.exit(f'only found {sorted(lines)} edges of the wall, and no current calibration to fill in the rest')
    cur = json.load(open(a.current))
    if not cur or 'corners' not in cur:
        sys.exit(f'only found {sorted(lines)} edges of the wall, and the current calibration has no corners')
    C = np.float64([[c['x'], c['y']] for c in cur['corners']])
    by_name = {'top': (C[0], C[1]), 'right': (C[1], C[2]), 'bottom': (C[3], C[2]), 'left': (C[0], C[3])}
    for name in ('left', 'right', 'top', 'bottom'):
        if name not in lines:
            p0, p1 = by_name[name]; d = p1 - p0
            lines[name] = (p0, d / np.linalg.norm(d)); used[name] = 'kept from current calibration'

def meet(l1, l2):
    (p, d), (q, e) = l1, l2
    A = np.c_[d, -e]
    t = np.linalg.solve(A, q - p)
    return p + t[0] * d

corners = [meet(lines['top'], lines['left']), meet(lines['top'], lines['right']),
           meet(lines['bottom'], lines['right']), meet(lines['bottom'], lines['left'])]
quad = np.float32(corners)
if not cv2.isContourConvex(quad.reshape(-1, 1, 2)):
    sys.exit('the wall edges found don\'t form a sensible outline; not using them')

out = {'corners': [{'x': round(float(x), 1), 'y': round(float(y), 1)} for x, y in corners],
       'edges': {n: ({'source': used[n], **({k: (round(v, 3) if isinstance(v, float) else v) for k, v in edges[n].items()} if edges.get(n) else {})})
                 for n in ('left', 'right', 'top', 'bottom')},
       'modelRmsPx': round(cp.model_rms, 2)}
json.dump(out, open(f'{a.run}/wall.json', 'w'), indent=2)

vis = cv2.cvtColor(white.astype(np.uint8), cv2.COLOR_GRAY2BGR)
for name, e in edges.items():
    if not e:
        continue
    col = (0, 255, 0) if e['ok'] else (0, 0, 255)
    if name in ('left', 'right'):
        cv2.line(vis, (int(e['c']), 0), (int(e['c'] + e['k'] * (H - 1)), H - 1), col, 1)
    else:
        cv2.line(vis, (0, int(e['c'])), (W - 1, int(e['c'] + e['k'] * (W - 1))), col, 1)
cv2.imwrite(f'{a.run}/wall.png', vis)
print(json.dumps({'corners': out['corners'], 'edges': {n: v['source'] for n, v in out['edges'].items()}}))
