"""Camera -> projector mapping from a decoded structured-light run (shared by the
autocal finders). Uses the measured map where it's dense, and a smooth model
(wall homography + cubic lens correction, fitted to all decoded pixels) elsewhere."""
import json
import numpy as np, cv2


class CamProj:
    def __init__(self, run, w=640, h=480):
        self.w, self.h = w, h
        self.cap = json.load(open(f'{run}/capture.json'))
        cmap = self.cmap = np.fromfile(f'{run}/map.bin', np.float32).reshape(h, w, 2)
        vy, vx = np.nonzero(~np.isnan(cmap[:, :, 0]))
        step = max(1, len(vx) // 20000)
        cx, cy = vx[::step].astype(np.float64), vy[::step].astype(np.float64)
        pv = cmap[vy[::step], vx[::step]].astype(np.float64)
        self.Hm, _ = cv2.findHomography(np.c_[cx, cy].astype(np.float32), pv.astype(np.float32), cv2.RANSAC, 6.0)
        hp = cv2.perspectiveTransform(np.c_[cx, cy].reshape(-1, 1, 2), self.Hm).reshape(-1, 2)
        res = pv - hp
        keep = np.hypot(res[:, 0], res[:, 1]) < 25          # ignore other surfaces / bad decodes
        P = self._poly(cx[keep], cy[keep])
        self.cfx, *_ = np.linalg.lstsq(P, res[keep, 0], rcond=None)
        self.cfy, *_ = np.linalg.lstsq(P, res[keep, 1], rcond=None)
        r2 = res[keep] - np.c_[P @ self.cfx, P @ self.cfy]
        self.model_rms = float(np.sqrt((r2 ** 2).sum(1).mean()))

    def _poly(self, x, y):
        u, v = (x - self.w / 2) / self.w, (y - self.h / 2) / self.h
        return np.c_[np.ones_like(u), u, v, u * u, u * v, v * v, u * u * u, u * u * v, u * v * v, v * v * v]

    def model(self, x, y):
        hp = cv2.perspectiveTransform(np.float64([[[x, y]]]), self.Hm).reshape(2)
        P = self._poly(np.float64([x]), np.float64([y]))
        return hp[0] + (P @ self.cfx)[0], hp[1] + (P @ self.cfy)[0]

    def __call__(self, pts):
        """Camera points -> projector points: a local affine fit of the measured map
        around each point, or the smooth model where the map is too sparse."""
        out = []
        for x, y in pts:
            xi, yi = int(round(x)), int(round(y))
            y0, y1, x0, x1 = max(0, yi - 4), min(self.h, yi + 5), max(0, xi - 4), min(self.w, xi + 5)
            win = self.cmap[y0:y1, x0:x1].reshape(-1, 2)
            gy, gx = np.mgrid[y0:y1, x0:x1]
            ok = ~np.isnan(win[:, 0])
            if ok.sum() < 6:
                out.append(self.model(x, y)); continue
            A = np.c_[gx.ravel()[ok], gy.ravel()[ok], np.ones(ok.sum())]
            cx, *_ = np.linalg.lstsq(A, win[ok, 0], rcond=None)
            cy, *_ = np.linalg.lstsq(A, win[ok, 1], rcond=None)
            out.append((cx @ [x, y, 1], cy @ [x, y, 1]))
        return np.float32(out)
