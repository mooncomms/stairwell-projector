// Small geometry helpers for autocal: homographies from point pairs.

// Solve A x = b (n × n) by Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Homography H (row-major 9, h33 = 1) mapping src[i] → dst[i]; least squares for > 4
// points (normal equations over a normalised frame for stability).
export function homographyDLT(src, dst) {
  const norm = (pts) => {
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const s = Math.SQRT2 / (pts.reduce((a, p) => a + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length || 1);
    return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], f: (p) => [s * (p[0] - mx), s * (p[1] - my)] };
  };
  const ns = norm(src), nd = norm(dst);
  const A = Array.from({ length: 8 }, () => new Array(8).fill(0)), b = new Array(8).fill(0);
  src.forEach((sp, i) => {
    const [x, y] = ns.f(sp), [u, v] = nd.f(dst[i]);
    for (const [row, rhs] of [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]]) {
      for (let r = 0; r < 8; r++) { b[r] += row[r] * rhs; for (let c = 0; c < 8; c++) A[r][c] += row[r] * row[c]; }
    }
  });
  const h = solve(A, b);
  if (!h) return null;
  const Hn = [...h, 1];
  // Undo normalisation: H = Td⁻¹ · Hn · Ts.
  const inv = (T) => [1 / T[0], 0, -T[2] / T[0], 0, 1 / T[4], -T[5] / T[4], 0, 0, 1];
  const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  const H = mul(inv(nd.T), mul(Hn, ns.T));
  return H.map((v) => v / H[8]);
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertH(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
