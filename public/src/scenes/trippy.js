// Domain-warped fbm with a cycling cosine palette (after Inigo Quilez). Pure shader.
const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes.x * 2.2;
  float t = uTime * 0.06;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + t * 1.5), fbm(uv + 4.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(uv + 4.0 * r);
  vec3 col = palette(f * 1.4 + length(q) * 0.6 + uTime * 0.02);
  col *= 0.35 + 0.9 * f * f;
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  name: 'trippy',
  webgl: true,
  create(p, g, { W, H }) {
    const sh = g.createShader(VERT, FRAG);
    return {
      draw(t) {
        g.shader(sh);
        sh.setUniform('uRes', [W, H]);
        sh.setUniform('uTime', t);
        g.noStroke();
        g.rect(0, 0, W, H);
      },
    };
  },
};
