import { ajax } from "discourse/lib/ajax";

// Shared utilities for the Curiobase component.
//
// `settings` is injected into every theme module by Discourse's build (Babel plugin
// AddThemeGlobals -> `import { settings } from "virtual:theme"`), so it is available
// here exactly as it is in the initializer. Do NOT declare a top-level binding named
// `settings` or `themePrefix` in any theme module -- it is a hard compile error.

const cache = new Map();

function decode(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s || "";
  return t.value;
}

function tagName(x) {
  return typeof x === "string" ? x : (x && x.name) || "";
}

function pollScale(poll) {
  const vals = (poll?.options || []).map((o) => parseInt(o.html, 10)).filter((n) => !isNaN(n));
  return vals.length ? Math.max(...vals) : (settings.scale_max || 5);
}

function pollMean(poll) {
  if (!poll || !poll.voters) return null;
  let sum = 0, n = 0;
  (poll.options || []).forEach((o) => {
    const v = parseInt(o.html, 10);
    if (!isNaN(v)) { sum += v * o.votes; n += o.votes; }
  });
  return n ? { mean: sum / n, voters: n } : null;
}

function siteCats(api) { return api.container.lookup("service:site").categories || []; }
function catById(api, id) { return siteCats(api).find((c) => c.id === id); }

function ancestryHas(api, cat, rootId) {
  const byId = new Map(siteCats(api).map((c) => [c.id, c]));
  let cur = cat;
  while (cur) {
    if (cur.id === rootId) return true;
    cur = cur.parent_category_id ? byId.get(cur.parent_category_id) : null;
  }
  return false;
}

function currentCategory(api) {
  const disc = api.container.lookup("service:discovery");
  if (disc?.category) return disc.category;
  const tc = api.container.lookup("controller:topic");
  const cid = tc?.model?.category_id;
  return cid ? catById(api, cid) : null;
}

function miniGrid(x, y, _cx, _cy, _tier, size = 36, scaleOverride) {
  const S = scaleOverride || settings.scale_max || 5;
  const pad = 5;
  const gx = (v) => pad + ((v - 1) / (S - 1)) * (size - 2 * pad);
  const gy = (v) => size - pad - ((v - 1) / (S - 1)) * (size - 2 * pad);
  const teal = "#2aa79b";
  if (x == null || y == null || isNaN(x) || isNaN(y)) {
    return `<svg class="gravity-glyph gg-empty" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="4" fill="none" stroke="${teal}" stroke-opacity="0.28" stroke-dasharray="3 3"/>
      <line x1="${size / 2}" y1="${size * 0.36}" x2="${size / 2}" y2="${size * 0.64}" stroke="${teal}" stroke-opacity="0.4"/>
      <line x1="${size * 0.36}" y1="${size / 2}" x2="${size * 0.64}" y2="${size / 2}" stroke="${teal}" stroke-opacity="0.4"/>
    </svg>`;
  }
  const px = gx(x), py = gy(y);
  return `<svg class="gravity-glyph" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="4" fill="rgba(42,167,155,0.06)" stroke="${teal}" stroke-opacity="0.4"/>
    <line x1="${px}" y1="1.5" x2="${px}" y2="${size - 1.5}" stroke="${teal}" stroke-opacity="0.22"/>
    <line x1="1.5" y1="${py}" x2="${size - 1.5}" y2="${py}" stroke="${teal}" stroke-opacity="0.22"/>
    <circle cx="${px}" cy="${py}" r="${size > 38 ? 6 : 4.5}" fill="${teal}" fill-opacity="0.18"/>
    <circle cx="${px}" cy="${py}" r="${size > 38 ? 3.4 : 2.6}" fill="${teal}"/>
  </svg>`;
}

function tierColor(tier) {
  const map = {};
  (settings.tier_colors || "").split("|").forEach((p) => {
    const [k, v] = p.split(":");
    if (k && v) map[k.trim().toLowerCase()] = v.trim();
  });
  return map[(tier || "").toLowerCase()] || "#5a7a76";
}

function prettify(slug) {
  return (slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchJson(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await ajax(url);
  cache.set(url, r);
  return r;
}


export {
  cache,
  decode,
  tagName,
  pollScale,
  pollMean,
  siteCats,
  catById,
  ancestryHas,
  currentCategory,
  miniGrid,
  tierColor,
  prettify,
  fetchJson,
};
