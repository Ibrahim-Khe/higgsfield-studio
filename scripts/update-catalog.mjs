// Crawls the public Higgsfield model pages and writes public/catalog.json:
// every video endpoint with its input schema, UI hints, durations and price range.
// Run: npm run update-catalog
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'catalog.json');
const SITE = 'https://open.higgsfield.ai';

// Pages listed on /explore/video; each page also links its sibling variants ("family").
const SEEDS = [
  'bytedance/seedance-2.5/text-to-video',
  'bytedance/seedance-2.0/text-to-video',
  'kling-video/v3.0/std/text-to-video',
  'kling-video/o3/first-last-frame',
  'kling-video/omni/first-last-frame',
  'kling-video/v2.6/pro/text-to-video',
  'kling-video/v2.5-turbo/standard/image-to-video',
  'minimax/h3/text-to-video',
  'minimax/hailuo-2.3/standard/text-to-video',
  'alibaba/wan-3.0-prime/text-to-video',
  'alibaba/wan-3.0/text-to-video',
  'wan/v2.7/text-to-video',
  'wan/v2.6/text-to-video',
  'alibaba/happy-horse/v1.1/text-to-video',
  'alibaba/happy-horse/text-to-video',
  'higgsfield/cinema-studio/4.0',
  'lightricks/ltx-2.5/text-to-video/fast',
  'lightricks/ltx-2.5/text-to-video/pro',
  'xai/grok-imagine-video/v1.5/reference-to-video',
  'pixverse/v6/text-to-video',
];

async function pageData(slug) {
  const res = await fetch(`${SITE}/models/${slug}/api-reference`, {
    headers: { 'user-agent': 'Mozilla/5.0 higgsfield-studio catalog updater' },
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)<\/script>/gs)];
  return chunks.map((m) => JSON.parse(`"${m[1]}"`)).join('');
}

// Extract a balanced JSON object starting at index `start`.
function objectAt(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function currentModel(s, slug) {
  for (const m of s.matchAll(/\{"id":"[0-9a-f-]{36}","catalog_type"/g)) {
    const o = objectAt(s, m.index);
    if (o && (o.slug === slug || o.route_slug === slug)) return o;
  }
  return null;
}

function cards(s) {
  const out = {};
  for (const m of s.matchAll(/\{"id":"[0-9a-f-]{36}","slug":"([^"]+)"/g)) {
    const o = objectAt(s, m.index);
    if (o?.price_range) out[m[1]] = o;
  }
  return out;
}

const models = {};
const cardInfo = {};
let queue = [...SEEDS];
while (queue.length) {
  const batch = [...new Set(queue)].filter((q) => !(q in models));
  queue = [];
  const results = await Promise.allSettled(batch.map(pageData));
  results.forEach((r, i) => {
    const slug = batch[i];
    models[slug] = null;
    if (r.status !== 'fulfilled') return console.warn('skip', slug, r.reason?.message);
    Object.assign(cardInfo, cards(r.value));
    const o = currentModel(r.value, slug);
    if (!o) return console.warn('no model object', slug);
    models[slug] = o;
    for (const f of o.family || []) if (!(f.slug in models)) queue.push(f.slug);
  });
}

const catalog = [];
for (const [slug, o] of Object.entries(models)) {
  if (!o || o.output_type !== 'video') continue;
  const card = cardInfo[slug] || {};
  catalog.push({
    slug,
    title: o.title,
    variant: o.variant_title,
    system: o.system_name,
    operation: o.operation_type,
    description: o.description,
    schema: o.input_schema,
    ui: o.ui_schema || {},
    initial: o.playground?.initial_values || {},
    durations: card.duration_options_seconds || [],
    price: card.price_range
      ? { min: +card.price_range.min_amount, max: +card.price_range.max_amount, unit: card.price_range.unit }
      : null,
    discountExpires: card.minimum_price?.discount_expires_at || card.discount_expires_at || null,
  });
}
catalog.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), models: catalog }, null, 1));
console.log(`Wrote ${catalog.length} video endpoints → ${OUT}`);
