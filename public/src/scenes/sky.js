// The real sky, right now: the sun's actual position for your location and time drives
// the colours (day, golden hour, sunset, twilight, night), clouds drift overhead in
// perspective and are lit accordingly, and at night there are stars and the moon in
// its real phase. The wall is treated as a window facing `facing` degrees.
//
// Settings in data/config.json → "sky": { "lat": 40.4, "lon": -3.7, "facing": 270, "clouds": 0.45 }
// URL flags: ?hour=19.5 shows today at that local time; ?speed=600 runs time 600× faster.
const RAD = Math.PI / 180;

// Where the sun is, in degrees: altitude above the horizon, azimuth from north.
export function sunPosition(ms, lat, lon) {
  const d = (ms - 946728000000) / 86400000;                   // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  return { ...altAz(ra, dec, d, lat, lon), ra, dec };
}

function altAz(ra, dec, d, lat, lon) {
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  const la = lat * RAD;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
}

// Moon: phase from a known new moon; position approximated from the sun's by phase.
function moonPosition(ms, lat, lon, sun) {
  const phase = (((ms - 947182440000) / 86400000 / 29.530588853) % 1 + 1) % 1;   // 0 new, 0.5 full
  const d = (ms - 946728000000) / 86400000;
  return { phase, ...altAz(sun.ra + phase * 2 * Math.PI, -sun.dec * Math.cos(phase * 2 * Math.PI), d, lat, lon) };
}

// Sky colours by sun altitude (degrees): [alt, zenith, horizon, glow].
const KEYS = [
  [-18, [0.014, 0.02, 0.055], [0.09, 0.075, 0.09], [0.1, 0.08, 0.12]],   // night: faint city glow low down
  [-10, [0.02, 0.035, 0.1], [0.14, 0.12, 0.24], [0.4, 0.2, 0.3]],
  [-4, [0.08, 0.12, 0.3], [0.85, 0.42, 0.35], [1.0, 0.45, 0.3]],
  [2, [0.18, 0.32, 0.6], [1.0, 0.62, 0.35], [1.0, 0.6, 0.3]],
  [10, [0.22, 0.45, 0.8], [0.8, 0.8, 0.85], [1.0, 0.85, 0.6]],
  [35, [0.18, 0.42, 0.85], [0.62, 0.78, 0.95], [1.0, 0.95, 0.85]],
];
function palette(alt) {
  if (alt <= KEYS[0][0]) return KEYS[0].slice(1);
  for (let i = 1; i < KEYS.length; i++) {
    if (alt <= KEYS[i][0]) {
      const [a0, ...c0] = KEYS[i - 1], [a1, ...c1] = KEYS[i], k = (alt - a0) / (a1 - a0);
      return c0.map((col, j) => col.map((v, n) => v + (c1[j][n] - v) * k));
    }
  }
  return KEYS[KEYS.length - 1].slice(1);
}

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uClouds, uNight, uHorizon, uVfov, uHfov;
uniform vec3 uZenith, uHorizonCol, uGlow;
uniform vec2 uSun, uMoon;          // (azimuth offset from the view centre, altitude), degrees
uniform float uSunAlt, uMoonPhase, uMoonUp;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // This pixel's direction: altitude and azimuth offset, in degrees.
  float alt = (uv.y - uHorizon) * uVfov;
  float az = (uv.x - 0.5) * uHfov;
  float a = max(alt, 0.0) / 90.0;

  vec3 col = mix(uHorizonCol, uZenith, pow(a, 0.45));
  // Glow around the sun (wide and warm when it's low), even just below the horizon.
  float dSun = length(vec2(az - uSun.x, alt - uSun.y));
  float low = 1.0 - clamp(uSunAlt / 25.0, 0.0, 1.0);
  col += uGlow * (exp(-dSun / (18.0 + 30.0 * low)) * (0.35 + 0.5 * low) + exp(-dSun / 2.5) * 0.6) * step(-8.0, uSunAlt);
  col += uGlow * 0.25 * exp(-max(alt, 0.0) / 6.0) * exp(-abs(az - uSun.x) / 60.0) * low * step(-10.0, uSunAlt);

  // Stars at night.
  vec2 sp = gl_FragCoord.xy / 7.0, cell = floor(sp);
  float h = hash(cell);
  vec2 sPos = vec2(hash(cell + 1.7), hash(cell + 9.2));
  float star = step(0.93, h) * smoothstep(0.16, 0.0, length(fract(sp) - sPos)) * (0.3 + 0.7 * hash(cell + 4.4));
  star *= 0.65 + 0.35 * sin(uTime * (1.0 + 3.0 * hash(cell + 2.0)) + h * 60.0);
  col += vec3(0.9, 0.93, 1.0) * star * uNight * smoothstep(2.0, 12.0, alt);

  // Moon with its phase.
  float dMoon = length(vec2(az - uMoon.x, alt - uMoon.y));
  float mr = 1.3;
  if (uMoonUp > 0.5) {
    col += vec3(0.8, 0.85, 1.0) * exp(-dMoon / 6.0) * 0.12 * uNight;
    if (dMoon < mr) {
      vec2 q = vec2(az - uMoon.x, alt - uMoon.y) / mr;
      vec3 n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
      float ph = uMoonPhase * 6.2831853;
      float lit = step(0.0, dot(n, vec3(sin(ph), 0.0, -cos(ph))));
      col = mix(col, vec3(0.92, 0.92, 0.86) * (0.08 + 0.92 * lit), smoothstep(1.0, 0.9, length(q)));
    }
  }

  // Clouds on a flat layer overhead, seen in perspective; they thin out at the horizon.
  if (alt > 0.5) {
    // Project onto a cloud deck: cot(alt) runs from 0 overhead to large at the horizon.
    float dist = 1.0 / sin(radians(alt)), depth = cos(radians(alt)) * dist;
    vec2 cp = vec2(az * 0.035 * dist, depth) * 1.3 + vec2(uTime * 0.004, uTime * 0.006);
    float c = fbm(cp * 1.4);
    float cover = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.25, c) * smoothstep(0.5, 6.0, alt);
    float thick = smoothstep(0.4, 0.9, c);
    vec3 day = mix(vec3(1.0), vec3(0.55, 0.58, 0.65), thick);
    vec3 lit = mix(day, uGlow * vec3(1.1, 0.75, 0.65), low * 0.85);
    vec3 cloud = mix(lit, uZenith * 1.6 + 0.02, uNight);
    col = mix(col, cloud * (0.35 + 0.65 * (1.0 - uNight)), cover * 0.9);
  }

  // Distant hills and rooftops along the bottom.
  float ground = uHorizon + 0.012 * noise(vec2(uv.x * 9.0, 1.0)) + 0.02 * step(0.6, noise(vec2(floor(uv.x * 25.0), 7.0))) * (0.5 + noise(vec2(uv.x * 25.0, 3.0)));
  if (uv.y < ground) col = uHorizonCol * 0.12 + vec3(0.005);
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  name: 'sky',
  webgl: true,
  create(p, g, { W, H, config }) {
    const cfg = { lat: 40.4, lon: -3.7, facing: 270, clouds: 0.45, ...(config.sky || {}) };
    const params = new URLSearchParams(location.search);
    const speed = +params.get('speed') || 1;
    const hour = params.has('hour') ? +params.get('hour') : null;
    const start = Date.now();
    const sh = g.createShader(VERT, FRAG);
    const HFOV = 45, VFOV = 90, HORIZON = 0.08;
    const off = (az) => ((az - cfg.facing + 540) % 360) - 180;

    return {
      draw(t) {
        let ms = start + t * 1000 * speed;
        if (hour !== null) {
          const d = new Date(); d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
          ms = d.getTime() + t * 1000 * speed;
        }
        const sun = sunPosition(ms, cfg.lat, cfg.lon);
        const moon = moonPosition(ms, cfg.lat, cfg.lon, sun);
        const [zen, hor, glow] = palette(sun.alt);
        const night = Math.max(0, Math.min(1, (-sun.alt - 4) / 10));
        g.shader(sh);
        sh.setUniform('uRes', [W, H]);
        sh.setUniform('uTime', t);
        sh.setUniform('uClouds', cfg.clouds);
        sh.setUniform('uNight', night);
        sh.setUniform('uHorizon', HORIZON);
        sh.setUniform('uVfov', VFOV);
        sh.setUniform('uHfov', HFOV);
        sh.setUniform('uZenith', zen);
        sh.setUniform('uHorizonCol', hor);
        sh.setUniform('uGlow', glow);
        sh.setUniform('uSun', [off(sun.az), sun.alt]);
        sh.setUniform('uSunAlt', sun.alt);
        // Keep the moon in view when it's up, gently squeezed toward the window.
        sh.setUniform('uMoon', [Math.max(-HFOV * 0.4, Math.min(HFOV * 0.4, off(moon.az) * 0.3)), Math.min(70, moon.alt)]);
        sh.setUniform('uMoonPhase', moon.phase);
        sh.setUniform('uMoonUp', moon.alt > 3 && moon.phase > 0.04 && moon.phase < 0.96 ? 1 : 0);
        g.noStroke();
        g.rect(0, 0, W, H);
      },
    };
  },
};
