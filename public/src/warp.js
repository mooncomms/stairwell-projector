// Homography math. Pure functions, no p5 — also imported by the Node tests.
//
// Wall space is the unit square: u → right, v → down, (0,0) = top-left corner of the wall.
// Output space is projector pixels, (0,0) = top-left of the projector frame.
// Matrices are 3x3 row-major arrays of 9 numbers.

// Square-to-quad homography (Heckbert's closed form).
// corners: [TL, TR, BR, BL] as {x, y} in output pixels.
export function squareToQuad(corners) {
  const [p0, p1, p2, p3] = corners;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w, w };
}

// Row-major → column-major, as GLSL mat3 uniforms expect.
export function toColumnMajor(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

// Brightness flattening support. For the inverse map (output px → wall uv),
// the wall area covered by one projector pixel is |det M| / |w|^3, where w is the
// homogeneous denominator. So pixels land darkest where |w| is smallest. Since w is
// linear, its extremes over the quad are at the corners: return the smallest |w|.
export function minCornerW(hinv, corners) {
  return Math.min(...corners.map((c) => Math.abs(apply(hinv, c.x, c.y).w)));
}

// True if the quad is convex and non-degenerate (a homography only makes sense then).
export function isConvexQuad(corners) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
