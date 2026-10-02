// Zero-dependency server: static files, per-wall config/calibration/media, and a tiny
// command bus (phone remote → POST /api/cmd → SSE → projector page).
//
// Each wall lives in walls/<name>/: config.json (in git), calibration.json and media/
// (local to the box). One wall is active at a time; the remote can switch.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const WALLS = path.join(ROOT, 'walls');
const DATA = path.join(ROOT, 'data');           // runtime state only (which wall is active)
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.frag': 'text/plain', '.vert': 'text/plain',
};
const MEDIA_EXT = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

const clients = new Set();   // open SSE responses
let lastState = null;        // latest state reported by the projector page

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1e6) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file + '.tmp', JSON.stringify(obj, null, 2));
  await fsp.rename(file + '.tmp', file);
}

// ---- walls ----
async function listWalls() {
  const names = (await fsp.readdir(WALLS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  return Promise.all(names.map(async (name) => {
    const cfg = await readJson(path.join(WALLS, name, 'config.json'), {});
    return { name, title: cfg.title || name };
  }));
}
let activeWall = null;
async function wallDir() {
  if (!activeWall) {
    const walls = (await listWalls()).map((w) => w.name);
    const saved = (await readJson(path.join(DATA, 'wall.json'), {})).name;
    activeWall = [process.env.STAIRWALL_WALL, saved, 'stairwell', walls[0]].find((n) => n && walls.includes(n));
  }
  return path.join(WALLS, activeWall);
}

// One-time move from the single-wall layout (data/calibration*.json, media/) into
// walls/stairwell/, so an existing box keeps its calibration and media after updating.
async function migrate() {
  const to = path.join(WALLS, 'stairwell');
  for (const f of await fsp.readdir(DATA).catch(() => [])) {
    if (!/^calibration.*\.json$/.test(f) || (await fsp.stat(path.join(to, f)).catch(() => null))) continue;
    await fsp.rename(path.join(DATA, f), path.join(to, f));
    console.log(`migrated data/${f} → walls/stairwell/${f}`);
  }
  const oldMedia = path.join(ROOT, 'media');
  const entries = (await fsp.readdir(oldMedia).catch(() => [])).filter((f) => f !== '.gitkeep');
  if (entries.length) {
    await fsp.mkdir(path.join(to, 'media'), { recursive: true });
    for (const f of entries) {
      if (await fsp.stat(path.join(to, 'media', f)).catch(() => null)) continue;
      await fsp.rename(path.join(oldMedia, f), path.join(to, 'media', f));
      console.log(`migrated media/${f} → walls/stairwell/media/${f}`);
    }
  }
}

// Static file with Range support (Chrome needs it to loop/seek video reliably).
async function serveFile(req, res, baseDir, relPath) {
  const file = path.resolve(baseDir, '.' + path.posix.normalize('/' + relPath));
  if (!file.startsWith(baseDir + path.sep) && file !== baseDir) return json(res, 403, { error: 'forbidden' });
  let stat;
  try {
    stat = await fsp.stat(file);
    if (stat.isDirectory()) return serveFile(req, res, baseDir, path.posix.join(relPath, 'index.html'));
  } catch { return json(res, 404, { error: 'not found' }); }

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start < 0) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const routes = {
  'GET /api/calibration': async (req, res) => json(res, 200, await readJson(path.join(await wallDir(), 'calibration.json'), null)),
  'PUT /api/calibration': async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body?.corners) || body.corners.length !== 4) return json(res, 400, { error: 'need 4 corners' });
    await writeJson(path.join(await wallDir(), 'calibration.json'), body);
    json(res, 200, { ok: true });
  },
  'GET /api/config': async (req, res) => {
    const dir = await wallDir();
    json(res, 200, { ...(await readJson(path.join(dir, 'config.json'), {})), wallName: path.basename(dir) });
  },
  'GET /api/walls': async (req, res) => json(res, 200, { walls: await listWalls(), active: path.basename(await wallDir()) }),
  // Switch the active wall; the projector page reloads into it.
  'POST /api/wall': async (req, res) => {
    const { name } = (await readBody(req, 1e3)) || {};
    if (!(await listWalls()).some((w) => w.name === name)) return json(res, 400, { error: 'unknown wall' });
    activeWall = name;
    await writeJson(path.join(DATA, 'wall.json'), { name });
    json(res, 200, { ok: true, active: name });
    broadcast('cmd', { type: 'reload' });
  },
  'GET /api/media': async (req, res) => {
    // Optional ?dir=<subfolder> (e.g. paintings); plain folder names only.
    const dir = new URL(req.url, 'http://x').searchParams.get('dir') || '';
    if (dir && !/^[\w-]+$/.test(dir)) return json(res, 400, { error: 'bad dir' });
    const prefix = dir ? dir + '/' : '';
    let files = [];
    try { files = (await fsp.readdir(path.join(await wallDir(), 'media', dir))).filter((f) => MEDIA_EXT.test(f)).sort(); } catch {}
    json(res, 200, files.map((f) => ({ url: '/media/' + prefix + encodeURIComponent(f), video: /\.(mp4|webm|mov)$/i.test(f) })));
  },
  'POST /api/cmd': async (req, res) => {
    const cmd = await readBody(req, 1e4);
    if (!cmd?.type) return json(res, 400, { error: 'missing type' });
    broadcast('cmd', cmd);
    json(res, 200, { ok: true });
  },
  // Power: sleep (suspend) or shut down the box. The install script grants this user
  // permission to do so without a password. STAIRWALL_POWER_DRY=1 only logs (testing).
  'POST /api/power': async (req, res) => {
    const { action } = (await readBody(req, 1e3)) || {};
    const verb = { sleep: 'suspend', shutdown: 'poweroff' }[action];
    if (!verb) return json(res, 400, { error: 'action must be sleep or shutdown' });
    json(res, 200, { ok: true, action });
    if (action === 'shutdown') broadcast('cmd', { type: 'blackout', on: true });   // fade out first
    setTimeout(() => {
      if (process.env.STAIRWALL_POWER_DRY) return console.log(`[dry run] systemctl ${verb}`);
      const child = spawn('systemctl', [verb], { stdio: 'ignore', detached: true });
      child.on('error', (e) => console.error('power:', e.message));
      child.unref();
    }, action === 'shutdown' ? 2500 : 300);
  },
  'POST /api/state': async (req, res) => {
    lastState = await readBody(req);
    broadcast('state', lastState);
    json(res, 200, { ok: true });
  },
  'GET /api/events': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 1000\n: hi\n\n');   // reconnect quickly after a server restart
    if (lastState) res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  },
};

// Keep SSE connections alive through proxies / sleepy phones.
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/media/')) return await serveFile(req, res, path.join(await wallDir(), 'media'), p.slice(7));
    if (p === '/remote') return await serveFile(req, res, PUBLIC, 'remote.html');
    return await serveFile(req, res, PUBLIC, p);
  } catch (err) {
    console.error(req.method, req.url, err.message);
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
});

await migrate();
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`stairwall on http://localhost:${PORT}  (remote: /remote) · wall: ${path.basename(await wallDir())}`);
});
