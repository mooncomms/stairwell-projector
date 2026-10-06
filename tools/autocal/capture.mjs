// Capture a structured-light sequence with the projector's own camera.
//
// Needs: the stairwall server running (PORT), the autocal page open full-screen on the
// projector (http://…/autocal.html), the projector on USB debugging with camgrab pushed
// (tools/camgrab/snap.sh does that), and adb.
//
//   node tools/autocal/capture.mjs --out data/autocal/run1 [--port 8090] [--adb adb]
//        [--serial X] [--exposure 130] [--bits 11]
//
// Frames: white, black, then Gray codes for x and y (each with its inverse), as raw YUYV
// 640x480 files in --out, plus capture.json describing them.
import fs from 'node:fs';
import path from 'node:path';
import { openRig, parseArgs } from './rig.mjs';

const args = parseArgs(process.argv.slice(2));
const OUT = args.out || 'data/autocal/run', BITS = +(args.bits || 11);
const rig = await openRig({ port: args.port, adb: args.adb, serial: args.serial, exposure: args.exposure });

const frames = [{ name: 'white', kind: 'white' }, { name: 'black', kind: 'black' }];
for (const axis of ['x', 'y']) for (let bit = 0; bit < BITS; bit++) for (const inv of [0, 1]) frames.push({ name: `${axis}${bit}${inv ? 'i' : ''}`, kind: 'gray', axis, bit, inv });

let screen = null;
const t0 = Date.now();
for (const f of frames) {
  const ack = await rig.show(f);
  screen ??= { w: ack.w, h: ack.h };
  await rig.grab(f.name);
  process.stdout.write(`\r${f.name.padEnd(5)} ${frames.indexOf(f) + 1}/${frames.length}`);
}
console.log(`\ncaptured in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
rig.close();
await rig.show({ kind: 'black' });
rig.pullAll(OUT);
fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify({ camera: { w: 640, h: 480, format: 'YUYV' }, screen, bits: BITS, frames }, null, 2));
console.log('saved to', OUT);
