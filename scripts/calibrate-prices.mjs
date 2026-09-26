// Builds public/rates.json from Higgsfield's free estimate endpoint (POST /estimate/<model>).
// For every per-second-priced model it finds which settings change the price and records
// the exact rate for each combination, so the app can price options without a round trip.
// Needs your API key in .env. Run: npm run calibrate
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = existsSync(path.join(ROOT, '.env')) ? readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
const get = (k) => process.env[k] || env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const KEY = get('HF_API_KEY_ID') && get('HF_API_KEY_SECRET') ? `${get('HF_API_KEY_ID')}:${get('HF_API_KEY_SECRET')}` : get('HF_KEY');
if (!KEY) { console.error('No API key in .env'); process.exit(1); }

const { models } = JSON.parse(await readFile(path.join(ROOT, 'public', 'catalog.json'), 'utf8'));
const PRICE_PARAMS = ['resolution', 'sound', 'generate_audio', 'mode', 'fps', 'bitrate_mode'];
const IMG = 'https://example.com/placeholder.png';
const VID = 'https://example.com/placeholder.mp4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function estimate(slug, input) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.higgsfield.ai/estimate/${slug}`, {
      method: 'POST',
      headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    return res.json();
  }
  return { detail: 'retry limit' };
}

function baseInput(m, duration) {
  const p = m.schema?.properties || {};
  const input = {};
  for (const [k, s] of Object.entries(p)) {
    if (s.default !== undefined) input[k] = s.default;
    else if (s.enum) input[k] = s.enum[0];
  }
  if (p.prompt) input.prompt = 'a calm lake at sunrise';
  for (const r of m.schema?.required || []) {
    if (input[r] !== undefined) continue;
    if (/image_url$|frame_url$/.test(r)) input[r] = IMG;
    else if (r === 'image_urls') input[r] = [IMG];
    else if (r === 'video_url') input[r] = VID;
    else if (r === 'video_urls') input[r] = [VID];
  }
  if (p.first_frame_url && !input.first_frame_url) input.first_frame_url = IMG;
  if (p.image_urls && !input.image_urls && !p.image_url && !p.first_frame_url) input.image_urls = [IMG];
  if (p.duration) input.duration = duration;
  return input;
}

function durationsOf(m) {
  const d = m.schema?.properties?.duration;
  if (!d) return [];
  if (d.enum) return d.enum.slice(0, 2);
  const lo = d.minimum ?? 5, hi = d.maximum ?? 10;
  return [Math.min(Math.max(5, lo), hi), Math.min(Math.max(10, lo), hi)];
}

const combos = (params) => params.reduce((acc, [k, vals]) => acc.flatMap((c) => vals.map((v) => ({ ...c, [k]: v }))), [{}]);
const keyOf = (obj, names) => names.map((n) => `${n}=${JSON.stringify(obj[n])}`).join('|');

const out = { updated: new Date().toISOString(), models: {} };
for (const m of models) {
  const durs = durationsOf(m);
  if (!durs.length) continue;
  const base = baseInput(m, durs[0]);
  const first = await estimate(m.slug, base);
  if (first.type !== 'estimate') {
    console.log(`${m.slug}: ${first.type || first.detail} (uses published formula)`);
    continue;
  }
  const perSec = (r, d) => +r.usd / d;
  const basePs = perSec(first, durs[0]);

  // Which settings move the price?
  const props = m.schema.properties;
  const affecting = [];
  for (const n of PRICE_PARAMS) {
    const s = props[n];
    if (!s) continue;
    const vals = s.enum || (s.type === 'boolean' ? [true, false] : null);
    if (!vals) continue;
    let moved = false;
    for (const v of vals) {
      if (v === base[n]) continue;
      const r = await estimate(m.slug, { ...base, [n]: v });
      if (r.type === 'estimate' && Math.abs(perSec(r, durs[0]) - basePs) > 1e-6) moved = true;
    }
    if (moved) affecting.push([n, vals]);
  }

  // Is the price linear in duration?
  let linear = true;
  if (durs[1] && durs[1] !== durs[0]) {
    const r2 = await estimate(m.slug, { ...base, duration: durs[1] });
    linear = r2.type === 'estimate' && Math.abs(perSec(r2, durs[1]) - basePs) < 1e-4;
  }

  const names = affecting.map(([n]) => n);
  const table = {};
  let pct = +(first.discount?.percentage || 0) / 100;
  for (const c of combos(affecting)) {
    const dList = linear ? [durs[0]] : (props.duration.enum || durs);
    for (const d of dList) {
      const r = await estimate(m.slug, { ...base, ...c, duration: d });
      if (r.type !== 'estimate') continue;
      const paid = +r.usd;
      const list = paid + +(r.discount?.usd || 0);
      const k = keyOf(c, names) + (linear ? '' : `|duration=${d}`);
      table[k] = linear ? { ps: paid / d, list_ps: list / d } : { total: paid, list_total: list };
      pct = +(r.discount?.percentage || 0) / 100;
    }
  }
  out.models[m.slug] = { params: names, linear, discount: pct, credits_per_usd: +first.credits / +first.usd, table };
  console.log(`${m.slug}: ${names.join(', ') || 'flat'}${linear ? '' : ' (per-duration)'} · ${Object.keys(table).length} rates`);
  await sleep(100);
}

await writeFile(path.join(ROOT, 'public', 'rates.json'), JSON.stringify(out, null, 1));
console.log(`\nWrote ${Object.keys(out.models).length} calibrated models → public/rates.json`);
