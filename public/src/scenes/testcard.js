// Calibration test card, in real-world units: fine lines every 10 cm, bold every 50 cm,
// a 1 m circle (must look round on the wall), and a gray ramp to judge brightness.
const testcard = {
  name: 'testcard',
  create(p, g, { W, H, pxPerM }) {
    function render() {
      g.background(0);
      g.strokeCap(p.SQUARE);
      for (let cm = 0; cm * pxPerM / 100 <= Math.max(W, H) + 1; cm += 10) {
        const d = cm * pxPerM / 100;
        const bold = cm % 50 === 0;
        g.stroke(bold ? 200 : 90);
        g.strokeWeight(bold ? 2 : 1);
        if (d <= W) g.line(d, 0, d, H);
        if (d <= H) g.line(0, d, W, d);
      }
      // Edge lines, exactly on the wall border — these should kiss the wall's corners.
      g.noFill();
      g.strokeWeight(4);
      g.stroke(255, 40, 40); g.line(0, 2, W, 2);           // top: red
      g.stroke(40, 255, 40); g.line(W - 2, 0, W - 2, H);   // right: green
      g.stroke(40, 120, 255); g.line(0, H - 2, W, H - 2);  // bottom: blue
      g.stroke(255, 220, 0); g.line(2, 0, 2, H);           // left: yellow
      // Diagonals and a 1 m circle.
      g.stroke(255, 255, 255, 120); g.strokeWeight(1);
      g.line(0, 0, W, H); g.line(W, 0, 0, H);
      g.stroke(0, 255, 255); g.strokeWeight(3);
      g.circle(W / 2, H / 2, pxPerM);
      // Gray ramp.
      const steps = 11, bw = W * 0.8 / steps, by = H * 0.8;
      g.noStroke();
      for (let i = 0; i < steps; i++) {
        g.fill((255 * i) / (steps - 1));
        g.rect(W * 0.1 + i * bw, by, bw, H * 0.05);
      }
      g.fill(255); g.textAlign(p.CENTER, p.CENTER); g.textSize(W / 16);
      g.text('TOP', W / 2, H * 0.06);
      g.textSize(W / 28);
      g.text('grid 10 cm · circle 1 m', W / 2, H * 0.13);
    }
    render();
    return { draw() {} };
  },
};
export default testcard;

// Solid fields used by calibration patterns.
export function fill(level) {
  return {
    name: `fill${level}`,
    create(p, g) {
      g.background(level);
      return { draw() {} };
    },
  };
}

// Levels: for setting the projector's Brightness (black level) and Contrast (white level).
// Top half: near-black steps on black — lower Brightness until the first steps just
// vanish, then raise it until "2" is barely visible. Bottom half: near-white steps on
// white — raise Contrast until the last steps start merging, then back off.
export const levels = {
  name: 'levels',
  create(p, g, { W, H }) {
    const darks = [0, 2, 4, 6, 8, 12, 16, 20, 28, 36];
    const lights = [200, 215, 225, 232, 238, 243, 247, 250, 253, 255];
    g.background(0);
    g.noStroke();
    g.textAlign(p.CENTER, p.CENTER);
    g.textSize(W / 30);
    const cols = 2, rows = 5, cw = W / cols, ch = H / 2 / rows;
    darks.forEach((v, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.fill(v); g.rect(x + cw * 0.2, y + ch * 0.2, cw * 0.6, ch * 0.6);
      g.fill(90); g.text(v, x + cw / 2, y + ch * 0.1);
    });
    g.fill(255); g.rect(0, H / 2, W, H / 2);
    lights.forEach((v, i) => {
      const x = (i % cols) * cw, y = H / 2 + Math.floor(i / cols) * ch;
      g.fill(v); g.rect(x + cw * 0.2, y + ch * 0.2, cw * 0.6, ch * 0.6);
      g.fill(150); g.text(v, x + cw / 2, y + ch * 0.1);
    });
    return { draw() {} };
  },
};

// Reference: the wall's own artwork (config "reference", in media/), drawn in wall
// space, for lining projection up with a print: when the projected copy sits exactly on
// the real one, the calibration is right. Falls back to the grid if there's none.
export const reference = {
  name: 'reference',
  create(p, g, ctx) {
    const file = ctx.config.reference;
    let fallback = null;
    if (!file) fallback = testcard.create(p, g, ctx);
    else p.loadImage('/media/' + encodeURIComponent(file), (img) => g.image(img, 0, 0, ctx.W, ctx.H), () => { fallback = testcard.create(p, g, ctx); });
    g.background(0);
    return { draw() {}, dispose() { fallback?.dispose?.(); } };
  },
};
