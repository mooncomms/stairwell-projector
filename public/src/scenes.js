// Scene manager. A scene module looks like:
//
//   export default {
//     name: 'boids',
//     webgl: false,                        // true → buffer is created with WEBGL
//     create(p, g, ctx) {                  // g: p5.Graphics in wall space (ctx.W × ctx.H)
//       ...setup...
//       return { draw(t, dt) {...}, dispose() {...} };
//     },
//   };
//
// Scenes draw into their own buffer and never know about projection or calibration.

export class SceneManager {
  constructor(p, defs, ctx) {
    this.p = p;
    this.ctx = ctx;
    this.defs = Object.fromEntries(defs.map((d) => [d.name, d]));
    this.names = defs.map((d) => d.name);
    this.current = null;   // { def, g, inst, t }
    this.incoming = null;
    this.fade = 0;
    this.fadeSeconds = ctx.config.crossfadeSeconds ?? 4;
    this.playlist = (ctx.config.playlist || this.names).filter((n) => this.defs[n]);
    this.sceneSeconds = ctx.config.sceneSeconds ?? 300;
    this.sinceSwitch = 0;
  }

  spawn(name) {
    const def = this.defs[name];
    const { W, H } = this.ctx;
    const g = this.p.createGraphics(W, H, def.webgl ? this.p.WEBGL : this.p.P2D);
    g.pixelDensity(1);
    const inst = def.create(this.p, g, this.ctx);
    return { def, g, inst, t: 0 };
  }

  kill(s) {
    if (!s) return;
    s.inst.dispose?.();
    s.g.remove();
  }

  go(name, fadeSeconds = this.fadeSeconds) {
    if (!this.defs[name]) return;
    if (this.incoming) {             // interrupting a fade: finish it instantly
      this.kill(this.current);
      this.current = this.incoming;
      this.incoming = null;
    }
    if (!this.current || fadeSeconds <= 0) {
      this.kill(this.current);
      this.current = this.spawn(name);
    } else {
      this.incoming = this.spawn(name);
      this.fade = 0;
      this.fadeDur = fadeSeconds;
    }
    this.sinceSwitch = 0;
  }

  next() { this.step(1); }
  prev() { this.step(-1); }

  step(dir) {
    const list = this.playlist.length ? this.playlist : this.names;
    const cur = (this.incoming || this.current)?.def.name;
    const i = list.indexOf(cur);
    this.go(list[i < 0 ? 0 : (i + dir + list.length) % list.length]);
  }

  get name() { return (this.incoming || this.current)?.def.name; }

  update(dt) {
    this.sinceSwitch += dt;
    // Scenes marked `hold` (party) stay until changed, and the rotation skips them.
    const cur = (this.incoming || this.current)?.def;
    if (this.sceneSeconds > 0 && this.sinceSwitch > this.sceneSeconds && this.playlist.length > 1 && !cur?.hold) {
      const list = this.playlist, i = list.indexOf(cur?.name);
      for (let k = 1; k <= list.length; k++) {
        const n = list[(i + k) % list.length];
        if (!this.defs[n].hold) { this.go(n); break; }
      }
    }

    for (const s of [this.current, this.incoming]) {
      if (!s) continue;
      s.t += dt;
      s.inst.draw(s.t, dt);
    }
    if (this.incoming) {
      this.fade += dt / this.fadeDur;
      if (this.fade >= 1) {
        this.kill(this.current);
        this.current = this.incoming;
        this.incoming = null;
        this.fade = 0;
      }
    }
  }

  // What the output stage should show.
  layers() {
    const ease = (x) => x * x * (3 - 2 * x);
    return { a: this.current?.g, b: this.incoming?.g, mix: ease(Math.min(this.fade, 1)) };
  }
}
