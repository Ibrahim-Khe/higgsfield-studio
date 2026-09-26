// Cost estimation for Higgsfield video endpoints.
//
// Sources (Sept 2026): model pages on open.higgsfield.ai (price ranges + "Pricing" sections)
// and open.higgsfield.ai/pricing (list price vs. launch discount per family).
// All rules compute the LIST price first; the launch discount is applied on top while it's active.
// "exact" = formula published by Higgsfield. "estimate" = mapped from the published min/max range.

// Launch discounts (percent off list), valid until each model's discountExpires date.
const DISCOUNTS = [
  ['bytedance/seedance', 0.30],
  ['kling-video/', 0.45],
  ['alibaba/wan-3.0-prime/', 0.30],
  ['alibaba/wan-3.0/', 0.50],
  ['wan/', 0.50],
  ['alibaba/happy-horse', 0.30],
  ['minimax/h3/', 0.30],
  ['minimax/hailuo', 0.75],
  ['higgsfield/genjutsu', 0.50],
];

// Token-metered models: tokens = ceil(seconds × w × h × 24 / 1024); price per 1,000 tokens (list).
const TOKEN_MODELS = [
  {
    match: 'bytedance/seedance-2.5/',
    dims: { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] },
    rate: { '480p': 0.0214, '720p': 0.0214, '1080p': 0.0234 },
  },
  {
    match: 'bytedance/seedance-2.0/',
    dims: { '480p': [864, 496], '720p': [1280, 720], '1080p': [1920, 1080], '4k': [3840, 2160] },
    rate: { '480p': 0.014, '720p': 0.014, '1080p': 0.014, '4k': 0.008 },
  },
  {
    match: 'higgsfield/cinema-studio/',
    dims: { '480p': [854, 480], '720p': [1280, 720] },
    rate: { '480p': 0.0214, '720p': 0.0214 },
  },
];
const VIDEO_INPUT_MULT = 0.6;

// Flat per-second list prices by resolution, published by Higgsfield.
const PER_RES = [
  { match: 'alibaba/wan-3.0/', rate: { '480p': 0.05, '720p': 0.10, '1080p': 0.20 }, exact: true },
  // Endpoints (480p/1080p) match the published range; 720p is interpolated.
  { match: 'alibaba/wan-3.0-prime/', rate: { '480p': 0.068, '720p': 0.14, '1080p': 0.28 }, exact: false },
];

// Exact rates measured from Higgsfield's /estimate endpoint (public/rates.json, `npm run calibrate`).
let RATES = {};
export function setRates(r) {
  RATES = r?.models || {};
}

const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '21:9': 21 / 9, '3:2': 1.5, '2:3': 2 / 3 };

export function discountFor(model, now = new Date()) {
  const hit = DISCOUNTS.find(([p]) => model.slug.startsWith(p));
  const pct = RATES[model.slug] ? RATES[model.slug].discount : hit?.[1] || 0;
  if (!pct) return { pct: 0, active: false, expires: null };
  const expires = model.discountExpires ? new Date(model.discountExpires) : null;
  return { pct, active: !expires || now < expires, expires };
}

/** Exact paid/list price from the calibrated table, or null if this combination wasn't measured. */
function calibrated(model, input, seconds) {
  const r = RATES[model.slug];
  if (!r) return null;
  const key = r.params.map((n) => `${n}=${JSON.stringify(val(model, input, n))}`).join('|');
  if (r.linear) {
    const row = r.table[key];
    return row ? { paid: row.ps * seconds, list: row.list_ps * seconds } : null;
  }
  const row = r.table[`${key}|duration=${seconds}`];
  return row ? { paid: row.total, list: row.list_total } : null;
}

export function creditsPerUSD(model) {
  return RATES[model.slug]?.credits_per_usd || 16;
}

function prop(model, name) {
  return model.schema?.properties?.[name];
}

export function defaultValue(model, name) {
  const s = prop(model, name);
  if (!s) return undefined;
  if (s.default !== undefined) return s.default;
  if (s.enum) return s.enum[0];
  return undefined;
}

function val(model, input, name) {
  return input[name] ?? defaultValue(model, name);
}

/** Output seconds the request will be billed for (before input-video seconds). */
export function outputSeconds(model, input, ctx = {}) {
  if (!prop(model, 'duration')) {
    // Video edit / motion control bill by the length of the source video.
    return ctx.inputVideoSeconds || 0;
  }
  const d = +val(model, input, 'duration');
  if (!Number.isFinite(d) || d <= 0) return model.durations?.[0] || 5;
  if (input.multi_shots && Array.isArray(input.multi_prompt) && input.multi_prompt.length) {
    return input.multi_prompt.reduce((a, s) => a + (+s.duration || 0), 0) || d;
  }
  return d;
}

function aspectOf(model, input, ctx) {
  const a = val(model, input, 'aspect_ratio');
  if (a && ASPECTS[a]) return ASPECTS[a];
  if (ctx.imageAspect) return ctx.imageAspect;
  return 16 / 9;
}

function scaledDims([w, h], aspect) {
  const area = w * h;
  const W = Math.round(Math.sqrt(area * aspect));
  return [W, Math.round(area / W)];
}

function hasVideoInput(model, input) {
  return !!(input.video_url || (Array.isArray(input.video_urls) && input.video_urls.length));
}

/** Per-second list rate for range-priced models, derived from their settings. */
function rangeRate(model, input) {
  const disc = discountFor(model).pct;
  const lo = model.price.min / (1 - disc);
  const hi = model.price.max / (1 - disc);
  if (Math.abs(hi - lo) < 1e-9) return { rate: lo, exact: true, why: 'Single published rate' };

  // Kling: sound on = higher tier; mode std/pro/4k chooses the tier.
  if (model.slug.startsWith('kling-video/')) {
    const mode = val(model, input, 'mode');
    if (mode === '4k') return { rate: 0.42, exact: false, why: '4K mode (Kling 4K rate)' };
    if (mode) return { rate: mode === 'pro' ? hi : lo, exact: false, why: `${mode} mode` };
    const res = val(model, input, 'resolution');
    if (res) return { rate: res === '1080p' ? hi : lo, exact: false, why: res };
    const sound = val(model, input, 'sound');
    if (sound) return { rate: sound === 'on' ? hi : lo, exact: false, why: sound === 'on' ? 'With sound' : 'Without sound' };
  }

  // Everyone else: map the resolution list onto the price range.
  const resSchema = prop(model, 'resolution');
  if (resSchema?.enum?.length > 1) {
    const i = resSchema.enum.indexOf(val(model, input, 'resolution'));
    const t = Math.max(0, i) / (resSchema.enum.length - 1);
    return { rate: lo + (hi - lo) * t, exact: false, why: `${val(model, input, 'resolution')} tier` };
  }
  return { rate: lo, exact: false, why: 'Lowest published rate' };
}

/**
 * Estimate the cost of one request.
 * @param model  catalog entry
 * @param input  request body that will be sent
 * @param ctx    { inputVideoSeconds, imageAspect, usePromo (default true), now }
 */
export function estimate(model, input = {}, ctx = {}) {
  const now = ctx.now || new Date();
  const disc = discountFor(model, now);
  const applyPromo = disc.active && ctx.usePromo !== false;
  const k = applyPromo ? 1 - disc.pct : 1; // factor for displayed rates
  const outSec = outputSeconds(model, input, ctx);
  const lines = [];
  let list = 0;
  let exact = true;
  let perSecond = 0;
  let billedSeconds = outSec;

  let cal;
  const tok = TOKEN_MODELS.find((t) => model.slug.startsWith(t.match));
  const perRes = PER_RES.find((t) => model.slug.startsWith(t.match));

  if (tok) {
    const res = val(model, input, 'resolution') || Object.keys(tok.dims)[0];
    const base = tok.dims[res] || Object.values(tok.dims)[0];
    const aspect = aspectOf(model, input, ctx);
    const [w, h] = Math.abs(aspect - 16 / 9) < 0.01 ? base : scaledDims(base, aspect);
    if (Math.abs(aspect - 16 / 9) >= 0.01) exact = false; // exact output dims for other ratios aren't published
    const videoIn = hasVideoInput(model, input);
    const inSec = videoIn ? ctx.inputVideoSeconds || 0 : 0;
    if (videoIn && !ctx.inputVideoSeconds) exact = false;
    billedSeconds = outSec + inSec;
    const tokens = Math.ceil((billedSeconds * w * h * 24) / 1024);
    const rate = (tok.rate[res] ?? Object.values(tok.rate)[0]) * (videoIn ? VIDEO_INPUT_MULT : 1);
    list = (tokens / 1000) * rate;
    perSecond = billedSeconds ? list / billedSeconds : 0;
    lines.push({ label: 'Output', value: `${w}×${h} · ${res}` });
    if (videoIn) lines.push({ label: 'Billed seconds', value: `${outSec}s new + ${fmtSec(inSec)} input video` });
    lines.push({ label: 'Video tokens', value: tokens.toLocaleString() });
    lines.push({ label: 'Token rate', value: `$${(rate * k).toFixed(5)} / 1K${videoIn ? ' (0.6× with video input)' : ''}` });
  } else if (perRes) {
    const res = val(model, input, 'resolution');
    perSecond = perRes.rate[res] ?? Object.values(perRes.rate)[0];
    exact = perRes.exact || res !== '720p';
    list = perSecond * outSec;
    lines.push({ label: 'Rate', value: `$${(perSecond * k).toFixed(4)}/s · ${res}` });
  } else if ((cal = calibrated(model, input, outSec))) {
    // paid = list × (1 − discount) while the promo runs; keep list as the base like the other rules
    list = disc.pct ? cal.paid / (1 - disc.pct) : cal.list;
    perSecond = outSec ? list / outSec : 0;
    exact = true;
    lines.push({ label: 'Rate', value: `$${(perSecond * k).toFixed(4)}/s · measured` });
  } else if (model.price) {
    const r = rangeRate(model, input);
    perSecond = r.rate;
    exact = r.exact;
    list = perSecond * outSec;
    lines.push({ label: 'Rate', value: `$${(perSecond * k).toFixed(4)}/s · ${r.why}` });
  }

  // MiniMax H3 references: first five images included, then $0.08 each.
  if (model.slug === 'minimax/h3/reference-to-video' && Array.isArray(input.image_urls) && input.image_urls.length > 5) {
    const extra = (input.image_urls.length - 5) * 0.08;
    list += extra;
    lines.push({ label: 'Extra references', value: `${input.image_urls.length - 5} × $${(0.08 * k).toFixed(3)}` });
  }

  const total = list * k;
  return {
    total,
    list,
    perSecond: perSecond * k,
    seconds: outSec,
    billedSeconds,
    exact,
    lines,
    discount: disc,
    promoApplied: applyPromo,
  };
}

/** Cheapest possible per-second price for the model card ("from $x/s"). */
export function fromPrice(model, usePromo = true) {
  const d = discountFor(model);
  const min = model.price?.min ?? 0;
  return d.active && usePromo ? min : min / (1 - d.pct);
}

export function fmtUSD(n) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtSec(s) {
  return `${Math.round(s * 10) / 10}s`;
}
