// Photos and videos from media/, cover-fitted to the wall, with a slow Ken Burns
// zoom/pan on stills and crossfades between items.
export default {
  name: 'nature',
  frame: 'house',                 // default window frame (stairwell)
  create(p, g, { W, H, config }) {
    const ITEM = config.natureItemSeconds ?? 45, FADE = 3;
    let items = [], idx = -1, cur = null, prev = null, since = 0, disposed = false;

    fetch('/api/media').then((r) => r.json()).then((list) => {
      items = list.sort(() => Math.random() - 0.5);
      if (!disposed) advance();
    });

    function load(item) {
      const slot = { item, ready: false, kb: { z0: 1 + Math.random() * 0.05, z1: 1.12 + Math.random() * 0.08, ax: Math.random(), ay: Math.random() } };
      if (item.video) {
        const v = p.createVideo(item.url, () => { slot.ready = true; });
        v.elt.muted = true;
        v.elt.playsInline = true;
        v.volume(0);
        v.hide();
        v.loop();
        slot.media = v;
      } else {
        p.loadImage(item.url, (img) => { slot.media = img; slot.ready = true; });
      }
      return slot;
    }

    function unload(slot) {
      if (slot?.item.video) { slot.media.stop(); slot.media.remove(); }
    }

    function advance() {
      if (!items.length) return;
      unload(prev);
      prev = cur;
      idx = (idx + 1) % items.length;
      cur = load(items[idx]);
      since = 0;
    }

    function drawSlot(slot, alpha, age) {
      if (!slot?.ready) return;
      const m = slot.media;
      const mw = m.width || m.elt?.videoWidth, mh = m.height || m.elt?.videoHeight;
      if (!mw || !mh) return;
      const k = slot.item.video ? 0 : Math.min(1, age / (ITEM + FADE));
      const zoom = slot.kb.z0 + (slot.kb.z1 - slot.kb.z0) * k;
      const s = Math.max(W / mw, H / mh) * zoom;   // cover-fit
      const dw = mw * s, dh = mh * s;
      const x = (W - dw) * slot.kb.ax, y = (H - dh) * slot.kb.ay;
      // globalAlpha instead of tint(): tint() re-tints a pixel copy of every video
      // frame, globalAlpha is free.
      g.drawingContext.globalAlpha = alpha;
      g.image(m, x, y, dw, dh);
      g.drawingContext.globalAlpha = 1;
    }

    return {
      draw(t, dt) {
        since += dt;
        g.background(0);
        if (!items.length) {
          g.fill(120); g.textAlign(p.CENTER, p.CENTER); g.textSize(W / 22);
          g.text('Drop photos / videos into\nstairwall/media/', W / 2, H / 2);
          return;
        }
        if (cur?.ready && since > ITEM && items.length > 1) advance();
        const a = Math.min(1, since / FADE);
        if (prev && a < 1) drawSlot(prev, 1, since + ITEM);
        drawSlot(cur, prev ? a : 1, since);
      },
      dispose() { disposed = true; unload(prev); unload(cur); },
    };
  },
};
