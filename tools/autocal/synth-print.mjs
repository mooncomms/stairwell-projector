// Synthetic end-to-end test of print finding, without the real print: project the wall's
// reference image at a known place (a stand-in "print"), photograph it with the
// projector's camera, then find_print.py should recover that place.
//
//   node tools/autocal/synth-print.mjs data/autocal/run1 [rig options]
// Ground truth goes to RUN/synth.json; the photo to RUN/synth/print.yuv.
import fs from 'node:fs';
import path from 'node:path';
import { openRig, parseArgs } from './rig.mjs';

const dir = process.argv[2];
const args = parseArgs(process.argv.slice(3));
// Image x along projector +y, image y along projector −x (as on a sideways projector).
const tf = [0, 825, -1500, 0, 1700, 130];
const corner = (u, v) => ({ x: tf[0] * u + tf[2] * v + tf[4], y: tf[1] * u + tf[3] * v + tf[5] });
const truth = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];

const rig = await openRig({ port: args.port, adb: args.adb, serial: args.serial, exposure: args.exposure });
await rig.show({ kind: 'image', url: '/media/reference.jpg', tf });
await rig.grab('print', 10);
rig.close();
await rig.show({ kind: 'black' });
rig.pullAll(path.join(dir, 'synth'));
fs.writeFileSync(path.join(dir, 'synth.json'), JSON.stringify({ tf, truth }, null, 2));
console.log('truth corners (projector px):', JSON.stringify(truth));
