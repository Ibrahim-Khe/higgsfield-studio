// Higgsfield Studio — local server.
// Serves the UI and proxies Higgsfield API calls so your API key never reaches the browser.
import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const JOBS_FILE = path.join(DATA, 'jobs.json');
const BALANCE_FILE = path.join(DATA, 'balance.json');
const ENV_FILE = path.join(ROOT, '.env');
const API = process.env.HF_API_BASE || 'https://api.higgsfield.ai'; // override only for testing

// ---------- config ----------
function loadEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env && process.env[m[1]])) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();
const PORT = +process.env.PORT || 5177;

function credentials() {
  const id = process.env.HF_API_KEY_ID, secret = process.env.HF_API_KEY_SECRET;
  if (id && secret) return `${id}:${secret}`;
  if (process.env.HF_KEY) return process.env.HF_KEY; // "id:secret" form used by the SDKs
  return null;
}

async function saveCredentials(id, secret) {
  let text = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf8') : '';
  const set = (k, v) => {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`.trimStart();
  };
  set('HF_API_KEY_ID', id);
  set('HF_API_KEY_SECRET', secret);
  await writeFile(ENV_FILE, text, { mode: 0o600 });
  process.env.HF_API_KEY_ID = id;
  process.env.HF_API_KEY_SECRET = secret;
}

// ---------- job history ----------
let jobs = [];
const estimateCache = new Map();
const uploads = new Set(); // public URLs of files uploaded this session
async function loadJobs() {
  await mkdir(DATA, { recursive: true });
  try { jobs = JSON.parse(await readFile(JOBS_FILE, 'utf8')); } catch { jobs = []; }
}
let saveTimer;
function saveJobs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeFile(JOBS_FILE, JSON.stringify(jobs, null, 1)).catch(console.error), 200);
}

// ---------- Higgsfield calls ----------
async function hf(pathname, { method = 'GET', body } = {}) {
  const key = credentials();
  if (!key) throw httpError(401, 'No Higgsfield API key configured. Add it in Settings.');
  const res = await fetch(pathname.startsWith('http') ? pathname : `${API}/${pathname.replace(/^\//, '')}`, {
    method,
    headers: {
      Authorization: `Key ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'User-Agent': 'higgsfield-studio/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? data);
    throw httpError(res.status, detail || `Higgsfield returned ${res.status}`);
  }
  return data;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

async function refreshJob(job) {
  if (TERMINAL.has(job.status)) return job;
  const s = await hf(job.status_url || `requests/${job.request_id}/status`);
  job.status = s.status;
  job.error = s.error ?? null;
  if (s.video?.url) job.video_url = s.video.url;
  if (s.images?.length) job.image_urls = s.images.map((i) => i.url);
  job.updated_at = new Date().toISOString();
  if (TERMINAL.has(job.status)) job.finished_at = job.updated_at;
  saveJobs();
  return job;
}

// ---------- HTTP helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit = 200 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, 'File too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function json(req) {
  const buf = await readBody(req, 5 * 1024 * 1024);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw httpError(400, 'Invalid JSON'); }
}

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i;
const UPLOAD_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'audio/wav', 'audio/x-wav']);

// ---------- routes ----------
async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/config' && req.method === 'GET') {
    const key = credentials();
    return send(res, 200, { hasKey: !!key, keyHint: key ? `${key.split(':')[0].slice(0, 6)}…` : null });
  }

  if (p === '/api/config' && req.method === 'POST') {
    const { id, secret } = await json(req);
    let keyId = (id || '').trim(), keySecret = (secret || '').trim();
    if (!keySecret && keyId.includes(':')) [keyId, keySecret] = keyId.split(':');
    if (!keyId || !keySecret) throw httpError(400, 'Both API key ID and secret are required.');
    if (!/^[\w.-]+$/.test(keyId) || !/^[\w.-]+$/.test(keySecret)) throw httpError(400, 'Key contains unexpected characters.');
    await saveCredentials(keyId, keySecret);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/upload' && req.method === 'POST') {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!UPLOAD_TYPES.has(type)) throw httpError(415, `Unsupported file type ${type || '(none)'}. Use JPG, PNG, WebP, GIF, MP4 or WAV.`);
    const buf = await readBody(req);
    const up = await hf('files/generate-upload-url', { method: 'POST', body: { content_type: type } });
    const put = await fetch(up.upload_url, { method: 'PUT', headers: up.upload_headers || { 'Content-Type': type }, body: buf });
    if (!put.ok) throw httpError(502, `Upload to storage failed (${put.status})`);
    uploads.add(up.public_url);
    return send(res, 200, { url: up.public_url, content_type: type, size: buf.length });
  }

  if (p === '/api/generate' && req.method === 'POST') {
    const { slug, input, meta } = await json(req);
    if (!SLUG_RE.test(slug || '')) throw httpError(400, 'Invalid model endpoint');
    const r = await hf(slug, { method: 'POST', body: input || {} });
    const job = {
      request_id: r.request_id,
      status: r.status || 'queued',
      status_url: r.status_url,
      cancel_url: r.cancel_url,
      slug,
      input,
      meta: meta || {},
      created_at: new Date().toISOString(),
    };
    jobs.unshift(job);
    saveJobs();
    return send(res, 200, job);
  }

  if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, jobs);

  // Exact price for this account from Higgsfield (free, no generation). Cached briefly.
  if (p === '/api/estimate' && req.method === 'POST') {
    const { slug, input } = await json(req);
    if (!SLUG_RE.test(slug || '')) throw httpError(400, 'Invalid model endpoint');
    const key = `${slug}:${JSON.stringify(input)}`;
    const hit = estimateCache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return send(res, 200, hit.data);
    const data = await hf(`estimate/${slug}`, { method: 'POST', body: input || {} });
    estimateCache.set(key, { t: Date.now(), data });
    if (estimateCache.size > 500) estimateCache.delete(estimateCache.keys().next().value);
    return send(res, 200, data);
  }

  // Higgsfield has no balance API, so the balance is entered by the user and tracked locally.
  if (p === '/api/balance' && req.method === 'GET') {
    try { return send(res, 200, JSON.parse(await readFile(BALANCE_FILE, 'utf8'))); } catch { return send(res, 200, null); }
  }
  if (p === '/api/balance' && req.method === 'POST') {
    const { amount } = await json(req);
    if (amount === null) {
      await writeFile(BALANCE_FILE, 'null');
      return send(res, 200, null);
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0 || n > 1e6) throw httpError(400, 'Enter a balance in USD, e.g. 25.00');
    const b = { amount: Math.round(n * 100) / 100, set_at: new Date().toISOString() };
    await writeFile(BALANCE_FILE, JSON.stringify(b));
    return send(res, 200, b);
  }

  let m;
  if ((m = p.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i))) {
    const job = jobs.find((j) => j.request_id === m[1]);
    if (!job) throw httpError(404, 'Unknown job');
    if (req.method === 'GET') return send(res, 200, await refreshJob(job));
    if (req.method === 'DELETE') {
      jobs = jobs.filter((j) => j !== job);
      saveJobs();
      return send(res, 200, { ok: true });
    }
  }

  if ((m = p.match(/^\/api\/jobs\/([0-9a-f-]{36})\/cancel$/i)) && req.method === 'POST') {
    const job = jobs.find((j) => j.request_id === m[1]);
    if (!job) throw httpError(404, 'Unknown job');
    await hf(job.cancel_url || `requests/${job.request_id}/cancel`, { method: 'POST' });
    job.status = 'canceled';
    job.finished_at = new Date().toISOString();
    saveJobs();
    return send(res, 200, job);
  }

  // Same-origin media proxy: lets the browser grab a clip's last frame (canvas needs CORS) and download files.
  if (p === '/api/media' && req.method === 'GET') {
    const target = url.searchParams.get('url') || '';
    const known = uploads.has(target) || jobs.some((j) => j.video_url === target || j.image_urls?.includes(target));
    if (!/^https:\/\//.test(target) || !known) throw httpError(400, 'Only generated or uploaded media can be proxied');
    const upstream = await fetch(target, { headers: req.headers.range ? { Range: req.headers.range } : {} });
    const headers = { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    for (const h of ['content-length', 'content-range']) if (upstream.headers.get(h)) headers[h] = upstream.headers.get(h);
    const name = url.searchParams.get('download');
    if (name) headers['Content-Disposition'] = `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`;
    res.writeHead(upstream.status, headers);
    return Readable.fromWeb(upstream.body).pipe(res);
  }

  throw httpError(404, 'Not found');
}

async function serveStatic(req, res, url) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

await loadJobs();
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.message });
      if (!e.status) console.error(e);
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`\n  Higgsfield Studio → http://localhost:${PORT}`);
    console.log(credentials() ? '  API key loaded.\n' : '  No API key yet — add it in the app (Settings) or in .env\n');
  });
