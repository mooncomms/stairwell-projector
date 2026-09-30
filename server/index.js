// Zero-dependency server: static files, calibration/config storage, and a tiny
// command bus (phone remote → POST /api/cmd → SSE → projector page).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MEDIA = path.join(ROOT, 'media');
const DATA = path.join(ROOT, 'data');
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
  try { return JSON.parse(await fsp.readFile(path.join(DATA, file), 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, obj) {
  const p = path.join(DATA, file);
  await fsp.writeFile(p + '.tmp', JSON.stringify(obj, null, 2));
  await fsp.rename(p + '.tmp', p);
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
  'GET /api/calibration': async (req, res) => json(res, 200, await readJson('calibration.json', null)),
  'PUT /api/calibration': async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body?.corners) || body.corners.length !== 4) return json(res, 400, { error: 'need 4 corners' });
    await writeJson('calibration.json', body);
    json(res, 200, { ok: true });
  },
  'GET /api/config': async (req, res) => json(res, 200, await readJson('config.json', {})),
  'GET /api/media': async (req, res) => {
    // Optional ?dir=<subfolder> (e.g. paintings); plain folder names only.
    const dir = new URL(req.url, 'http://x').searchParams.get('dir') || '';
    if (dir && !/^[\w-]+$/.test(dir)) return json(res, 400, { error: 'bad dir' });
    const prefix = dir ? dir + '/' : '';
    let files = [];
    try { files = (await fsp.readdir(path.join(MEDIA, dir))).filter((f) => MEDIA_EXT.test(f)).sort(); } catch {}
    json(res, 200, files.map((f) => ({ url: '/media/' + prefix + encodeURIComponent(f), video: /\.(mp4|webm|mov)$/i.test(f) })));
  },
  'POST /api/cmd': async (req, res) => {
    const cmd = await readBody(req, 1e4);
    if (!cmd?.type) return json(res, 400, { error: 'missing type' });
    broadcast('cmd', cmd);
    json(res, 200, { ok: true });
  },
  'POST /api/state': async (req, res) => {
    lastState = await readBody(req);
    broadcast('state', lastState);
    json(res, 200, { ok: true });
  },
  'GET /api/events': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': hi\n\n');
    if (lastState) res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  },
};

// Keep SSE connections alive through proxies / sleepy phones.
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/media/')) return await serveFile(req, res, MEDIA, p.slice(7));
    if (p === '/remote') return await serveFile(req, res, PUBLIC, 'remote.html');
    return await serveFile(req, res, PUBLIC, p);
  } catch (err) {
    console.error(req.method, req.url, err.message);
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`stairwall on http://localhost:${PORT}  (remote: /remote)`);
});
