// Inside a lava lamp. Wax blobs are heated by the lamp at the bottom, rise, cool near
// the top and sink back, stretching as they move and merging/splitting as metaballs.
// Lit from below, with glossy highlights and faint glass reflections. The palette
// slowly cycles through classic combinations.
const LAVA = {
  blobs: 10,
  palettes: [                                   // [wax, liquid] as 0..1 RGB
    [[1.0, 0.35, 0.08], [0.35, 0.05, 0.35]],    // orange in purple
    [[1.0, 0.12, 0.2], [0.95, 0.75, 0.15]],     // red in yellow
    [[0.2, 1.0, 0.45], [0.05, 0.15, 0.45]],     // green in blue
    [[1.0, 0.4, 0.75], [0.03, 0.3, 0.35]],      // pink in teal
  ],
  paletteMinutes: 6,                            // time on each palette (0 = stay on the first)
  speed: 1,
};
const MAX = 16;

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
#define MAX ${MAX}
uniform vec2 uRes;
uniform vec4 uBlobs[MAX];        // x, y (in wall widths), radius, vertical stretch
uniform int uCount;
uniform vec3 uWax, uLiquid;
uniform float uTime;

float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    vec4 b = uBlobs[i];
    vec2 d = p - b.xy;
    d.y /= b.w;
    f += b.z * b.z / (dot(d, d) + 1e-4);
  }
  return f;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / uRes.x, (uRes.y - gl_FragCoord.y) / uRes.x);   // y down, in widths
  float H = uRes.y / uRes.x;
  float f = field(p);
  float heat = smoothstep(H * 0.35, H, p.y);                 // closer to the lamp = brighter

  // Liquid: glowing from the lamp below, with a soft halo around the wax.
  vec3 col = uLiquid * (0.35 + 0.9 * heat);
  col += uWax * 0.25 * smoothstep(0.35, 1.0, f) * (0.5 + heat);

  if (f > 1.0) {
    // Surface normal from the field's gradient, for lighting.
    // (Capped: the field spikes at blob centres, which would sparkle.)
    float e = 0.004;
    #define FC(q) min(field(q), 2.5)
    vec2 gr = vec2(FC(p + vec2(e, 0.0)) - FC(p - vec2(e, 0.0)), FC(p + vec2(0.0, e)) - FC(p - vec2(0.0, e)));
    vec3 n = normalize(vec3(-gr * 0.02, 1.0));
    vec3 lightUp = normalize(vec3(0.0, 0.8, 0.6));          // from the lamp below (y down)
    float diff = max(dot(n, lightUp), 0.0);
    float rim = 1.0 - smoothstep(1.0, 1.6, f);               // lighter, translucent edges
    vec3 wax = uWax * (0.45 + 0.55 * diff + 0.35 * heat) + uWax * rim * 0.35;
    float spec = pow(max(dot(reflect(-normalize(vec3(0.3, -0.6, 1.0)), n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    wax += vec3(1.0, 0.95, 0.9) * spec * 0.45;
    col = mix(col, wax, smoothstep(1.0, 1.06, f));           // antialiased edge
  }

  // Glass: two faint vertical reflections, and darker toward the sides.
  float x = gl_FragCoord.x / uRes.x;
  col += vec3(1.0) * (exp(-pow((x - 0.18) / 0.025, 2.0)) * 0.06 + exp(-pow((x - 0.24) / 0.01, 2.0)) * 0.05);
  col *= 0.75 + 0.25 * sin(x * 3.14159);
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  name: 'lavalamp',
  webgl: true,
  create(p, g, { W, H }) {
    const sh = g.createShader(VERT, FRAG);
    const HW = H / W;                                        // wall height in widths (2)
    const rnd = (a, b) => a + Math.random() * (b - a);
    const blobs = Array.from({ length: LAVA.blobs }, () => ({
      x: rnd(0.22, 0.78), y: rnd(0.3, HW - 0.2), r: rnd(0.035, 0.07), vy: 0, heat: Math.random(), seed: Math.random() * 100,
      warm: rnd(0.2, 0.5), cool: rnd(0.2, 0.45),           // each blob heats and cools at its own pace
    }));
    // Molten pool at the bottom and a cooled cap at the top (partly off-wall).
    const pools = [{ x: 0.5, y: HW + 0.05, r: 0.2, w: 0.7 }, { x: 0.5, y: -0.06, r: 0.1, w: 0.8 }];

    return {
      draw(t, dt) {
        dt = Math.min(dt, 0.05) * LAVA.speed;
        for (const b of blobs) {
          // Heat up near the lamp, cool off near the top; warm wax rises.
          const toLamp = b.y / HW;
          b.heat += (toLamp > 0.8 ? b.warm : toLamp < 0.25 ? -b.cool : -0.04) * dt;
          b.heat = Math.max(0, Math.min(1, b.heat));
          b.vy += ((0.5 - b.heat) * 0.16 - b.vy * 0.9) * dt;   // buoyancy (y down) and drag
          b.y += b.vy * dt;
          b.x += (p.noise(b.seed, t * 0.05) - 0.5) * 0.07 * dt;
          b.x = Math.max(0.18, Math.min(0.82, b.x));
          if (b.y > HW + 0.02) { b.y = HW + 0.02; b.vy = 0; }
          if (b.y < 0.04) { b.y = 0.04; b.vy = 0; }
        }
        const data = new Array(MAX * 4).fill(0);
        const all = [...blobs.map((b) => [b.x, b.y, b.r, 1 + Math.min(0.8, Math.abs(b.vy) * 12)]), ...pools.map((q) => [q.x, q.y, q.r, q.w])];
        all.slice(0, MAX).forEach((v, i) => data.splice(i * 4, 4, ...v));

        // Palette: hold, then crossfade to the next.
        const pals = LAVA.palettes, per = LAVA.paletteMinutes * 60;
        let wax = pals[0][0], liquid = pals[0][1];
        if (per > 0) {
          const k = t / per, i = Math.floor(k) % pals.length, j = (i + 1) % pals.length;
          const f = Math.max(0, Math.min(1, ((k % 1) - 0.92) / 0.08));
          const mix = (a, b) => a.map((v, n) => v + (b[n] - v) * f);
          wax = mix(pals[i][0], pals[j][0]); liquid = mix(pals[i][1], pals[j][1]);
        }

        g.shader(sh);
        sh.setUniform('uRes', [W, H]);
        sh.setUniform('uBlobs', data);
        sh.setUniform('uCount', Math.min(MAX, all.length));
        sh.setUniform('uWax', wax);
        sh.setUniform('uLiquid', liquid);
        sh.setUniform('uTime', t);
        g.noStroke();
        g.rect(0, 0, W, H);
      },
    };
  },
};
