import { estimate, fromPrice, discountFor, defaultValue, outputSeconds, fmtUSD, setRates, creditsPerUSD } from './pricing.js';

// ---------------------------------------------------------------------------
// Model families (how endpoints are grouped in the picker)
// ---------------------------------------------------------------------------
const FAMILIES = [
  { id: 'seedance-2.5', name: 'Seedance 2.5', maker: 'ByteDance', re: /^bytedance\/seedance-2\.5\//, color: '#2f6bff', blurb: 'Top-tier motion and native audio. Up to 30s, and it can extend existing clips.', feats: ['30s', 'Audio', '1080p', 'Extend'] },
  { id: 'seedance-2.0', name: 'Seedance 2.0', maker: 'ByteDance', re: /^bytedance\/seedance-2\.0\//, color: '#3b82f6', blurb: 'Cinematic quality with native audio, up to 4K.', feats: ['15s', 'Audio', '4K'] },
  { id: 'kling-3', name: 'Kling 3.0', maker: 'Kuaishou', re: /^kling-video\/v3\.0(-turbo)?\//, color: '#00b37e', blurb: 'Multi-shot storytelling with native sound. Standard, Pro, 4K and Turbo tiers.', feats: ['15s', 'Sound', 'Multi-shot', '4K'] },
  { id: 'kling-o3', name: 'Kling O3', maker: 'Kuaishou', re: /^kling-video\/o3\//, color: '#0e9f6e', blurb: 'Start/end-frame control and image references.', feats: ['15s', 'First + last frame', 'References'] },
  { id: 'kling-o1', name: 'Kling O1 Omni', maker: 'Kuaishou', re: /^kling-video\/omni\//, color: '#15803d', blurb: 'Unified model for frames and references.', feats: ['10s', 'First + last frame'] },
  { id: 'kling-2.6', name: 'Kling 2.6', maker: 'Kuaishou', re: /^kling-video\/v2\.6\//, color: '#16a34a', blurb: 'Pro quality with sound, at a lower price.', feats: ['10s', 'Sound'] },
  { id: 'kling-2.5', name: 'Kling 2.5 Turbo', maker: 'Kuaishou', re: /^kling-video\/v2\.5-turbo\//, color: '#22c55e', blurb: 'Fast and cheap. Good for drafts and iteration.', feats: ['10s', 'Budget'] },
  { id: 'minimax-h3', name: 'MiniMax H3', maker: 'MiniMax', re: /^minimax\/h3\//, color: '#f43f5e', blurb: 'Native 2K output with strong subject consistency.', feats: ['15s', '2K'] },
  { id: 'hailuo-2.3', name: 'Hailuo 2.3', maker: 'MiniMax', re: /^minimax\/hailuo-2\.3\//, color: '#fb7185', blurb: 'The cheapest per second. Great for testing prompts.', feats: ['10s', 'Budget'] },
  { id: 'wan-3-prime', name: 'Wan 3.0 Prime', maker: 'Alibaba', re: /^alibaba\/wan-3\.0-prime\//, color: '#f97316', blurb: 'Flagship Wan with reasoning mode and native audio, up to 30s.', feats: ['30s', 'Audio', '1080p'] },
  { id: 'wan-3', name: 'Wan 3.0', maker: 'Alibaba', re: /^alibaba\/wan-3\.0\//, color: '#fb923c', blurb: 'Long clips with native audio at a great price.', feats: ['30s', 'Audio', 'Budget'] },
  { id: 'wan-2.7', name: 'Wan 2.7', maker: 'Alibaba', re: /^wan\/v2\.7\//, color: '#fdba74', blurb: 'Audio-driven generation with negative prompts.', feats: ['15s', 'Audio input'] },
  { id: 'wan-2.6', name: 'Wan 2.6', maker: 'Alibaba', re: /^wan\/v2\.6\//, color: '#fed7aa', blurb: 'Multi-shot option with prompt expansion.', feats: ['15s', 'Multi-shot'] },
  { id: 'happy-horse-1.1', name: 'Happy Horse 1.1', maker: 'Alibaba', re: /^alibaba\/happy-horse\/v1\.1\//, color: '#eab308', blurb: 'Dynamic action and sports motion.', feats: ['15s', '1080p'] },
  { id: 'happy-horse-1.0', name: 'Happy Horse 1.0', maker: 'Alibaba', re: /^alibaba\/happy-horse\/(text|image|reference)-/, color: '#facc15', blurb: 'The original Happy Horse model.', feats: ['15s', '1080p'] },
  { id: 'cinema-studio', name: 'Cinema Studio 4.0', maker: 'Higgsfield', re: /^higgsfield\/cinema-studio\//, color: '#a855f7', blurb: 'Director controls: camera body, lens, movement, era, genre and color grade.', feats: ['30s', 'Camera control', 'Audio'] },
  { id: 'ltx-2.5', name: 'LTX 2.5', maker: 'Lightricks', re: /^lightricks\/ltx-2\.5\//, color: '#06b6d4', blurb: 'Fast renders up to 4K at 50fps, with camera moves.', feats: ['10s', '4K', '50fps'] },
  { id: 'grok-1.5', name: 'Grok Imagine 1.5', maker: 'xAI', re: /^xai\/grok-imagine-video\//, color: '#64748b', blurb: 'Text or image references, with an optional audio track.', feats: ['15s', 'References'] },
  { id: 'pixverse-6', name: 'PixVerse V6', maker: 'PixVerse', re: /^pixverse\/v6\//, color: '#ec4899', blurb: 'Stylized effects with audio. Cheap at low resolutions.', feats: ['15s', 'Audio', 'Budget'] },
];
const FEATURED = FAMILIES.map((f) => f.id);

// Fields rendered by the media/prompt UI rather than the settings form.
const HANDLED = new Set(['prompt', 'image_url', 'first_frame_url', 'end_image_url', 'last_image_url', 'last_frame_url', 'image_urls', 'video_url', 'video_urls', 'audio_url', 'audio_urls', 'file_url', 'link_url', 'elements', 'multi_prompt']);
const ALWAYS_ADVANCED = new Set(['seed', 'negative_prompt', 'cfg_scale', 'aigc_watermark', 'output_format', 'bitrate_mode', 'enable_thinking', 'prompt_extend', 'prompt_optimizer', 'multi_shots', 'fps']);
// Settings that change the price stay visible even if the model marks them advanced.
const ALWAYS_BASIC = new Set(['sound', 'generate_audio', 'resolution', 'duration', 'aspect_ratio', 'mode']);
const LABELS = {
  sound: 'Sound', generate_audio: 'Generate audio', cfg_scale: 'Prompt adherence', enable_thinking: 'Thinking mode', prompt_extend: 'Prompt expansion',
  prompt_optimizer: 'Prompt optimizer', aigc_watermark: 'AI watermark', bitrate_mode: 'Bitrate', output_format: 'File format', multi_shots: 'Multi-shot',
  aspect_ratio: 'Aspect ratio', negative_prompt: 'Negative prompt', camera_movement: 'Camera movement', camera_model: 'Camera', camera_lens: 'Lens',
  camera_aperture: 'Aperture', color_palette: 'Color grade', keep_original_sound: 'Keep original sound', character_orientation: 'Character orientation', shot_type: 'Shot type', fps: 'Frame rate', mode: 'Quality tier',
};
const HELP = {
  cfg_scale: 'Higher values follow the prompt more literally.',
  enable_thinking: 'The model plans the shot before rendering. Slower, and often more coherent.',
  multi_shots: 'Let the model cut between several shots within the clip.',
  seed: 'Reuse a seed to get repeatable results.',
};
const NATIVE_EXTEND = 'bytedance/seedance-2.5/video-extend';
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const store = {
  get(k, d) { try { const v = localStorage.getItem(`hfs.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`hfs.${k}`, JSON.stringify(v)); } catch {} },
};

let catalog = [];
const bySlug = new Map();
const state = {
  mode: store.get('mode', 't2v'),
  slug: store.get('slug', {}), // mode key -> slug
  values: store.get('values', {}), // slug -> settings
  prompt: store.get('prompt', ''),
  usePromo: store.get('usePromo', true),
  batch: store.get('batch', 1),
  extendMethod: store.get('extendMethod', 'native'),
  libFilter: 'all',
  media: { start: null, end: null, refs: [], video: null, frame: null },
  jobs: [],
  hasKey: false,
  generating: false,
  balance: null,
};

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------
const familyOf = (slug) => FAMILIES.find((f) => f.re.test(slug));
const prop = (m, n) => m.schema?.properties?.[n];
const required = (m) => m.schema?.required || [];

function startField(m) {
  if (prop(m, 'image_url')) return 'image_url';
  if (prop(m, 'first_frame_url')) return 'first_frame_url';
  return null;
}
function endField(m) {
  return ['end_image_url', 'last_image_url', 'last_frame_url'].find((f) => prop(m, f)) || null;
}
function refsField(m) {
  return !startField(m) && prop(m, 'image_urls') ? 'image_urls' : null;
}

function modesOf(m) {
  const s = m.slug;
  const modes = new Set();
  if (s === NATIVE_EXTEND) modes.add('native');
  if (/\/text-to-video/.test(s) || s.startsWith('higgsfield/cinema-studio') || s.startsWith('xai/grok')) modes.add('t2v');
  const needsVideo = required(m).includes('video_urls') || required(m).includes('video_url');
  if (!needsVideo && (/image-to-video|first-last-frame|image-reference|reference-to-video/.test(s))) {
    if (startField(m) || refsField(m)) modes.add('i2v');
  }
  if (modes.has('i2v') && startField(m)) modes.add('frame');
  return modes;
}

/** Which catalog "mode key" is active: t2v, i2v, native or frame. */
function modeKey() {
  return state.mode === 'extend' ? state.extendMethod : state.mode;
}
function modelsFor(key) {
  return catalog.filter((m) => familyOf(m.slug) && modesOf(m).has(key));
}

function workflowOf(m) {
  const s = m.slug;
  if (s.includes('first-last-frame')) return 'First + last frame';
  if (s.includes('image-reference') || s.includes('reference-to-video')) return 'References';
  if (s.includes('image-to-video')) return 'Start frame';
  if (s.includes('text-to-video')) return 'Text';
  return m.variant;
}
function tierOf(m) {
  const paren = m.variant?.match(/\(([^)]+)\)/)?.[1];
  if (paren && !/video reference/i.test(paren)) return paren.replace(/^4k$/i, '4K');
  if (/\/fast$/.test(m.slug)) return 'Fast';
  if (/\/pro$/.test(m.slug)) return 'Pro';
  return null;
}
function variantLabel(m, key = modeKey()) {
  const sibs = modelsFor(key).filter((x) => familyOf(x.slug) === familyOf(m.slug));
  const wfs = new Set(sibs.map(workflowOf));
  const tiers = new Set(sibs.map(tierOf));
  const parts = [];
  if (wfs.size > 1) parts.push(workflowOf(m));
  if (tiers.size > 1 && tierOf(m)) parts.push(tierOf(m));
  return parts.join(' · ') || tierOf(m) || m.variant;
}

function currentModel() {
  const key = modeKey();
  const list = modelsFor(key);
  let m = bySlug.get(state.slug[key]);
  if (!m || !list.includes(m)) {
    m = list.find((x) => x.slug.startsWith('kling-video/v3.0/std')) || list.find((x) => x.slug.startsWith('bytedance/seedance-2.0')) || list[0];
    state.slug[key] = m?.slug;
  }
  return m;
}

function initials(name) {
  return name.split(' ').map((w) => (/\d/.test(w) ? w.replace(/\.0$/, '').replace(/\D/g, '') : w[0].toUpperCase())).join('').slice(0, 4);
}
function logo(f, cls = 'logo') {
  return `<span class="${cls}" style="background:${f.color}">${esc(initials(f.name))}</span>`;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------
function settingNames(m) {
  const props = Object.keys(m.schema?.properties || {});
  const order = m.ui?.['ui:order'] || ['*'];
  const listed = order.filter((n) => n !== '*' && props.includes(n));
  const rest = props.filter((n) => !listed.includes(n));
  const star = order.indexOf('*');
  const names = star === -1 ? [...listed, ...rest] : [...listed.slice(0, star), ...rest, ...listed.slice(star)];
  return names.filter((n) => !HANDLED.has(n) && m.ui?.[n]?.['ui:widget'] !== 'hidden');
}

function values(m) {
  const saved = state.values[m.slug] || {};
  const out = {};
  for (const n of settingNames(m)) {
    const s = prop(m, n);
    let v = saved[n] ?? defaultValue(m, n);
    if (n === 'duration' && v === undefined) v = s.minimum ?? m.durations?.[0];
    if (v === undefined && s.type === 'boolean') v = false;
    if (v !== undefined) out[n] = v;
  }
  return out;
}

function setValue(m, name, v) {
  state.values[m.slug] = { ...(state.values[m.slug] || {}), [name]: v };
  store.set('values', state.values);
}

function buildInput(m, overrides) {
  const input = {};
  const prompt = state.prompt.trim();
  if (prompt && prop(m, 'prompt')) input.prompt = prompt;
  const vals = overrides || values(m);
  for (const [k, v] of Object.entries(vals)) {
    if (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) continue;
    input[k] = v;
  }
  const key = modeKey();
  const sf = startField(m), ef = endField(m), rf = refsField(m);
  if (key === 'frame' && sf && state.media.frame?.url) input[sf] = state.media.frame.url;
  else if (key === 'i2v') {
    if (sf && state.media.start?.url) input[sf] = state.media.start.url;
    if (ef && state.media.end?.url) input[ef] = state.media.end.url;
    if (rf) {
      const refs = state.media.refs.map((r) => r.url).filter(Boolean);
      if (refs.length) input[rf] = refs;
    }
  }
  if (key === 'native' && state.media.video?.url) input.video_url = state.media.video.url;
  return input;
}

function costCtx() {
  const media = state.media;
  const aspectSrc = modeKey() === 'frame' ? media.frame : media.start;
  return {
    inputVideoSeconds: modeKey() === 'native' ? media.video?.seconds : undefined,
    imageAspect: aspectSrc?.aspect,
    usePromo: state.usePromo,
  };
}

// ---------------------------------------------------------------------------
// Rendering: mode + model
// ---------------------------------------------------------------------------
function renderModes() {
  document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
  const ext = state.mode === 'extend';
  $('#extendCard').hidden = !ext;
  if (ext) {
    setSeg($('#extendMethod'), state.extendMethod);
    $('#extendHint').innerHTML = state.extendMethod === 'native'
      ? '<b>Seedance 2.5 Video Extend</b> continues the real clip, keeping its motion, audio and style. You pay for the source seconds plus the new seconds.'
      : 'The <b>last frame</b> of the clip becomes the start image for any image-to-video model. It\'s usually cheaper and works with every model, but motion won\'t carry over perfectly.';
    renderExtendSource();
  }
}

function renderModel() {
  const m = currentModel();
  const f = familyOf(m.slug);
  const promo = state.usePromo;
  const d = discountFor(m);
  $('#modelCurrent').innerHTML = `
    ${logo(f)}
    <span class="meta"><span class="name">${esc(f.name)}</span><br><span class="sub">${esc(f.maker)} · ${esc(variantLabel(m))} · ${esc(durationText(m))}</span></span>
    <span class="price">from<b>${fmtUSD(fromPrice(m, promo))}/s</b>${d.active && promo && d.pct ? `<span style="color:var(--good)">−${Math.round(d.pct * 100)}%</span>` : ''}</span>
    <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`;
  const native = modeKey() === 'native';
  $('#browseBtn').hidden = native;
  $('#modelCurrent').disabled = native;

  const sibs = modelsFor(modeKey()).filter((x) => familyOf(x.slug) === f).sort((a, b) => fromPrice(a) - fromPrice(b));
  const box = $('#variants');
  box.innerHTML = sibs.length > 1
    ? sibs.map((x) => `<button type="button" class="variant" role="radio" aria-checked="${x === m}" data-slug="${x.slug}">${esc(variantLabel(x))}<small>${fmtUSD(fromPrice(x, promo))}/s</small></button>`).join('')
    : '';
}

function durationText(m) {
  const d = m.durations || [];
  if (!prop(m, 'duration')) return 'length of source video';
  if (d.length === 2) return `${d[0]}–${d[1]}s`;
  if (d.length) return `${d.join(' / ')}s`;
  return '';
}

// ---------------------------------------------------------------------------
// Rendering: media inputs
// ---------------------------------------------------------------------------
const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>';

function dropHTML(slot, label, item, { hint = 'Drop, paste or click', accept = 'image/*', tag } = {}) {
  if (item?.preview) {
    const media = item.kind === 'video'
      ? `<video src="${item.preview}" muted loop playsinline autoplay></video>`
      : `<img src="${item.preview}" alt="${esc(label)}">`;
    return `<div class="drop filled" data-slot="${slot}">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}${media}
      <button type="button" class="remove" data-remove="${slot}" aria-label="Remove">✕</button>
      ${item.uploading ? `<div class="uploading"><i style="width:${Math.round((item.progress || 0) * 100)}%"></i></div>` : ''}
      ${item.caption ? `<span class="caption">${esc(item.caption)}</span>` : ''}
    </div>`;
  }
  return `<label class="drop" data-slot="${slot}" tabindex="0">
    ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
    ${ICON_UP}<b>${esc(label)}</b><small>${esc(hint)}</small>
    <input type="file" accept="${accept}" hidden data-file="${slot}">
  </label>`;
}

function renderMedia() {
  const m = currentModel();
  const key = modeKey();
  const box = $('#mediaInputs');
  if (key !== 'i2v') {
    box.innerHTML = '';
    return;
  }
  const sf = startField(m), ef = endField(m), rf = refsField(m);
  let html = '<div class="field"><div class="label-row"><span class="setting-label">Images</span></div>';
  if (sf) {
    html += '<div class="media-row">';
    html += dropHTML('start', 'Start frame', state.media.start, { tag: 'Start', hint: 'The first frame of your clip' });
    if (ef) html += dropHTML('end', 'End frame (optional)', state.media.end, { tag: 'End', hint: 'Where the clip should land' });
    html += '</div>';
  } else if (rf) {
    html += '<p class="hint" style="margin:0 0 4px">Reference images: characters, products, locations or style. The model keeps them consistent.</p><div class="refs">';
    state.media.refs.forEach((r, i) => { html += dropHTML(`ref:${i}`, 'Ref', r, {}); });
    if (state.media.refs.length < 9) html += dropHTML('ref:new', 'Add', null, { hint: '' });
    html += '</div>';
  }
  html += '</div>';
  box.innerHTML = html;
}

function renderExtendSource() {
  const box = $('#extendSource');
  const clips = state.jobs.filter((j) => j.status === 'completed' && j.video_url);
  const sel = state.media.video;
  let html = '<div class="source-pick" role="radiogroup" aria-label="Source clip">';
  html += `<label class="drop source-upload" data-slot="video" tabindex="0">${ICON_UP}<b>Upload MP4</b><small>or drop a file</small><input type="file" accept="video/mp4" hidden data-file="video"></label>`;
  for (const j of clips.slice(0, 30)) {
    html += `<button type="button" class="source-clip" role="radio" aria-checked="${sel?.jobId === j.request_id}" data-source="${j.request_id}">
      <video src="${esc(j.video_url)}#t=0.5" muted preload="metadata"></video>
      <span>${esc(familyOf(j.slug)?.name || j.slug)} · ${esc((j.meta?.prompt || '').slice(0, 40))}</span></button>`;
  }
  html += '</div>';
  if (!clips.length) html += '<p class="hint" style="margin-top:10px">Generate a clip first, or upload an MP4.</p>';
  if (sel) {
    html += `<div class="frame-preview">`;
    if (state.extendMethod === 'frame') {
      const fr = state.media.frame;
      html += fr?.preview ? `<img src="${fr.preview}" alt="Last frame">` : '<span class="spinner"></span>';
      html += `<span>${fr?.preview ? `<b>Last frame</b> captured at ${fr.time?.toFixed(1)}s${fr.uploading ? ' · uploading…' : fr.url ? ' · ready' : ''}` : 'Capturing the last frame…'}<br>`;
    } else {
      html += `<video src="${sel.preview}" muted style="width:112px;height:63px;object-fit:cover;border-radius:6px;background:#000"></video><span>`;
    }
    html += `Source: <b>${esc(sel.name)}</b>${sel.seconds ? ` · ${sel.seconds.toFixed(1)}s` : ''}${sel.uploading ? ` · uploading ${Math.round((sel.progress || 0) * 100)}%` : ''}</span></div>`;
  }
  box.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendering: settings form (schema driven)
// ---------------------------------------------------------------------------
function pretty(v) {
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  const s = String(v);
  if (/^\d+:\d+$/.test(s) || /^\d+p$/i.test(s)) return s;
  if (/^\d+k$/i.test(s)) return s.toUpperCase();
  return s.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
function labelFor(m, n) {
  return LABELS[n] || prop(m, n)?.title || pretty(n);
}
function schemaType(s) {
  if (s.type) return s.type;
  const alt = (s.anyOf || s.oneOf || []).find((x) => x.type && x.type !== 'null');
  return alt?.type;
}
function ratioGlyph(r) {
  const [w, h] = r.split(':').map(Number);
  if (!w || !h) return '';
  const k = 14 / Math.max(w, h);
  return `<span class="ratio" style="width:${Math.max(5, w * k)}px;height:${Math.max(5, h * k)}px"></span>`;
}

function renderSettings() {
  const m = currentModel();
  const vals = values(m);
  const basic = [], adv = [];
  for (const n of settingNames(m)) {
    const s = prop(m, n);
    const isAdv = !ALWAYS_BASIC.has(n) && (ALWAYS_ADVANCED.has(n) || m.ui?.[n]?.['ui:options']?.advanced === true);
    const html = settingHTML(m, n, s, vals[n]);
    if (html) (isAdv ? adv : basic).push(html);
  }
  $('#settings').innerHTML = basic.join('') || '<p class="hint" style="margin:0">This model has no extra settings.</p>';
  $('#advanced').innerHTML = adv.join('');
  updateDeltas();
}

function settingHTML(m, n, s, v) {
  const label = labelFor(m, n);
  const help = HELP[n] ? `<span class="setting-help">${esc(HELP[n])}</span>` : '';
  const type = schemaType(s);
  if (s.enum) {
    const opts = s.enum;
    const short = opts.length <= 8 && opts.every((o) => String(o).length <= 14);
    if (short) {
      return `<div class="setting ${opts.length > 5 ? 'wide' : ''}" data-name="${n}"><span class="setting-label">${esc(label)}</span>
        <div class="pills" role="radiogroup" aria-label="${esc(label)}">${opts.map((o) => `<button type="button" class="pill" role="radio" aria-checked="${o === v}" data-set="${n}" data-val='${esc(JSON.stringify(o))}'>${n === 'aspect_ratio' ? ratioGlyph(String(o)) : ''}${esc(pretty(o))}<small class="delta" data-delta="${n}" data-for='${esc(JSON.stringify(o))}'></small></button>`).join('')}</div>${help}</div>`;
    }
    return `<div class="setting" data-name="${n}"><label class="setting-label" for="f-${n}">${esc(label)}</label>
      <select id="f-${n}" data-set="${n}" data-kind="enum">${opts.map((o) => `<option value='${esc(JSON.stringify(o))}' ${o === v ? 'selected' : ''}>${esc(pretty(o))}</option>`).join('')}</select>${help}</div>`;
  }
  if (type === 'boolean') {
    return `<div class="setting" data-name="${n}"><label class="toggle-row"><span class="setting-label">${esc(label)} <small class="delta" data-delta="${n}" data-for="${!v}"></small></span>
      <input type="checkbox" data-set="${n}" data-kind="bool" ${v ? 'checked' : ''}><span class="switch"></span></label>${help}</div>`;
  }
  if (n === 'seed') {
    return `<div class="setting" data-name="${n}"><label class="setting-label" for="f-seed">Seed</label>
      <div class="seed-row"><input id="f-seed" type="number" placeholder="Random" value="${v ?? ''}" min="${s.minimum ?? 0}" max="${s.maximum ?? 2147483647}" data-set="seed" data-kind="int">
      <button type="button" class="btn sm" data-dice title="Random seed">🎲</button></div>${help}</div>`;
  }
  if ((type === 'integer' || type === 'number') && s.minimum !== undefined && s.maximum !== undefined) {
    const step = type === 'integer' ? 1 : s.multipleOf || 0.01;
    const unit = n === 'duration' ? 's' : '';
    return `<div class="setting ${n === 'duration' ? 'wide' : ''}" data-name="${n}"><span class="setting-label"><label for="f-${n}">${esc(label)}</label><output id="o-${n}">${v}${unit}</output></span>
      <input id="f-${n}" type="range" min="${s.minimum}" max="${s.maximum}" step="${step}" value="${v}" data-set="${n}" data-kind="${type === 'integer' ? 'int' : 'num'}">
      <div class="range-row"><span class="ticks" style="width:100%"><span>${s.minimum}${unit}</span>${n === 'duration' ? `<span id="durCost"></span>` : ''}<span>${s.maximum}${unit}</span></span></div>${help}</div>`;
  }
  if (type === 'string') {
    const long = /prompt/.test(n);
    return `<div class="setting ${long ? 'wide' : ''}" data-name="${n}"><label class="setting-label" for="f-${n}">${esc(label)}</label>
      ${long ? `<textarea id="f-${n}" rows="2" data-set="${n}" data-kind="str" placeholder="${n === 'negative_prompt' ? 'Things to avoid: blur, text, extra limbs…' : ''}">${esc(v ?? '')}</textarea>` : `<input id="f-${n}" data-set="${n}" data-kind="str" value="${esc(v ?? '')}">`}${help}</div>`;
  }
  return '';
}

/** Shows how much each option would change the price, e.g. "1080p +$0.40". */
function updateDeltas() {
  const m = currentModel();
  const vals = values(m);
  const base = estimate(m, buildInput(m, vals), costCtx()).total;
  document.querySelectorAll('.delta').forEach((el) => {
    const n = el.dataset.delta;
    const v = JSON.parse(el.dataset.for);
    if (vals[n] === v) { el.textContent = ''; return; }
    const alt = estimate(m, buildInput(m, { ...vals, [n]: v }), costCtx()).total;
    const d = alt - base;
    el.textContent = Math.abs(d) < Math.max(0.005, base * 0.01) ? '' : `${d > 0 ? '+' : '−'}${fmtUSD(Math.abs(d))}`;
    el.style.color = d > 0 ? 'var(--faint)' : 'var(--good)';
    el.style.fontSize = '11px';
  });
  const durEl = $('#durCost');
  if (durEl) {
    const e = estimate(m, buildInput(m, vals), costCtx());
    durEl.textContent = `${fmtUSD(e.perSecond)} per second`;
  }
}

// ---------------------------------------------------------------------------
// Cost panel
// ---------------------------------------------------------------------------
let lastTotal = null;

// ---- live prices from Higgsfield's /estimate endpoint ----
const liveCache = new Map(); // key -> response
const formulaOnly = new Set(); // slugs that answer with a pricing description instead of a number
let liveTimer;
const PLACEHOLDER_IMG = 'https://example.com/placeholder.png';

function estimateInput(m, input) {
  // Prompt and media don't change the price, so fixed placeholders keep the cache effective.
  const x = { ...input };
  if (prop(m, 'prompt')) x.prompt = 'x';
  for (const f of ['image_url', 'first_frame_url', 'end_image_url', 'last_image_url', 'last_frame_url']) {
    if (x[f] || (required(m).includes(f) || (f === startField(m) && modeKey() !== 't2v'))) x[f] = PLACEHOLDER_IMG;
  }
  if (x.image_urls || (refsField(m) && modeKey() === 'i2v')) x.image_urls = (x.image_urls || [PLACEHOLDER_IMG]).map(() => PLACEHOLDER_IMG);
  return x;
}

function liveFor(m, input) {
  if (!state.hasKey || formulaOnly.has(m.slug) || modeKey() === 'native') return { key: null, data: null };
  const body = estimateInput(m, input);
  const key = `${m.slug}:${JSON.stringify(body)}`;
  return { key, body, data: liveCache.get(key) };
}

function requestLive(m, live) {
  if (!live.key || liveCache.has(live.key)) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    try {
      const r = await api('/api/estimate', { method: 'POST', body: JSON.stringify({ slug: m.slug, input: live.body }) });
      if (r.type === 'description') formulaOnly.add(m.slug);
      else liveCache.set(live.key, r);
    } catch {
      liveCache.set(live.key, { type: 'error' });
    }
    renderCost();
  }, 350);
}

/** The price shown and recorded: live from Higgsfield when available, else the local engine. */
function priceNow(m, input) {
  const e = estimate(m, input, costCtx());
  const live = liveFor(m, input);
  const r = live.data;
  if (r?.type === 'estimate') {
    const paid = +r.usd;
    const list = paid + +(r.discount?.usd || 0);
    const total = state.usePromo || !e.discount.active ? paid : list;
    return { ...e, total, list, perSecond: e.billedSeconds ? total / e.billedSeconds : 0, exact: true, source: 'live', credits: +r.credits, liveDiscount: +(r.discount?.percentage || 0) / 100, live };
  }
  return { ...e, source: 'local', credits: e.total * creditsPerUSD(m), live };
}

function remainingBalance() {
  const b = state.balance;
  if (!b) return null;
  const since = new Date(b.set_at);
  const spent = state.jobs
    .filter((j) => new Date(j.created_at) >= since && !['failed', 'nsfw', 'canceled'].includes(j.status))
    .reduce((a, j) => a + (j.meta?.cost || 0), 0);
  return { amount: b.amount, spent, left: b.amount - spent, since };
}

function renderCost() {
  const m = currentModel();
  const input = buildInput(m);
  const e = priceNow(m, input);
  requestLive(m, e.live);
  const n = state.batch;
  const val = $('#costValue');
  val.textContent = fmtUSD(e.total * n);
  if (lastTotal !== null && Math.abs(lastTotal - e.total * n) > 1e-9) {
    val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
  }
  lastTotal = e.total * n;
  const d = e.discount;
  const promoOn = d.pct && d.active && state.usePromo;
  $('#costList').textContent = promoOn && e.list > e.total + 1e-9 ? fmtUSD(e.list * n) : '';
  $('.cost-top .eyebrow').textContent = n > 1 ? `Cost for ${n} clips` : 'Cost per clip';
  const secs = e.billedSeconds !== e.seconds ? `${e.billedSeconds.toFixed(1)} billed s` : `${e.seconds}s`;
  $('#costRate').textContent = `${fmtUSD(e.perSecond)}/s × ${secs}${n > 1 ? ` × ${n} clips` : ''} · ${(e.credits * n).toFixed(2)} credits`;
  const badge = $('#costBadge');
  badge.textContent = e.source === 'live' ? 'Live' : e.exact ? 'Exact' : 'Estimate';
  badge.classList.toggle('est', !e.exact);
  badge.classList.toggle('live', e.source === 'live');
  badge.title = e.source === 'live'
    ? "Quoted by Higgsfield's estimate endpoint for your account. This is what you'll be charged."
    : e.exact
      ? 'Calculated from the pricing formula or the rates Higgsfield publishes for this model.'
      : 'Higgsfield publishes a price range for this model. This number is mapped from your settings onto that range, so the final charge can differ slightly.';

  const note = $('#promoNote');
  if (d.pct && d.active) {
    note.className = `promo-note${state.usePromo ? '' : ' off'}`;
    note.textContent = state.usePromo
      ? `−${Math.round(d.pct * 100)}% launch price until ${fmtDate(d.expires)}. List price: ${fmtUSD(e.list * n)}`
      : `Showing list price. Launch price until ${fmtDate(d.expires)}: ${fmtUSD(e.list * (1 - d.pct) * n)}`;
  } else note.textContent = '';

  const lines = [
    ['Model', `${familyOf(m.slug).name} · ${variantLabel(m)}`],
    ['Duration', prop(m, 'duration') ? `${e.seconds}s` : `${e.seconds ? e.seconds.toFixed(1) + 's' : '—'} (source length)`],
    ...e.lines.map((l) => [l.label, l.value]),
    ['Price source', e.source === 'live' ? 'Higgsfield estimate API' : e.exact ? 'Published pricing' : 'Estimated from range'],
  ];
  $('#breakdown').innerHTML = lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  const blocker = validate(m, input);
  $('#blocker').textContent = blocker || '';
  const bal = remainingBalance();
  $('#balWarn').textContent = bal && e.total * n > bal.left + 1e-9
    ? `This is more than your remaining balance (≈${fmtUSD(Math.max(0, bal.left))}). Add funds first, or Higgsfield will reject the request.`
    : '';
  const btn = $('#generateBtn');
  btn.disabled = !!blocker || state.generating;
  $('#generateLabel').innerHTML = state.generating
    ? '<span class="spinner"></span> Submitting…'
    : `Generate${n > 1 ? ` ${n} clips` : ''} · ${fmtUSD(e.total * n)}`;
  updateDeltas();
  renderCompare();
}

function validate(m, input) {
  if (!state.hasKey) return 'Add your Higgsfield API key to generate.';
  const key = modeKey();
  const uploading = [state.media.start, state.media.end, state.media.video, state.media.frame, ...state.media.refs].some((x) => x?.uploading);
  if (key === 'native' || key === 'frame') {
    if (!state.media.video) return 'Pick a clip to extend.';
    if (key === 'native' && !state.media.video.url) return state.media.video.uploading ? 'Uploading video…' : 'Video not uploaded yet.';
    if (key === 'frame' && !state.media.frame?.url) return 'Capturing the last frame…';
  }
  if (key === 'i2v') {
    const sf = startField(m), rf = refsField(m);
    if (sf && !input[sf]) return uploading ? 'Uploading image…' : 'Add a start frame image.';
    if (!sf && rf && !input[rf]?.length) return uploading ? 'Uploading image…' : 'Add at least one reference image.';
  }
  if (uploading) return 'Waiting for uploads to finish…';
  if ((required(m).includes('prompt') || key === 't2v' || key === 'native') && !input.prompt) {
    return key === 'native' ? 'Describe what happens next.' : 'Write a prompt.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compare: same settings across other models
// ---------------------------------------------------------------------------
const resNum = (r) => {
  const s = String(r).toLowerCase();
  if (s === '4k') return 2160;
  if (s === '2k') return 1440;
  return parseInt(s, 10) || 0;
};

function mapSettings(from, fromVals, to) {
  const vals = values(to);
  const secs = outputSeconds(from, buildInput(from, fromVals), costCtx());
  const d = prop(to, 'duration');
  if (d) {
    if (d.enum) vals.duration = d.enum.reduce((a, b) => (Math.abs(b - secs) < Math.abs(a - secs) ? b : a));
    else vals.duration = Math.min(d.maximum ?? secs, Math.max(d.minimum ?? secs, secs));
  }
  const fromRes = fromVals.resolution ?? (fromVals.mode === '4k' ? '4k' : null);
  const r = prop(to, 'resolution');
  if (r?.enum && fromRes) {
    const target = resNum(fromRes);
    vals.resolution = r.enum.reduce((a, b) => (Math.abs(resNum(b) - target) < Math.abs(resNum(a) - target) ? b : a));
  }
  const ar = prop(to, 'aspect_ratio');
  if (ar?.enum && fromVals.aspect_ratio && ar.enum.includes(fromVals.aspect_ratio)) vals.aspect_ratio = fromVals.aspect_ratio;
  const audio = fromVals.generate_audio ?? (fromVals.sound ? fromVals.sound === 'on' : undefined);
  if (audio !== undefined) {
    if (prop(to, 'generate_audio')) vals.generate_audio = audio;
    if (prop(to, 'sound')) vals.sound = audio ? 'on' : 'off';
  }
  return vals;
}

function renderCompare() {
  const m = currentModel();
  const key = modeKey();
  const card = $('.compare-card');
  if (key === 'native') { card.hidden = true; return; }
  card.hidden = false;
  const fromVals = values(m);
  const rows = [];
  for (const f of FAMILIES) {
    const variants = modelsFor(key).filter((x) => familyOf(x.slug) === f);
    if (!variants.length) continue;
    let best = null;
    for (const v of variants) {
      const vals = v === m ? fromVals : mapSettings(m, fromVals, v);
      const e = estimate(v, buildInput(v, vals), { ...costCtx(), inputVideoSeconds: undefined });
      const cand = { f, m: v, e, vals };
      if (v === m) { best = cand; break; }
      if (!best || e.total < best.e.total) best = cand;
    }
    rows.push(best);
  }
  rows.sort((a, b) => a.e.total - b.e.total);
  const max = Math.max(...rows.map((r) => r.e.total), 0.0001);
  $('#compare').innerHTML = rows.map((r) => `
    <li class="${r.m === m ? 'current' : ''}"><button type="button" data-pick="${r.m.slug}" title="Switch to ${esc(r.f.name)}">
      ${logo(r.f)}
      <span class="cname">${esc(r.f.name)}<small>${esc(variantLabel(r.m))}${r.e.exact ? '' : ' · est.'}</small><span class="bar"><i style="width:${Math.max(3, (r.e.total / max) * 100)}%"></i></span></span>
      <span class="cprice">${fmtUSD(r.e.total)}<small>${r.e.seconds}s</small></span>
    </button></li>`).join('');
}

// ---------------------------------------------------------------------------
// Model browser
// ---------------------------------------------------------------------------
const browser = { q: '', filters: new Set(), sort: 'featured' };
const FILTERS = [
  ['audio', 'Audio', (ms) => ms.some((m) => prop(m, 'generate_audio') || prop(m, 'sound'))],
  ['long', '20s+', (ms) => ms.some((m) => (prop(m, 'duration')?.maximum || 0) >= 20)],
  ['hires', '1080p+', (ms) => ms.some((m) => (prop(m, 'resolution')?.enum || []).some((r) => resNum(r) >= 1080) || /4k/.test(m.slug) || /h3/.test(m.slug))],
  ['budget', 'Under $0.05/s', (ms) => ms.some((m) => fromPrice(m, state.usePromo) < 0.05)],
  ['endframe', 'End frame', (ms) => ms.some((m) => endField(m))],
];

function renderBrowser() {
  $('#browserFilters').innerHTML = FILTERS.map(([id, label]) => `<button type="button" class="chip" aria-pressed="${browser.filters.has(id)}" data-filter="${id}">${label}</button>`).join('');
  const key = modeKey();
  const cur = familyOf(currentModel().slug);
  let fams = FAMILIES.map((f) => ({ f, ms: modelsFor(key).filter((m) => familyOf(m.slug) === f) })).filter((x) => x.ms.length);
  const q = browser.q.toLowerCase();
  if (q) fams = fams.filter(({ f, ms }) => `${f.name} ${f.maker} ${f.blurb} ${f.feats.join(' ')} ${ms.map((m) => m.variant).join(' ')}`.toLowerCase().includes(q));
  for (const id of browser.filters) {
    const test = FILTERS.find((x) => x[0] === id)[2];
    fams = fams.filter(({ ms }) => test(ms));
  }
  const minPrice = (ms) => Math.min(...ms.map((m) => fromPrice(m, state.usePromo)));
  const maxDur = (ms) => Math.max(...ms.map((m) => prop(m, 'duration')?.maximum || Math.max(...(prop(m, 'duration')?.enum || [0]))));
  if (browser.sort === 'price') fams.sort((a, b) => minPrice(a.ms) - minPrice(b.ms));
  else if (browser.sort === 'duration') fams.sort((a, b) => maxDur(b.ms) - maxDur(a.ms));
  else fams.sort((a, b) => FEATURED.indexOf(a.f.id) - FEATURED.indexOf(b.f.id));

  $('#familyGrid').innerHTML = fams.map(({ f, ms }) => {
    const p = minPrice(ms);
    const d = discountFor(ms[0]);
    const list = Math.min(...ms.map((m) => fromPrice(m, false)));
    return `<button type="button" class="family ${f === cur ? 'current' : ''}" data-family="${f.id}">
      <span class="family-top">${logo(f)}<span class="meta"><span class="name">${esc(f.name)}</span><br><span class="maker">${esc(f.maker)} · ${ms.length} variant${ms.length > 1 ? 's' : ''}</span></span>
      <span class="price">from<b>${fmtUSD(p)}/s</b>${d.active && state.usePromo && d.pct ? `<s>${fmtUSD(list)}</s>` : ''}</span></span>
      <p>${esc(f.blurb)}</p>
      <span class="feats">${f.feats.map((x) => `<span>${esc(x)}</span>`).join('')}</span>
    </button>`;
  }).join('') || '<p class="no-results">No models match. Try clearing the filters.</p>';
}

function pickFamily(fid) {
  const f = FAMILIES.find((x) => x.id === fid);
  const key = modeKey();
  const cur = currentModel();
  const ms = modelsFor(key).filter((m) => familyOf(m.slug) === f);
  // Prefer the same tier/workflow as the current model; otherwise the cheapest variant.
  const pick = ms.find((m) => tierOf(m) === tierOf(cur) && workflowOf(m) === workflowOf(cur))
    || ms.find((m) => workflowOf(m) === workflowOf(cur))
    || ms.slice().sort((a, b) => fromPrice(a) - fromPrice(b))[0];
  selectModel(pick.slug);
}

function selectModel(slug) {
  state.slug[modeKey()] = slug;
  store.set('slug', state.slug);
  renderAll();
}

// ---------------------------------------------------------------------------
// Uploads & frame capture
// ---------------------------------------------------------------------------
function upload(blob, type, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      xhr.status < 300 ? resolve(body) : reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

function imageAspect(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img.naturalWidth / img.naturalHeight);
    img.onerror = () => res(undefined);
    img.src = src;
  });
}

async function handleImage(slot, file) {
  if (!file) return;
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.type)) return toast('Use a JPG, PNG, WebP or GIF image.', 'error');
  const preview = URL.createObjectURL(file);
  const item = { kind: 'image', preview, uploading: true, progress: 0, caption: file.name };
  if (slot.startsWith('ref')) {
    const i = slot === 'ref:new' ? state.media.refs.length : +slot.split(':')[1];
    state.media.refs[i] = item;
  } else state.media[slot] = item;
  item.aspect = await imageAspect(preview);
  refreshMedia();
  try {
    const r = await upload(file, file.type, (p) => { item.progress = p; refreshMediaProgress(); });
    item.url = r.url;
    item.uploading = false;
    item.caption = '';
  } catch (e) {
    toast(e.message, 'error');
    removeSlot(slot);
  }
  refreshMedia();
}

function removeSlot(slot) {
  if (slot.startsWith('ref:')) state.media.refs.splice(+slot.split(':')[1], 1);
  else state.media[slot] = null;
  refreshMedia();
}

function videoDuration(src) {
  return new Promise((res) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => res(v.duration);
    v.onerror = () => res(undefined);
    v.src = src;
  });
}

async function captureLastFrame(src) {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('Could not load the video to grab its last frame.')); });
  const t = Math.max(0, v.duration - 0.06);
  await new Promise((res) => { v.onseeked = res; v.currentTime = t; });
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { blob, time: t, aspect: v.videoWidth / v.videoHeight };
}

let sourceToken = 0;
async function setSource(src) {
  const token = ++sourceToken;
  state.media.video = src;
  state.media.frame = null;
  if (!src.seconds) src.seconds = await videoDuration(src.preview);
  renderExtendSource();
  renderCost();
  if (state.extendMethod === 'frame') await prepareFrame(token);
}

async function prepareFrame(token = sourceToken) {
  const src = state.media.video;
  if (!src || state.media.frame) return;
  try {
    const f = await captureLastFrame(src.preview);
    if (token !== sourceToken) return;
    const preview = URL.createObjectURL(f.blob);
    state.media.frame = { kind: 'image', preview, time: f.time, aspect: f.aspect, uploading: true };
    renderExtendSource();
    const r = await upload(f.blob, 'image/png');
    if (token !== sourceToken) return;
    state.media.frame.url = r.url;
    state.media.frame.uploading = false;
  } catch (e) {
    toast(e.message, 'error');
  }
  renderExtendSource();
  renderCost();
}

async function handleVideoFile(file) {
  if (!file) return;
  if (file.type !== 'video/mp4') return toast('Upload an MP4 file.', 'error');
  const preview = URL.createObjectURL(file);
  const src = { kind: 'video', preview, name: file.name, uploading: true, progress: 0 };
  await setSource(src);
  try {
    const r = await upload(file, 'video/mp4', (p) => { src.progress = p; if (state.media.video === src) renderExtendSource(); });
    src.url = r.url;
  } catch (e) {
    toast(e.message, 'error');
    if (state.media.video === src) state.media.video = null;
  }
  src.uploading = false;
  renderExtendSource();
  renderCost();
}

function selectJobAsSource(id) {
  const j = state.jobs.find((x) => x.request_id === id);
  if (!j) return;
  setSource({
    kind: 'video', jobId: j.request_id, url: j.video_url, name: `${familyOf(j.slug)?.name || 'Clip'} clip`,
    preview: `/api/media?url=${encodeURIComponent(j.video_url)}`, seconds: j.meta?.seconds_actual,
  });
}

function refreshMedia() {
  renderMedia();
  renderCost();
}
function refreshMediaProgress() {
  document.querySelectorAll('.uploading i').forEach((el) => {
    const slot = el.closest('.drop')?.dataset.slot;
    const item = slot?.startsWith('ref:') ? state.media.refs[+slot.split(':')[1]] : state.media[slot];
    if (item) el.style.width = `${Math.round((item.progress || 0) * 100)}%`;
  });
}

// ---------------------------------------------------------------------------
// Generate & library
// ---------------------------------------------------------------------------
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function generate() {
  const m = currentModel();
  const input = buildInput(m);
  if (validate(m, input) || state.generating) return;
  const e = priceNow(m, input);
  const f = familyOf(m.slug);
  const meta = {
    mode: modeKey(), family: f.name, variant: variantLabel(m), cost: e.total, list: e.list, exact: e.exact, price_source: e.source, credits: e.credits,
    prompt: state.prompt.trim(), seconds: e.seconds, resolution: input.resolution || (input.mode ? input.mode : null),
    aspect: input.aspect_ratio || null, audio: input.generate_audio ?? (input.sound ? input.sound === 'on' : null),
    source: state.media.video?.jobId || null,
  };
  state.generating = true;
  renderCost();
  const n = state.batch;
  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      const job = await api('/api/generate', { method: 'POST', body: JSON.stringify({ slug: m.slug, input, meta }) });
      state.jobs.unshift(job);
      ok++;
    } catch (err) {
      toast(err.message, 'error');
      break;
    }
  }
  state.generating = false;
  if (ok) toast(`Queued ${ok} clip${ok > 1 ? 's' : ''} on ${f.name} · est. ${fmtUSD(e.total * ok)}`, 'ok');
  renderLibrary();
  renderCost();
  schedulePoll(1500);
}

let pollTimer;
const pollDelay = new Map();
function schedulePoll(ms = 3000) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, ms);
}
async function poll() {
  const active = state.jobs.filter((j) => !TERMINAL.has(j.status));
  if (!active.length) return;
  await Promise.all(active.map(async (j) => {
    try {
      const u = await api(`/api/jobs/${j.request_id}`);
      const was = j.status;
      Object.assign(j, u);
      if (was !== j.status && j.status === 'completed') toast(`${j.meta?.family || 'Clip'} finished`, 'ok');
      if (was !== j.status && (j.status === 'failed' || j.status === 'nsfw')) toast(`${j.meta?.family || 'Clip'} ${j.status === 'nsfw' ? 'was blocked by moderation' : 'failed'}${j.error ? `: ${j.error}` : ''}`, 'error');
    } catch (e) {
      console.warn(e);
    }
  }));
  renderLibrary();
  renderCost();
  if (state.mode === 'extend') renderExtendSource();
  const stillActive = state.jobs.some((j) => !TERMINAL.has(j.status));
  if (stillActive) {
    const d = Math.min((pollDelay.get('d') || 3000) * 1.3, 10000);
    pollDelay.set('d', d);
    schedulePoll(d);
  } else pollDelay.set('d', 3000);
}

const ICONS = {
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="11" height="12" rx="2"/><path d="M16.5 12h5M19 9.5L21.5 12 19 14.5"/></svg>',
  reuse: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0113.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.6L4 16M4 20v-4h4"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
};

function renderLibrary() {
  const f = state.libFilter;
  const list = state.jobs.filter((j) => f === 'all' || (f === 'active' ? !TERMINAL.has(j.status) : f === 'failed' ? ['failed', 'nsfw', 'canceled'].includes(j.status) : j.status === f));
  $('#libEmpty').hidden = state.jobs.length > 0;
  $('#library').innerHTML = list.map(clipHTML).join('') || (state.jobs.length ? '<p class="hint">Nothing here.</p>' : '');
  renderSpend();
}

function clipHTML(j) {
  const meta = j.meta || {};
  const fam = familyOf(j.slug);
  const active = !TERMINAL.has(j.status);
  const statusText = { queued: 'Queued', in_progress: 'Rendering', completed: 'Ready', failed: 'Failed', nsfw: 'Blocked', canceled: 'Canceled' }[j.status] || j.status;
  let media;
  if (j.status === 'completed' && j.video_url) media = `<video src="${esc(j.video_url)}" muted loop playsinline preload="metadata" data-hover></video>`;
  else if (active) media = `<div class="rendering"><b data-elapsed="${esc(j.created_at)}">${elapsed(j.created_at)}</b>${j.status === 'queued' ? 'Waiting in queue…' : 'Rendering…'}</div>`;
  else media = `<div class="failed-box">${esc(j.error || statusText)}</div>`;
  const tags = [meta.seconds && `${meta.seconds}s`, meta.resolution, meta.aspect, meta.audio === true && 'audio', { t2v: 'text', i2v: 'image', native: 'extend', frame: 'last-frame' }[meta.mode]].filter(Boolean);
  const name = `${(fam?.name || 'clip').replace(/\s+/g, '-').toLowerCase()}-${j.request_id.slice(0, 8)}.mp4`;
  return `<article class="clip" data-id="${j.request_id}">
    <div class="clip-media" data-open="${j.request_id}">${media}<span class="state ${j.status}"><i></i>${statusText}</span></div>
    <div class="clip-body">
      <div class="clip-title"><span>${esc(fam?.name || j.slug)} <span style="color:var(--faint);font-weight:500">· ${esc(meta.variant || '')}</span></span><span class="c" title="${meta.exact ? 'Exact' : 'Estimated'} cost">${meta.cost != null ? (meta.exact ? '' : '~') + fmtUSD(meta.cost) : ''}</span></div>
      <div class="clip-prompt">${esc(meta.prompt || '(no prompt)')}</div>
      <div class="clip-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="clip-actions">
      ${j.status === 'completed' && j.video_url ? `<a href="/api/media?url=${encodeURIComponent(j.video_url)}&download=${encodeURIComponent(name)}" download="${esc(name)}">${ICONS.dl}Save</a>
      <button type="button" data-extend="${j.request_id}">${ICONS.ext}Extend</button>` : ''}
      ${j.status === 'queued' ? `<button type="button" data-cancel="${j.request_id}">${ICONS.stop}Cancel</button>` : ''}
      <button type="button" data-reuse="${j.request_id}">${ICONS.reuse}Reuse</button>
      ${active ? '' : `<button type="button" data-delete="${j.request_id}" title="Remove from this list">${ICONS.del}</button>`}
    </div>
  </article>`;
}

function renderSpend() {
  const billable = state.jobs.filter((j) => !['failed', 'nsfw', 'canceled'].includes(j.status));
  const today = new Date().toDateString();
  const t = billable.filter((j) => new Date(j.created_at).toDateString() === today).reduce((a, j) => a + (j.meta?.cost || 0), 0);
  const total = billable.reduce((a, j) => a + (j.meta?.cost || 0), 0);
  const bal = remainingBalance();
  const btn = $('#balanceBtn');
  btn.classList.remove('low', 'empty', 'unset');
  if (bal) {
    $('#balLabel').textContent = 'Balance';
    $('#balValue').textContent = `≈${fmtUSD(Math.max(0, bal.left))}`;
    if (bal.left <= 0.5) btn.classList.add('empty');
    else if (bal.left < 5) btn.classList.add('low');
  } else {
    $('#balLabel').textContent = 'Balance';
    $('#balValue').textContent = 'Set';
    btn.classList.add('unset');
  }
  $('#spendToday').textContent = `· spent today ${fmtUSD(t)}`;
  btn.title = `Spent in this studio: ${fmtUSD(total)} total, ${fmtUSD(t)} today`;
  const stats = [];
  if (bal) stats.push(['Balance you entered', fmtUSD(bal.amount)], [`Spent since ${bal.since.toLocaleDateString()}`, `− ${fmtUSD(bal.spent)}`], ['Remaining (approx.)', fmtUSD(bal.left)]);
  stats.push(['Spent today', fmtUSD(t)], ['Spent all time (this studio)', fmtUSD(total)]);
  $('#balStats').innerHTML = stats.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
}

function elapsed(since) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = elapsed(el.dataset.elapsed); }), 1000);

function reuse(id) {
  const j = state.jobs.find((x) => x.request_id === id);
  const m = j && bySlug.get(j.slug);
  if (!m) return;
  const mk = j.meta?.mode || [...modesOf(m)][0];
  state.mode = mk === 'native' || mk === 'frame' ? 'extend' : mk;
  if (state.mode === 'extend') state.extendMethod = mk;
  state.slug[mk] = m.slug;
  const vals = {};
  for (const n of settingNames(m)) if (j.input?.[n] !== undefined) vals[n] = j.input[n];
  state.values[m.slug] = vals;
  state.prompt = j.input?.prompt || '';
  $('#prompt').value = state.prompt;
  const sf = startField(m);
  if (mk === 'i2v') {
    const url = j.input?.[sf];
    state.media.start = url ? { kind: 'image', url, preview: url } : null;
    const ef = endField(m);
    state.media.end = ef && j.input?.[ef] ? { kind: 'image', url: j.input[ef], preview: j.input[ef] } : null;
    const rf = refsField(m);
    state.media.refs = rf && j.input?.[rf] ? j.input[rf].map((u) => ({ kind: 'image', url: u, preview: u })) : [];
  }
  persist();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Loaded the settings from that clip', 'ok');
}

function openPlayer(id) {
  const j = state.jobs.find((x) => x.request_id === id);
  if (!j?.video_url) return;
  $('#playerTitle').textContent = `${j.meta?.family || 'Clip'} · ${j.meta?.variant || ''}`;
  $('#playerVideo').src = j.video_url;
  $('#playerPrompt').textContent = j.meta?.prompt || '';
  const meta = [j.meta?.seconds && `${j.meta.seconds}s`, j.meta?.resolution, j.meta?.aspect, j.meta?.cost != null && `${j.meta.exact ? '' : '~'}${fmtUSD(j.meta.cost)}`, new Date(j.created_at).toLocaleString(), j.slug];
  $('#playerMeta').innerHTML = meta.filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  $('#player').showModal();
  $('#playerVideo').play().catch(() => {});
}

// ---------------------------------------------------------------------------
// Misc UI
// ---------------------------------------------------------------------------
function setSeg(el, v) {
  el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d) {
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 4000);
}
function persist() {
  store.set('mode', state.mode);
  store.set('slug', state.slug);
  store.set('values', state.values);
  store.set('extendMethod', state.extendMethod);
}

function renderAll() {
  renderModes();
  renderModel();
  renderMedia();
  renderSettings();
  const m = currentModel();
  const needPrompt = required(m).includes('prompt') || modeKey() === 't2v' || modeKey() === 'native';
  $('#promptReq').textContent = needPrompt ? '' : '(optional)';
  $('#examplePrompt').hidden = !m.initial?.prompt;
  $('#prompt').placeholder = {
    t2v: 'Describe the shot: subject, action, camera move, lighting, mood…',
    i2v: 'Describe the motion: what moves, how the camera travels, what happens next…',
    native: 'What happens next? e.g. "The camera keeps pushing in as she turns and smiles"',
    frame: 'What happens next, starting from the last frame…',
  }[modeKey()];
  renderCost();
  if (browserDialog.open) renderBrowser();
}

function renderPromo() {
  const expiries = catalog.map((m) => discountFor(m)).filter((d) => d.pct && d.active && d.expires).map((d) => d.expires);
  const label = $('#promoLabel');
  const toggle = $('#promoToggle');
  if (!expiries.length) {
    toggle.closest('.promo-toggle').hidden = true;
    state.usePromo = false;
    return;
  }
  const soonest = new Date(Math.min(...expiries));
  label.textContent = `Launch pricing · until ${fmtDate(soonest)}`;
  toggle.checked = state.usePromo;
}

async function loadConfig() {
  try {
    const c = await api('/api/config');
    state.hasKey = c.hasKey;
    $('#keyDot').classList.toggle('ok', c.hasKey);
    $('#keyLabel').textContent = c.hasKey ? `Key ${c.keyHint}` : 'Add API key';
  } catch {
    state.hasKey = false;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
const browserDialog = $('#browser');

function bind() {
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    persist();
    renderAll();
    if (state.mode === 'extend' && state.extendMethod === 'frame') prepareFrame();
  }));
  $('#extendMethod').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    state.extendMethod = b.dataset.v;
    persist();
    renderAll();
    if (state.extendMethod === 'frame') prepareFrame();
  });

  $('#modelCurrent').addEventListener('click', () => openBrowser());
  $('#browseBtn').addEventListener('click', () => openBrowser());
  $('#variants').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slug]');
    if (b) selectModel(b.dataset.slug);
  });
  $('#compare').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const to = bySlug.get(b.dataset.pick);
    const from = currentModel();
    if (to !== from) state.values[to.slug] = mapSettings(from, values(from), to);
    selectModel(to.slug);
  });

  // browser
  $('#browserSearch').addEventListener('input', (e) => { browser.q = e.target.value; renderBrowser(); });
  $('#browserSort').addEventListener('change', (e) => { browser.sort = e.target.value; renderBrowser(); });
  $('#browserFilters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    browser.filters.has(b.dataset.filter) ? browser.filters.delete(b.dataset.filter) : browser.filters.add(b.dataset.filter);
    renderBrowser();
  });
  $('#familyGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-family]');
    if (!b) return;
    e.preventDefault();
    pickFamily(b.dataset.family);
    browserDialog.close();
  });

  // prompt
  $('#prompt').value = state.prompt;
  $('#promptCount').textContent = state.prompt.length;
  $('#prompt').addEventListener('input', (e) => {
    state.prompt = e.target.value;
    $('#promptCount').textContent = state.prompt.length;
    store.set('prompt', state.prompt);
    renderCost();
  });
  $('#examplePrompt').addEventListener('click', () => {
    state.prompt = currentModel().initial?.prompt || '';
    $('#prompt').value = state.prompt;
    $('#promptCount').textContent = state.prompt.length;
    store.set('prompt', state.prompt);
    renderCost();
  });
  $('#resetSettings').addEventListener('click', () => {
    delete state.values[currentModel().slug];
    persist();
    renderAll();
  });

  // settings (delegated)
  const onSetting = (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const m = currentModel();
    const n = el.dataset.set;
    let v;
    if (el.classList.contains('pill')) v = JSON.parse(el.dataset.val);
    else if (el.dataset.kind === 'bool') v = el.checked;
    else if (el.dataset.kind === 'enum') v = JSON.parse(el.value);
    else if (el.dataset.kind === 'int') v = el.value === '' ? undefined : parseInt(el.value, 10);
    else if (el.dataset.kind === 'num') v = parseFloat(el.value);
    else v = el.value;
    setValue(m, n, v);
    if (el.classList.contains('pill')) el.parentElement.querySelectorAll('.pill').forEach((p) => p.setAttribute('aria-checked', String(p === el)));
    const out = $(`#o-${n}`);
    if (out) out.textContent = `${v}${n === 'duration' ? 's' : ''}`;
    if (el.dataset.kind === 'bool') {
      const d = el.closest('.setting').querySelector('.delta');
      if (d) d.dataset.for = String(!v);
    }
    renderCost();
  };
  for (const id of ['#settings', '#advanced']) {
    $(id).addEventListener('click', (e) => {
      if (e.target.closest('.pill')) onSetting(e);
      if (e.target.closest('[data-dice]')) {
        const inp = $('#f-seed');
        inp.value = Math.floor(Math.random() * 2 ** 31);
        onSetting({ target: inp });
      }
    });
    $(id).addEventListener('input', (e) => { if (!e.target.closest('.pill')) onSetting(e); });
  }

  // media (delegated for both i2v and extend)
  for (const box of [$('#mediaInputs'), $('#extendSource')]) {
    box.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-file]');
      if (!inp) return;
      const slot = inp.dataset.file;
      slot === 'video' ? handleVideoFile(inp.files[0]) : handleImage(slot, inp.files[0]);
    });
    box.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) { e.preventDefault(); removeSlot(rm.dataset.remove); }
      const src = e.target.closest('[data-source]');
      if (src) selectJobAsSource(src.dataset.source);
    });
    box.addEventListener('keydown', (e) => {
      const d = e.target.closest('label.drop');
      if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); d.querySelector('input')?.click(); }
    });
    box.addEventListener('dragover', (e) => { const d = e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    box.addEventListener('dragleave', (e) => e.target.closest('.drop')?.classList.remove('over'));
    box.addEventListener('drop', (e) => {
      const d = e.target.closest('.drop');
      if (!d) return;
      e.preventDefault();
      d.classList.remove('over');
      const file = e.dataTransfer.files[0];
      const slot = d.dataset.slot;
      slot === 'video' ? handleVideoFile(file) : handleImage(slot.startsWith('ref') ? 'ref:new' : slot, file);
    });
  }
  // paste an image anywhere → first empty image slot
  document.addEventListener('paste', (e) => {
    if (modeKey() !== 'i2v') return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    const m = currentModel();
    const slot = startField(m) ? (!state.media.start ? 'start' : endField(m) && !state.media.end ? 'end' : 'start') : 'ref:new';
    handleImage(slot, file);
  });

  // cost & generate
  $('#promoToggle').addEventListener('change', (e) => {
    state.usePromo = e.target.checked;
    store.set('usePromo', state.usePromo);
    renderModel();
    renderCost();
  });
  $('#batchMinus').addEventListener('click', () => setBatch(state.batch - 1));
  $('#batchPlus').addEventListener('click', () => setBatch(state.batch + 1));
  $('#generateBtn').addEventListener('click', generate);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
  });

  // library
  $('#libFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    state.libFilter = b.dataset.v;
    setSeg($('#libFilter'), state.libFilter);
    renderLibrary();
  });
  $('#library').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-extend],[data-reuse],[data-delete],[data-cancel],[data-open]');
    if (!t) return;
    if (t.dataset.extend) {
      state.mode = 'extend';
      persist();
      renderAll();
      selectJobAsSource(t.dataset.extend);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (t.dataset.reuse) reuse(t.dataset.reuse);
    else if (t.dataset.open) openPlayer(t.dataset.open);
    else if (t.dataset.cancel) {
      try { Object.assign(state.jobs.find((j) => j.request_id === t.dataset.cancel), await api(`/api/jobs/${t.dataset.cancel}/cancel`, { method: 'POST' })); } catch (err) { toast(err.message, 'error'); }
      renderLibrary();
    } else if (t.dataset.delete) {
      await api(`/api/jobs/${t.dataset.delete}`, { method: 'DELETE' }).catch(() => {});
      state.jobs = state.jobs.filter((j) => j.request_id !== t.dataset.delete);
      renderLibrary();
    }
  });
  $('#library').addEventListener('mouseover', (e) => e.target.closest('video[data-hover]')?.play().catch(() => {}));
  $('#library').addEventListener('mouseout', (e) => {
    const v = e.target.closest('video[data-hover]');
    if (v) { v.pause(); }
  });
  $('#library').addEventListener('loadedmetadata', (e) => {
    const v = e.target;
    const j = state.jobs.find((x) => x.video_url && v.src === x.video_url);
    if (j && j.meta && !j.meta.seconds_actual) j.meta.seconds_actual = v.duration;
  }, true);

  // modals
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#player').addEventListener('close', () => $('#playerVideo').pause());
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  $('#balanceBtn').addEventListener('click', () => {
    const bal = remainingBalance();
    $('#balanceInput').value = bal ? Math.max(0, bal.left).toFixed(2) : '';
    $('#balanceError').textContent = '';
    renderSpend();
    $('#balanceModal').showModal();
    $('#balanceInput').select();
  });
  $('#balanceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.balance = await api('/api/balance', { method: 'POST', body: JSON.stringify({ amount: $('#balanceInput').value }) });
      $('#balanceModal').close();
      renderSpend();
      renderCost();
      toast(`Balance set to ${fmtUSD(state.balance.amount)}`, 'ok');
    } catch (err) {
      $('#balanceError').textContent = err.message;
    }
  });
  $('#balanceClear').addEventListener('click', async () => {
    state.balance = await api('/api/balance', { method: 'POST', body: JSON.stringify({ amount: null }) });
    $('#balanceModal').close();
    renderSpend();
    renderCost();
  });
  $('#keyBtn').addEventListener('click', () => { $('#keyError').textContent = ''; $('#keyModal').showModal(); $('#keyId').focus(); });
  $('#keyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/config', { method: 'POST', body: JSON.stringify({ id: $('#keyId').value, secret: $('#keySecret').value }) });
      $('#keySecret').value = '';
      $('#keyModal').close();
      await loadConfig();
      renderCost();
      toast('API key saved', 'ok');
    } catch (err) {
      $('#keyError').textContent = err.message;
    }
  });
}

function setBatch(n) {
  state.batch = Math.max(1, Math.min(4, n));
  $('#batchCount').textContent = state.batch;
  store.set('batch', state.batch);
  renderCost();
}

function openBrowser() {
  if (modeKey() === 'native') return;
  renderBrowser();
  browserDialog.showModal();
  $('#browserSearch').focus();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  const [cat, jobs, rates, balance] = await Promise.all([
    fetch('catalog.json').then((r) => r.json()),
    api('/api/jobs').catch(() => []),
    fetch('rates.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    api('/api/balance').catch(() => null),
  ]);
  setRates(rates);
  state.balance = balance;
  catalog = cat.models;
  catalog.forEach((m) => bySlug.set(m.slug, m));
  state.jobs = jobs;
  await loadConfig();
  renderPromo();
  $('#batchCount').textContent = state.batch;
  bind();
  renderAll();
  renderLibrary();
  schedulePoll(500);
  if (!state.hasKey) setTimeout(() => $('#keyModal').showModal(), 400);
}

boot().catch((e) => {
  console.error(e);
  toast(`Failed to start: ${e.message}`, 'error');
});
