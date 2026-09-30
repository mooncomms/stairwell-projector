import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareToQuad, invert3, apply, toColumnMajor, minCornerW, isConvexQuad } from '../public/src/warp.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const quads = {
  rect: [{ x: 100, y: 50 }, { x: 700, y: 50 }, { x: 700, y: 1250 }, { x: 100, y: 1250 }],
  keystone: [{ x: 300, y: 100 }, { x: 900, y: 80 }, { x: 1000, y: 1000 }, { x: 150, y: 1020 }],
  rotated: [{ x: 1800, y: 200 }, { x: 1790, y: 900 }, { x: 200, y: 950 }, { x: 180, y: 180 }],
};
const unit = [[0, 0], [1, 0], [1, 1], [0, 1]];

for (const [name, q] of Object.entries(quads)) {
  test(`${name}: unit square corners map onto the quad`, () => {
    const H = squareToQuad(q);
    unit.forEach(([u, v], i) => {
      const p = apply(H, u, v);
      close(p.x, q[i].x);
      close(p.y, q[i].y);
    });
  });

  test(`${name}: inverse round-trips`, () => {
    const H = squareToQuad(q);
    const Hi = invert3(H);
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [0.77, 0.23]]) {
      const p = apply(H, u, v);
      const back = apply(Hi, p.x, p.y);
      close(back.x, u);
      close(back.y, v);
    }
  });

  test(`${name}: is convex`, () => assert.ok(isConvexQuad(q)));
}

test('straight lines stay straight', () => {
  const H = squareToQuad(quads.keystone);
  const a = apply(H, 0.2, 0.3), b = apply(H, 0.5, 0.6), c = apply(H, 0.8, 0.9);
  close((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), 0, 1e-6);
});

test('column-major transpose', () => {
  assert.deepEqual(toColumnMajor([1, 2, 3, 4, 5, 6, 7, 8, 9]), [1, 4, 7, 2, 5, 8, 3, 6, 9]);
});

test('flattening: rectangle has uniform pixel area; keystone does not', () => {
  const r = invert3(squareToQuad(quads.rect));
  close(minCornerW(r, quads.rect), Math.abs(apply(r, 400, 600).w));
  const k = invert3(squareToQuad(quads.keystone));
  const ws = quads.keystone.map((c) => Math.abs(apply(k, c.x, c.y).w));
  assert.ok(Math.max(...ws) / Math.min(...ws) > 1.05);
});

test('degenerate / non-convex quads are rejected', () => {
  assert.ok(!isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]));
  assert.ok(!isConvexQuad([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]));
});
