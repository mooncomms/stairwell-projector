#!/usr/bin/env python3
"""Find a known print (the wall's reference image) in a photo from the projector's
camera, and turn it into a calibration: the print's corners in projector pixels.

  find_print.py RUN_DIR PHOTO.yuv REFERENCE.jpg [--panels walls/camden/config.json]

RUN_DIR holds a decoded structured-light run (map.bin: camera -> projector). Writes RUN_DIR/print.json and RUN_DIR/print.png (diagnostic).

With --panels, each pane is also matched on its own, giving per-pane content shift
and scale (the calibration's panelShift / panelScale), in cm.
"""
import json, sys, argparse
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument('run'); ap.add_argument('photo'); ap.add_argument('reference')
ap.add_argument('--panels'); ap.add_argument('--w', type=int, default=640); ap.add_argument('--h', type=int, default=480)
a = ap.parse_args()

raw = np.fromfile(a.photo, np.uint8).reshape(a.h, a.w, 2)
cam = raw[:, :, 0].copy()                                   # luma
ref = cv2.imread(a.reference, cv2.IMREAD_GRAYSCALE)
RH, RW = ref.shape
# Measured camera -> projector correspondence (includes the camera's lens distortion,
# which a plain plane homography would miss).
cap = json.load(open(f'{a.run}/capture.json'))
cmap = np.fromfile(f'{a.run}/map.bin', np.float32).reshape(a.h, a.w, 2)

# Smooth model camera -> projector from every decoded pixel: a homography (the wall
# plane) plus a quadratic correction for lens distortion. Used where the print is too
# dark for the stripe patterns to decode.
_vy, _vx = np.nonzero(~np.isnan(cmap[:, :, 0]))
_step = max(1, len(_vx) // 20000)
_cx, _cy = _vx[::_step].astype(np.float64), _vy[::_step].astype(np.float64)
_pv = cmap[_vy[::_step], _vx[::_step]].astype(np.float64)
_Hm, _ = cv2.findHomography(np.c_[_cx, _cy].astype(np.float32), _pv.astype(np.float32), cv2.RANSAC, 6.0)
def _poly(x, y):
    u, v = (x - a.w / 2) / a.w, (y - a.h / 2) / a.h
    return np.c_[np.ones_like(u), u, v, u * u, u * v, v * v, u * u * u, u * u * v, u * v * v, v * v * v]
_hp = cv2.perspectiveTransform(np.c_[_cx, _cy].reshape(-1, 1, 2).astype(np.float64), _Hm).reshape(-1, 2)
_res = _pv - _hp
_keep = np.hypot(_res[:, 0], _res[:, 1]) < 25          # ignore other surfaces / bad decodes
_cfx, *_ = np.linalg.lstsq(_poly(_cx[_keep], _cy[_keep]), _res[_keep, 0], rcond=None)
_cfy, *_ = np.linalg.lstsq(_poly(_cx[_keep], _cy[_keep]), _res[_keep, 1], rcond=None)
def model(x, y):
    hp = cv2.perspectiveTransform(np.float64([[[x, y]]]), _Hm).reshape(2)
    P = _poly(np.float64([x]), np.float64([y]))
    return hp[0] + (P @ _cfx)[0], hp[1] + (P @ _cfy)[0]
_r2 = _res[_keep] - np.c_[_poly(_cx[_keep], _cy[_keep]) @ _cfx, _poly(_cx[_keep], _cy[_keep]) @ _cfy]
MODEL_RMS = float(np.sqrt((_r2 ** 2).sum(1).mean()))

def cam2proj(pts):
    out = []
    for x, y in pts:
        xi, yi = int(round(x)), int(round(y))
        y0, y1, x0, x1 = max(0, yi - 4), min(a.h, yi + 5), max(0, xi - 4), min(a.w, xi + 5)
        win = cmap[y0:y1, x0:x1].reshape(-1, 2)
        gy, gx = np.mgrid[y0:y1, x0:x1]
        ok = ~np.isnan(win[:, 0])
        if ok.sum() < 6:
            out.append(model(x, y)); continue
        # Local affine fit camera -> projector over the window, evaluated at (x, y).
        A = np.c_[gx.ravel()[ok], gy.ravel()[ok], np.ones(ok.sum())]
        cx, *_ = np.linalg.lstsq(A, win[ok, 0], rcond=None)
        cy, *_ = np.linalg.lstsq(A, win[ok, 1], rcond=None)
        out.append((cx @ [x, y, 1], cy @ [x, y, 1]))
    return np.float32(out)

# Contrast-normalise both (the camera sees projected/reflected light, the reference is a file).
clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
cam_n = clahe.apply(cam)
scale = 600 / max(RH, RW)                                   # reference at roughly camera scale
ref_s = clahe.apply(cv2.resize(ref, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA))

sift = cv2.SIFT_create(nfeatures=4000)
kr, dr = sift.detectAndCompute(ref_s, None)
kc, dc = sift.detectAndCompute(cam_n, None)
matcher = cv2.BFMatcher(cv2.NORM_L2)

def match(mask_rect=None):
    """Homography reference (px of the full-size reference) -> projector px, fitted
    to matched features after taking each one through the measured camera map."""
    pairs = []
    for m, n in matcher.knnMatch(dr, dc, k=2):
        if m.distance < 0.75 * n.distance:
            x, y = kr[m.queryIdx].pt
            if mask_rect and not (mask_rect[0] <= x / scale < mask_rect[2] and mask_rect[1] <= y / scale < mask_rect[3]):
                continue
            pairs.append(((x / scale, y / scale), kc[m.trainIdx].pt))
    if len(pairs) < 8:
        return None, len(pairs), 0
    src = np.float32([p[0] for p in pairs]); dst = cam2proj([p[1] for p in pairs])
    ok = ~np.isnan(dst[:, 0])
    src, dst = src[ok], dst[ok]
    if len(src) < 8:
        return None, len(pairs), 0
    H, inl = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, 10.0)   # ≈ 2 camera px
    return H, len(pairs), int(inl.sum()) if inl is not None else 0

H_rp, n_pairs, n_inl = match()
if H_rp is None or n_inl < 30:
    sys.exit(f'print not found in the photo ({n_pairs} candidate matches, {n_inl} consistent; need 30+). '
             'Is the projector aimed at the print, with the print well lit?')

# For the diagnostic outline only: projector -> camera via the wall plane's homography.
H_pc = np.array(json.load(open(f'{a.run}/decode.json'))['plane']['H'], float).reshape(3, 3)
corners_ref = [(0, 0), (RW, 0), (RW, RH), (0, RH)]            # TL TR BR BL
proj = cv2.perspectiveTransform(np.float32(corners_ref).reshape(-1, 1, 2), H_rp).reshape(-1, 2)
quad = proj.reshape(-1, 1, 2)
if not cv2.isContourConvex(np.float32(quad)) or cv2.contourArea(np.float32(quad)) < 0.02 * cap['screen']['w'] * cap['screen']['h']:
    sys.exit('print found, but the fit is implausible (folded or tiny); not using it')
camc = cv2.perspectiveTransform(proj.reshape(-1, 1, 2), H_pc).reshape(-1, 2)
out = {'matches': n_pairs, 'inliers': n_inl, 'modelRmsPx': round(MODEL_RMS, 2),
       'corners': [{'x': round(float(x), 1), 'y': round(float(y), 1)} for x, y in proj],
       'cameraCorners': [[round(float(x), 1), round(float(y), 1)] for x, y in camc]}

# Per-pane refinement: match features inside each pane alone, then express the pane's
# own fit as a shift + scale (in cm) relative to the whole-print fit, at the pane centre.
if a.panels:
    cfg = json.load(open(a.panels))
    cmW, cmH = cfg['wall']['widthM'] * 100, cfg['wall']['heightM'] * 100
    kx, ky = RW / cmW, RH / cmH
    shifts, scales, info = [], [], []
    for p in cfg.get('panels', []):
        rect = (p['x'] * kx, p['y'] * ky, (p['x'] + p['w']) * kx, (p['y'] + p['h']) * ky)
        Hp, n, inl = match(rect)
        if Hp is None or inl < 15:          # too few features (sky, plain road): leave as is
            shifts.append([0, 0]); scales.append([1, 1]); info.append({'inliers': inl, 'used': False}); continue
        # Where the pane's corners land with its own fit, mapped back into the whole-print
        # fit's reference coordinates: that's how the pane's picture is displaced.
        pc = [(rect[0], rect[1]), (rect[2], rect[1]), (rect[2], rect[3]), (rect[0], rect[3])]
        proj_pane = cv2.perspectiveTransform(np.float32(pc).reshape(-1, 1, 2), Hp)
        back = cv2.perspectiveTransform(proj_pane, np.linalg.inv(H_rp)).reshape(-1, 2) / [kx, ky]   # in cm
        cx, cy = (p['x'] + p['w'] / 2), (p['y'] + p['h'] / 2)
        bx, by = back[:, 0].mean(), back[:, 1].mean()
        sx = (back[1, 0] - back[0, 0] + back[2, 0] - back[3, 0]) / 2 / p['w']
        sy = (back[3, 1] - back[0, 1] + back[2, 1] - back[1, 1]) / 2 / p['h']
        # The engine samples content at ctr + (uv - ctr - shift) / scale; the print shows
        # the pane displaced by (b - c) and scaled by s, so use the same shift and scale.
        sh, sc = [float(bx - cx), float(by - cy)], [float(sx), float(sy)]
        if max(abs(sh[0]), abs(sh[1])) > 5 or not all(0.85 < v < 1.15 for v in sc):
            # A canvas can't be that far off; treat it as a bad fit.
            shifts.append([0, 0]); scales.append([1, 1]); info.append({'inliers': inl, 'used': False, 'rejected': [sh, sc]}); continue
        shifts.append([round(sh[0], 2), round(sh[1], 2)])
        scales.append([round(sc[0], 3), round(sc[1], 3)])
        info.append({'inliers': inl, 'used': True})
    out.update(panelShift=shifts, panelScale=scales, panes=info)

json.dump(out, open(f'{a.run}/print.json', 'w'), indent=2)
vis = cv2.cvtColor(cam, cv2.COLOR_GRAY2BGR)
cv2.polylines(vis, [np.int32(camc).reshape(-1, 1, 2)], True, (255, 0, 255), 2)
for (x, y), lab in zip(camc, ['TL', 'TR', 'BR', 'BL']):
    cv2.putText(vis, lab, (int(x) + 4, int(y) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
cv2.imwrite(f'{a.run}/print.png', vis)
print(json.dumps({k: out[k] for k in ('matches', 'inliers', 'corners')}))
