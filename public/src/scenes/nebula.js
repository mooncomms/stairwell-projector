// The dramatic sibling of `starfield`: a window into deep space. A shader bakes the nebula once: a Milky Way band, domain-
// warped swirls, ridged filaments and dark dust lanes, with soft falloff (no hard
// threshold). Stars follow the same density map, cluster along the band, hide behind
// dust, and have power-law brightness: a haze of faint ones, a few bright ones with
// colour and glow. Faint stars are baked in; bright ones twinkle live. Shooting stars
// now and then. The whole sky drifts slowly, like the Earth turning.
const TAU = Math.PI * 2;

const NEBULA = {
  stars: 5200,              // total, most of them faint
  live: 260,                // brightest stars drawn live so they can twinkle
  band: 0.9,                // angle of the Milky Way band (radians)
  bandWidth: 0.17,          // its half-width, in wall widths
  palette: [[80, 40, 160], [20, 110, 150], [170, 40, 110]],   // nebula colours
};

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uSeed, uMode, uBand, uBandW;
uniform vec3 uA, uB, uC;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);          // quintic: no grid creases
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);                           // rotate octaves: no axis bias
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.02 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.x;                           // in wall widths
  vec2 mid = vec2(0.5, 0.5 * uRes.y / uRes.x);
  vec2 dir = vec2(cos(uBand), sin(uBand));
  float across = dot(uv - mid, vec2(-dir.y, dir.x));
  float band = exp(-across * across / (2.0 * uBandW * uBandW));

  // Domain warping: noise fed back into itself turns blobs into swirls and wisps.
  vec2 p = uv * 1.9 + uSeed;
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2)), fbm(p + 2.2 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 2.2 * r);
  // Ridged noise: thin bright filaments.
  float ridge = pow(1.0 - abs(fbm(p * 1.8 + 3.0 * r) * 2.0 - 1.0), 7.0);

  float dens = band * (0.03 + 1.3 * smoothstep(0.42, 0.95, f)) + ridge * (0.15 + 0.85 * band) * 0.45
             + (1.0 - band) * 0.18 * smoothstep(0.62, 0.98, f);  // faint wisps away from the band

  // Dust: dark lanes along the band's spine, broken up by warped noise.
  float spine = exp(-across * across / (2.0 * pow(uBandW * 0.22, 2.0)));
  float dust = clamp(smoothstep(0.48, 0.72, fbm(p * 1.6 + 2.5 * q + 11.0)) * band * 0.9 + spine * smoothstep(0.35, 0.7, fbm(p * 3.0 + r)), 0.0, 1.0);

  if (uMode > 0.5) { gl_FragColor = vec4(clamp(dens, 0.0, 1.0), dust, 0.0, 1.0); return; }

  float light = dens * (1.0 - 0.85 * dust);
  float n2 = fbm(p * 0.7 + r * 1.5 + 40.0);
  vec3 hue = n2 < 0.5 ? mix(uA, uB, n2 * 2.0) : mix(uB, uC, (n2 - 0.5) * 2.0);
  vec3 col = hue * (1.0 - exp(-light * 2.6)) * 1.5;             // soft exposure, no cut-off
  col += vec3(0.9, 0.85, 1.0) * pow(ridge * band, 2.0) * 0.08;  // filaments glow a touch whiter
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  name: 'nebula',
  frame: 'ship',                 // default window frame (stairwell)
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;
    const SH = Math.round(H * 1.3);                             // taller than the wall, to drift
    const seed = Math.random() * 100;

    // ---- nebula: two passes of the shader (maps, then colour) ----
    // Half resolution: nebulae are soft anyway, and it's 4× cheaper.
    const NW = Math.ceil(W / 2), NH = Math.ceil(SH / 2);
    const neb = p.createGraphics(NW, NH, p.WEBGL);
    neb.pixelDensity(1);
    const sh = neb.createShader(VERT, FRAG);
    const pass = (mode) => {
      neb.shader(sh);
      sh.setUniform('uRes', [NW, NH]);
      sh.setUniform('uSeed', seed);
      sh.setUniform('uMode', mode);
      sh.setUniform('uBand', NEBULA.band);
      sh.setUniform('uBandW', NEBULA.bandWidth);
      const [a, b, c] = NEBULA.palette.map((col) => col.map((v) => v / 255));
      sh.setUniform('uA', a); sh.setUniform('uB', b); sh.setUniform('uC', c);
      neb.noStroke();
      neb.rect(0, 0, NW, NH);
    };
    pass(1);
    neb.loadPixels();
    const maps = Uint8Array.from(neb.pixels);                   // r = density, g = dust
    const at = (x, y) => {
      const i = 4 * (Math.min(NH - 1, Math.max(0, Math.round(y / 2))) * NW + Math.min(NW - 1, Math.max(0, Math.round(x / 2))));
      return [maps[i] / 255, maps[i + 1] / 255];
    };
    pass(0);

    // ---- stars: placed by the density map, power-law brightness ----
    const tint = () => {
      const t = Math.random();
      return t < 0.12 ? [180, 200, 255] : t < 0.7 ? [240, 244, 255] : t < 0.9 ? [255, 238, 210] : [255, 205, 160];
    };
    const stars = [];
    while (stars.length < NEBULA.stars) {
      const x = Math.random() * W, y = Math.random() * SH;
      const [dens, dust] = at(x, y);
      if (Math.random() > 0.18 + 0.82 * dens) continue;         // cluster where the sky is dense
      const b = Math.random() ** 5 * (1 - 0.8 * dust);           // most faint, few bright; dust dims
      stars.push({ x, y, b, col: tint(), depth: 0.9 + Math.random() * 0.2, ph: Math.random() * TAU, sp: 0.5 + Math.random() * 2.5 });
    }
    stars.sort((a, b) => b.b - a.b);
    const live = stars.slice(0, NEBULA.live), faint = stars.slice(NEBULA.live);

    // Bake nebula + faint stars into one 2D layer.
    const sky = p.createGraphics(W, SH);
    sky.pixelDensity(1);
    const sc = sky.drawingContext;
    sc.fillStyle = 'rgb(2,2,8)'; sc.fillRect(0, 0, W, SH);
    sc.drawImage(neb.elt, 0, 0, W, SH);
    sc.globalCompositeOperation = 'lighter';
    for (const s of faint) {
      const a = 0.08 + s.b * 1.6;
      sc.fillStyle = `rgba(${s.col},${Math.min(1, a)})`;
      sc.beginPath(); sc.arc(s.x, s.y, 0.45 + s.b * 1.4, 0, TAU); sc.fill();
    }
    neb.remove();

    let shooting = null;

    return {
      draw(t, dt) {
        // The whole sky drifts slowly; bright stars sit a hair in front (parallax).
        const drift = -H * 0.15 + Math.sin(t * 0.004) * H * 0.12;
        ctx.fillStyle = 'rgb(2,2,8)'; ctx.fillRect(0, 0, W, H);
        g.image(sky, 0, drift);

        ctx.globalCompositeOperation = 'lighter';
        for (const s of live) {
          const y = s.y + drift * s.depth;
          if (y < -10 || y > H + 10) continue;
          const tw = 0.75 + 0.25 * Math.sin(t * s.sp + s.ph);
          const r = 0.5 + s.b * 2.2;
          ctx.fillStyle = `rgba(${s.col},${Math.min(1, 0.2 + s.b * 1.2) * tw})`;
          ctx.beginPath(); ctx.arc(s.x, y, r, 0, TAU); ctx.fill();
          if (s.b > 0.4) {                                       // only the brightest glow
            const grd = ctx.createRadialGradient(s.x, y, 0, s.x, y, r * 6);
            grd.addColorStop(0, `rgba(${s.col},${0.25 * s.b * tw})`); grd.addColorStop(1, `rgba(${s.col},0)`);
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(s.x, y, r * 6, 0, TAU); ctx.fill();
          }
        }

        if (!shooting && Math.random() < dt / 25) {
          const a = p.radians(20 + Math.random() * 40);
          shooting = { x: Math.random() * W, y: Math.random() * H * 0.5, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0 };
        }
        if (shooting) {
          const s = shooting;
          s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
          const fade = Math.max(0, 1 - s.life / 0.9);
          ctx.lineWidth = 2;
          for (let k = 0; k < 10; k++) {
            ctx.strokeStyle = `rgba(255,255,240,${fade * (1 - k / 10)})`;
            ctx.beginPath();
            ctx.moveTo(s.x - s.vx * 0.012 * k, s.y - s.vy * 0.012 * k);
            ctx.lineTo(s.x - s.vx * 0.012 * (k + 1), s.y - s.vy * 0.012 * (k + 1));
            ctx.stroke();
          }
          if (fade <= 0) shooting = null;
        }
        ctx.globalCompositeOperation = 'source-over';
      },
      dispose() { sky.remove(); },
    };
  },
};
