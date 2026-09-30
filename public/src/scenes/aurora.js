// Northern lights over a still lake. Shader curtains of aurora (green at the base,
// pink/violet fringes above, shimmering vertical rays) in a starry sky; a spruce
// treeline; the lake mirrors it all with gentle ripples; snow on the near shore picks
// up the green glow.
const TAU = Math.PI * 2;

const AURORA = {
  horizon: 0.78,           // fraction of the wall height where sky meets trees
  lakeTo: 0.9,             // lake from the horizon down to here, then snowy shore
  strength: 1.0,
};

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uStrength;

float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// One curtain: a wavy lower edge, light falling off upward, streaked by vertical rays.
vec3 curtain(vec2 uv, float t, float seed, float base, float amp, float height) {
  float x = uv.x;
  float edge = base + amp * (noise(x * 1.3 + seed + t * 0.025) * 0.7 + noise(x * 4.0 + seed * 3.0 - t * 0.04) * 0.3 - 0.5);
  float d = uv.y - edge;                               // height above the lower edge
  float lower = smoothstep(-0.03, 0.01, d);
  float body = exp(-max(d, 0.0) / height) * lower + exp(min(d, 0.0) / 0.05) * 0.18;  // faint glow hangs below
  float rays = noise(x * 70.0 + seed + t * 0.25) * 0.55 + noise(x * 180.0 - t * 0.5 + seed) * 0.45;
  float pulse = 0.55 + 0.45 * noise(x * 2.5 + t * 0.12 + seed * 5.0);
  float k = body * (0.35 + 0.9 * rays) * pulse;
  vec3 green = vec3(0.25, 1.0, 0.55), violet = vec3(0.75, 0.25, 0.8);
  vec3 col = mix(green, violet, smoothstep(height * 0.6, height * 2.2, d));
  col = mix(col, vec3(0.9, 1.0, 0.8), smoothstep(0.02, 0.0, abs(d)) * 0.4);   // bright lower hem
  return col * k;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                     // y: 0 at the horizon, 1 at the top
  vec3 col = mix(vec3(0.03, 0.05, 0.1), vec3(0.005, 0.008, 0.025), pow(uv.y, 0.7));
  float t = uTime;
  vec3 a = curtain(uv, t, 3.0, 0.3, 0.2, 0.17) + curtain(uv, t * 0.8, 17.0, 0.58, 0.16, 0.12) * 0.6
         + curtain(uv, t * 1.2, 41.0, 0.12, 0.1, 0.07) * 0.45;
  col += a * 0.8 * uStrength;
  col += vec3(0.02, 0.07, 0.04) * (1.0 - uv.y) * uStrength;   // airglow near the horizon
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  name: 'aurora',
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const HZ = Math.round(H * AURORA.horizon), LK = Math.round(H * AURORA.lakeTo);

    const skyG = p.createGraphics(Math.ceil(W / 2), Math.ceil(HZ / 2), p.WEBGL);
    skyG.pixelDensity(1);
    const sh = skyG.createShader(VERT, FRAG);

    // Stars, baked.
    const stars = p.createGraphics(W, HZ); stars.pixelDensity(1);
    const sc = stars.drawingContext;
    for (let i = 0; i < 1100; i++) {
      const b = Math.random() ** 2.5;
      sc.fillStyle = `rgba(230,235,255,${0.2 + b * 0.8})`;
      sc.beginPath(); sc.arc(Math.random() * W, Math.random() * HZ, 0.4 + b * 1.2, 0, TAU); sc.fill();
    }

    // Treeline and its reflection, snowy shore, and a few big spruces near the edges.
    const land = p.createGraphics(W, H); land.pixelDensity(1);
    const lc = land.drawingContext;
    function spruce(c, x, base, h, col) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, base - h);
      const tiers = 7;
      for (let i = 1; i <= tiers; i++) {                // jagged tiers down the right side
        const y = base - h + (h * i) / tiers, w = (h * 0.22 * i) / tiers;
        c.lineTo(x + w, y); c.lineTo(x + w * 0.45, y - h * 0.02);
      }
      c.lineTo(x + h * 0.04, base); c.lineTo(x - h * 0.04, base);
      for (let i = tiers; i >= 1; i--) {
        const y = base - h + (h * i) / tiers, w = (h * 0.22 * i) / tiers;
        c.lineTo(x - w * 0.45, y - h * 0.02); c.lineTo(x - w, y);
      }
      c.closePath(); c.fill();
    }
    const treeline = [];
    for (let x = -10; x < W + 10; x += rnd(6, 14)) treeline.push([x, rnd(18, 55) * (0.6 + p.noise(x * 0.004) * 0.9)]);
    for (const [x, h] of treeline) spruce(lc, x, HZ, h, '#03060a');
    lc.fillStyle = '#03060a'; lc.fillRect(0, HZ - 4, W, 4);
    // Reflection of the treeline (flipped, a touch lighter).
    lc.save(); lc.translate(0, 2 * HZ); lc.scale(1, -1);
    for (const [x, h] of treeline) spruce(lc, x, HZ, h, 'rgba(5,9,14,0.9)');
    lc.restore();
    // Snowy shore.
    const snow = lc.createLinearGradient(0, LK, 0, H);
    snow.addColorStop(0, '#1d2632'); snow.addColorStop(1, '#0c1118');
    lc.fillStyle = snow;
    lc.beginPath(); lc.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) lc.lineTo(x, LK + (p.noise(x * 0.006, 3) - 0.5) * 30);
    lc.lineTo(W, H); lc.fill();
    for (const [x, h] of [[W * 0.06, H * 0.36], [W * 0.16, H * 0.24], [W * 0.95, H * 0.3]]) spruce(lc, x, H * 0.99, h, '#010203');

    let shoot = null;

    return {
      draw(t, dt) {
        skyG.shader(sh);
        sh.setUniform('uRes', [skyG.width, skyG.height]);
        sh.setUniform('uTime', t);
        sh.setUniform('uStrength', AURORA.strength);
        skyG.noStroke();
        skyG.rect(0, 0, skyG.width, skyG.height);

        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        g.image(skyG, 0, 0, W, HZ);
        ctx.globalCompositeOperation = 'lighter';
        g.image(stars, 0, 0);
        // An occasional shooting star.
        if (!shoot && Math.random() < dt / 30) shoot = { x: rnd(0, W), y: rnd(0, HZ * 0.4), vx: rnd(-500, 500), vy: rnd(150, 300), life: 0.8 };
        if (shoot) {
          shoot.life -= dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt;
          ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, shoot.life)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 0.06, shoot.y - shoot.vy * 0.06); ctx.stroke();
          if (shoot.life <= 0) shoot = null;
        }
        ctx.globalCompositeOperation = 'source-over';

        // Lake: the sky mirrored below the horizon, rippling, a little darker.
        const lakeH = LK - HZ + 20;
        for (let y = 0; y < lakeH; y += 2) {
          const off = Math.sin(y * 0.35 + t * 1.5) * (1 + y * 0.03) + Math.sin(y * 0.11 - t) * 1.5;
          const srcY = HZ - 1 - y * 2.4;                     // mirrors a taller slice of sky (artistic licence)
          if (srcY < 0) break;
          ctx.drawImage(g.elt, 0, srcY, W, 2, off, HZ + y, W, 2);
        }
        ctx.fillStyle = 'rgba(0,4,10,0.35)'; ctx.fillRect(0, HZ, W, lakeH);

        g.image(land, 0, 0);
        // The snow catches the aurora's green, brightening and fading with it.
        const glow = 0.05 + 0.05 * p.noise(t * 0.1);
        ctx.fillStyle = `rgba(90,255,160,${glow})`;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillRect(0, LK - 20, W, H - LK + 20);
        ctx.globalCompositeOperation = 'source-over';
      },
      dispose() { skyG.remove(); stars.remove(); land.remove(); },
    };
  },
};
