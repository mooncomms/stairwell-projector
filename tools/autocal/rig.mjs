// The capture rig: the autocal page on the projector (via the server's command bus) and
// the projector's camera (camgrab in serve mode over adb). Shared by the autocal tools.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
}

export async function openRig({ port = 8090, adb: ADB = 'adb', serial, exposure } = {}) {
  const S = serial ? ['-s', serial] : [];
  const isExe = /\.exe$/i.test(ADB);
  const hostPath = (p) => (isExe ? execFileSync('wslpath', ['-w', path.resolve(p)]).toString().trim() : p);
  const adb = (...a) => execFileSync(ADB, [...S, ...a]).toString();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = `http://localhost:${port}`;

  adb('shell', 'rm -rf /data/local/tmp/ac; mkdir -p /data/local/tmp/ac');
  if (exposure) {
    adb('shell', '/data/local/tmp/camgrab /dev/video0 set 0x009a0901 1');
    adb('shell', `/data/local/tmp/camgrab /dev/video0 set 0x009a0902 ${exposure}`);
  }
  const cam = spawn(ADB, [...S, 'shell', '/data/local/tmp/camgrab /dev/video0 serve 640 480'], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const waiters = [];
  cam.stdout.on('data', (d) => {
    buf += d.toString().replace(/\r/g, '');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); waiters.shift()?.(line); }
  });
  const nextLine = () => new Promise((r) => waiters.push(r));
  const ready = await nextLine();
  if (!ready.startsWith('ready')) throw new Error('camera: ' + ready);

  let seq = Date.now() % 1e6;
  return {
    sleep, adb, hostPath,
    async show(p) {
      const s = ++seq;
      await fetch(`${base}/api/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'autocal', seq: s, ...p }) });
      for (let t = 0; t < 200; t++) {
        const ack = await (await fetch(`${base}/api/autocal-ack`)).json();
        if (ack?.seq === s) { await sleep(250); return ack; }   // + HDMI/projector latency
        await sleep(25);
      }
      throw new Error('autocal page did not acknowledge: is autocal.html open on the projector?');
    },
    // Grab to the projector's temp folder (name.yuv); pull later with pullAll().
    async grab(name, skip = 6) {
      cam.stdin.write(`grab /data/local/tmp/ac/${name}.yuv ${skip}\n`);
      const line = await nextLine();
      if (!line.startsWith('ok')) throw new Error(line);
    },
    pullAll(dir) { fs.mkdirSync(dir, { recursive: true }); adb('pull', '/data/local/tmp/ac/.', hostPath(dir)); },
    close() { cam.stdin.write('quit\n'); },
  };
}

// Luma of a pulled YUYV frame as Float32Array (w × h).
export function readLuma(file, w = 640, h = 480) {
  const d = fs.readFileSync(file), y = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) y[i] = d[2 * i];
  return y;
}
