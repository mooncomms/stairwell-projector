// Automatic calibration, end to end, for a wall with a reference print (e.g. Camden):
//   1. capture a structured-light sequence with the projector's camera,
//   2. decode it into a camera -> projector map,
//   3. find the print in the white frame (SIFT against the wall's reference image),
//   4. write the corners (and per-pane corrections) into the wall's calibration.
//
//   node tools/autocal/run.mjs [--port 8080] [--adb adb] [--serial X] [--exposure 50]
//        [--apply]          (without it: dry run, prints the result)
//
// Needs: autocal.html open full-screen on the projector, the wall active on the server,
// camgrab on the projector (tools/camgrab/snap.sh), and the tools venv with OpenCV
// (data/tools/venv: python -m venv … && pip install opencv-python-headless numpy).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './rig.mjs';

const args = parseArgs(process.argv.slice(2));
const port = args.port || 8080, base = `http://localhost:${port}`;
const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '../..');
const config = await (await fetch(`${base}/api/config`)).json();
const wall = config.wallName;
if (!config.reference) throw new Error(`wall "${wall}" has no reference image; this tool calibrates against a known print`);
const out = path.join(root, 'data', 'autocal', `${wall}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const rigArgs = ['--port', port, ...(args.adb ? ['--adb', args.adb] : []), ...(args.serial ? ['--serial', args.serial] : []), '--exposure', args.exposure || 50];

const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit', cwd: root });
console.log(`autocal: wall ${wall} → ${out}`);
run('node', [path.join(here, 'capture.mjs'), '--out', out, ...rigArgs]);
run('node', [path.join(here, 'decode.mjs'), out]);
const py = fs.existsSync(path.join(root, 'data/tools/venv/bin/python')) ? path.join(root, 'data/tools/venv/bin/python') : 'python3';
run(py, [path.join(here, 'find_print.py'), out, path.join(out, 'white.yuv'), path.join(root, 'walls', wall, 'media', config.reference), '--panels', path.join(root, 'walls', wall, 'config.json')]);

const found = JSON.parse(fs.readFileSync(path.join(out, 'print.json'), 'utf8'));
const current = (await (await fetch(`${base}/api/calibration`)).json()) || {};
const next = { ...current, corners: found.corners, edges: [[], [], [], []] };
if (found.panelShift) { next.panelShift = found.panelShift; next.panelScale = found.panelScale; }
fs.writeFileSync(path.join(out, 'calibration.json'), JSON.stringify(next, null, 2));
console.log('corners (projector px):', found.corners.map((c) => `${c.x},${c.y}`).join('  '));
if (found.panelShift) console.log('pane shifts (cm):', JSON.stringify(found.panelShift), ' scales:', JSON.stringify(found.panelScale));
if ('apply' in args) {
  await fetch(`${base}/api/calibration`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
  console.log(`applied to wall ${wall} (previous calibration kept in ${out}/previous.json)`);
  fs.writeFileSync(path.join(out, 'previous.json'), JSON.stringify(current, null, 2));
} else console.log('dry run: add --apply to save it as the wall\'s calibration');
