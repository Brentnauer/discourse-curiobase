import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";

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

// ── gather works for a concept: tag feed in the Vault, gravity block per work ──
async function conceptWorks(conceptSlug) {
  const key = `works:${conceptSlug}`;
  if (cache.has(key)) return cache.get(key);
  let works = [];
  try {
    const feed = await fetchJson(`/tags/c/the-vault/${settings.vault_id}/${conceptSlug}.json`);
    const topics = (feed.topic_list?.topics || []).slice(0, 24);
    const pollSuffix = conceptSlug.replace(/-/g, "_");
    const results = await Promise.all(topics.map(async (t) => {
      try {
        const tj = await fetchJson(`/t/${t.id}.json`);
        const posts = tj.post_stream.posts || [];
        const first = document.createElement("div");
        first.innerHTML = posts[0]?.cooked || "";
        const card = first.querySelector('.d-wrap[data-wrap="curio-card"]');
        let grav = null, gpost = null;
        for (const p of posts) {
          const h = document.createElement("div");
          h.innerHTML = p.cooked;
          const g = [...h.querySelectorAll('.d-wrap[data-wrap="curio-gravity"]')]
            .find((x) => x.dataset.concept === conceptSlug);
          if (g) { grav = g; gpost = p; break; }
        }
        if (!grav || !gpost) return null;
        const px = pollMean((gpost.polls || []).find((x) => x.name === `axis_x_${pollSuffix}`));
        const py = pollMean((gpost.polls || []).find((x) => x.name === `axis_y_${pollSuffix}`));
        const excerpt = (grav.textContent || "").trim().replace(/\s+/g, " ");
        const bodyHtml = grav.innerHTML;
        return {
          topic_id: t.id,
          slug: t.slug,
          post_number: gpost.post_number,
          body: bodyHtml,
          title: card ? decode(card.dataset.title || t.title) : t.title,
          year: card ? decode(card.dataset.year || "") : "",
          poster: card?.querySelector("img")?.getAttribute("src") || null,
          ex: NaN, ey: NaN,
          tier: decode(grav.dataset.tier || ""),
          excerpt: excerpt.length > 150 ? excerpt.slice(0, 147) + "…" : excerpt,
          scale: pollScale(px ? (gpost.polls || []).find((x) => x.name === `axis_x_${pollSuffix}`) : null),
          cx: px && py && Math.min(px.voters, py.voters) >= settings.min_voters ? px.mean : null,
          cy: px && py && Math.min(px.voters, py.voters) >= settings.min_voters ? py.mean : null,
          voters: Math.min(px?.voters || 0, py?.voters || 0),
          medium: card ? decode(card.dataset.medium || "") : "",
          mode: card ? (decode(card.dataset.mode || "") || "fiction") : "fiction",
        };
      } catch { return null; }
    }));
    works = results.filter(Boolean).sort((a, b) => {
      const ax = a.cx == null ? -1 : a.cx, bx = b.cx == null ? -1 : b.cx;
      return bx - ax;
    });
  } catch {}
  cache.set(key, works);
  return works;
}


// ── v4: Position Row engine ───────────────────────────────────────────
function edgeFromPost(p) {
  const h = document.createElement("div");
  h.innerHTML = p.cooked || "";
  const g = h.querySelector('.d-wrap[data-wrap="curio-gravity"]');
  if (!g) return null;
  const slug = decode(g.dataset.concept || "");
  if (!slug) return null;
  const sfx = slug.replace(/-/g, "_");
  const px = pollMean((p.polls || []).find((x) => x.name === `axis_x_${sfx}`));
  const py = pollMean((p.polls || []).find((x) => x.name === `axis_y_${sfx}`));
  const mine = (name) => {
    const poll = (p.polls || []).find((x) => x.name === name);
    const dig = ((p.polls_votes || {})[name] || [])[0];
    if (!poll || !dig) return null;
    const o = poll.options.find((x) => x.id === dig);
    return o ? o.html : null;
  };
  return {
    slug, sfx, post_number: p.post_number, post_id: p.id,

    commentary: g.innerHTML,
    cx: px && py ? px.mean : null, cy: px && py ? py.mean : null,
    scale: pollScale((p.polls || []).find((x) => x.name === `axis_x_${sfx}`)),
    voters: Math.min(px?.voters || 0, py?.voters || 0),
    myX: mine(`axis_x_${sfx}`), myY: mine(`axis_y_${sfx}`),
  };
}

function scoreLine(e) {
  const has = e.cx != null && e.cy != null;
  const main = has
    ? `<span class="pr-ed"><b>${settings.label_axis_x_short}</b> ${e.cx.toFixed(1)} · <b>${settings.label_axis_y_short}</b> ${e.cy.toFixed(1)}</span>`
    : `<span class="pr-none">${settings.label_awaiting}</span>`;
  const n = has ? `<span class="pr-com">${e.voters} ${e.voters === 1 ? settings.label_voter : settings.label_voters}</span>` : "";
  const you = e.myX || e.myY ? `<span class="pr-you">${settings.label_yourscore} ${e.myX || "–"} · ${e.myY || "–"}</span>` : "";
  return `${main}${n}${you}`;
}

function buildRow(e, ctx) {
  const row = document.createElement("div");
  row.className = "position-row";
  row.dataset.concept = e.slug;
  row.dataset.edgePost = e.post_number;
  const title = ctx.title || prettify(e.slug);
  const href = ctx.href || "#";
  row.innerHTML = `
    <a class="pr-visual" href="${href}">${ctx.visual || miniGrid(e.cx, e.cy, null, null, "", 44, e.scale)}</a>
    <div class="pr-main">
      <a class="pr-title" href="${href}">${title}${ctx.sub ? ` <i>${ctx.sub}</i>` : ""}</a>

    </div>
    <div class="pr-scores">${scoreLine(e)}</div>
    <div class="pr-actions"></div>
    <div class="pr-expand"></div>`;
  return row;
}

function buildGrid(works) {
  const W = 760, H = 430, P = 74;
  const S = works.find((w) => w.scale)?.scale || settings.scale_max || 5;
  const sx = (v) => P + ((v - 1) / (S - 1)) * (W - 2 * P);
  const sy = (v) => H - P - ((v - 1) / (S - 1)) * (H - 2 * P);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "curio-grid");
  const mk = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text) el.textContent = text;
    return el;
  };
  const defs = mk("defs", {});
  svg.append(defs);
  // quadrant glow toward obsession/unresolved
  const grad = mk("radialGradient", { id: "cg-glow", cx: "85%", cy: "15%", r: "80%" });
  grad.append(mk("stop", { offset: "0%", "stop-color": "#2aa79b", "stop-opacity": "0.14" }));
  grad.append(mk("stop", { offset: "60%", "stop-color": "#2aa79b", "stop-opacity": "0" }));
  defs.append(grad);
  svg.append(mk("rect", { x: P, y: P, width: W - 2 * P, height: H - 2 * P, class: "cg-field", fill: "url(#cg-glow)" }));
  for (let i = 2; i < S; i++) {
    svg.append(mk("line", { x1: sx(i), y1: P, x2: sx(i), y2: H - P, class: "cg-gridline" }));
    svg.append(mk("line", { x1: P, y1: sy(i), x2: W - P, y2: sy(i), class: "cg-gridline" }));
  }
  // axis endpoint labels
  svg.append(mk("text", { x: P, y: H - 18, class: "cg-axis cg-a-start" }, settings.label_x_left));
  svg.append(mk("text", { x: W - P, y: H - 18, class: "cg-axis cg-a-end" }, settings.label_x_right));
  const yb = mk("text", { x: 20, y: H - P, class: "cg-axis cg-a-start", transform: `rotate(-90 20 ${H - P})` }, settings.label_y_bottom);
  const yt = mk("text", { x: 20, y: P, class: "cg-axis cg-a-endv", transform: `rotate(-90 20 ${P})` }, settings.label_y_top);
  svg.append(yb, yt);
  const PW = 40, PH = 58;
  const scored = works.filter((w) => w.cx != null && w.cy != null);
  const unscored = works.length - scored.length;
  scored.forEach((w, i) => {
    const x = sx(w.cx), y = sy(w.cy);
    const g = mk("g", { class: "cg-work" + (w.mode === "nonfiction" ? " cg-nonfic" : ""), style: "cursor:pointer" });
    if (w.poster) {
      const clipId = `cgclip${i}`;
      const cp = mk("clipPath", { id: clipId });
      cp.append(mk("rect", { x: x - PW / 2, y: y - PH / 2, width: PW, height: PH, rx: 4 }));
      defs.append(cp);
      const img = mk("image", { x: x - PW / 2, y: y - PH / 2, width: PW, height: PH, "clip-path": `url(#${clipId})`, preserveAspectRatio: "xMidYMid slice" });
      img.setAttributeNS("http://www.w3.org/1999/xlink", "href", w.poster);
      img.setAttribute("href", w.poster);
      g.append(img);
      g.append(mk("rect", { x: x - PW / 2, y: y - PH / 2, width: PW, height: PH, rx: 4, class: "cg-poster-frame" }));
    } else {
      g.append(mk("circle", { cx: x, cy: y, r: 11, class: "cg-dot" }));
      g.append(mk("text", { x, y: y + 4, class: "cg-pt-label" }, String(i + 1)));
    }
    const badge = mk("circle", { cx: x - PW / 2, cy: y - PH / 2, r: 9, class: "cg-badge" });
    const bnum = mk("text", { x: x - PW / 2, y: y - PH / 2 + 3.5, class: "cg-pt-label" }, String(i + 1));
    if (w.poster) g.append(badge, bnum);
    g.append(mk("title", {}, `${w.title}${w.year ? " (" + w.year + ")" : ""} — ${w.cx.toFixed(1)} · ${w.cy.toFixed(1)} (${w.voters})`));
    g.addEventListener("click", () => { window.location.href = `/t/${w.slug}/${w.topic_id}${w.post_number > 1 ? "/" + w.post_number : ""}`; });
    svg.append(g);
  });
  if (unscored) {
    svg.append(mk("text", { x: W - P, y: P - 14, class: "cg-axis cg-a-end" }, `${unscored} not yet scored`));
  }
  const holder = document.createElement("div");
  holder.className = "curio-grid-holder";
  const cap = document.createElement("div");
  cap.className = "curio-grid-hint";
  cap.textContent = settings.label_grid_hint;
  holder.append(svg, cap);
  return holder;
}

function buildGallery(works) {
  const gal = document.createElement("div");
  gal.className = "curio-gallery";
  works.forEach((w, i) => {
    const relUrl = `/t/${w.slug}/${w.topic_id}${w.post_number > 1 ? "/" + w.post_number : ""}`;
    const card = document.createElement("div");
    card.className = "cgal-card";
    const scored = w.cx != null && w.cy != null;
    const scores = scored
      ? `${settings.label_axis_x_short} ${w.cx.toFixed(1)} · ${settings.label_axis_y_short} ${w.cy.toFixed(1)} <i>${w.voters} ${w.voters === 1 ? settings.label_voter : settings.label_voters}</i>`
      : settings.label_awaiting;
    card.innerHTML = `
      <span class="cgal-num">${i + 1}</span>
      <a class="cgal-main" href="${relUrl}">
        ${w.poster ? `<img src="${w.poster}" loading="lazy">` : `<span class="cgal-noposter"></span>`}
        <span class="cgal-body">
          <span class="cgal-title">${w.title}${w.year ? ` <i>(${w.year})</i>` : ""}</span>
          <span class="cgal-chips">${w.medium ? `<span class="cgal-med">${w.medium.toUpperCase()}</span>` : ""}</span>
          <span class="cgal-gravity">${miniGrid(w.cx, w.cy, null, null, "", 30, w.scale)}<span class="cgal-gravnums"><i>${scores}</i></span></span>
        </span>
      </a>
      <a class="cgal-vote" href="${relUrl}">${settings.label_vote_cta}</a>`;
    gal.append(card);
  });
  return gal;
}

export default apiInitializer("1.0", (api) => {
  api.onPageChange(() => {
    const b = document.body;
    ["curio-wing", "vault-wing", "vault-entry", "curio-entry"].forEach((c) => b.classList.remove(c));
    document.getElementById("curio-wingnav")?.remove();
    const cat = currentCategory(api);
    if (!cat) return;
    const inCurio = ancestryHas(api, cat, settings.curiobase_id);
    const inVault = ancestryHas(api, cat, settings.vault_id);
    if (inCurio) b.classList.add("curio-wing");
    if (inVault) b.classList.add("vault-wing");
    if (!inCurio && !inVault) return;
    const route = api.container.lookup("service:router")?.currentRouteName || "";
    const onTopic = route.startsWith("topic");
    if (onTopic && inVault && cat.id !== settings.screening_id) b.classList.add("vault-entry");
    if (onTopic && inCurio && cat.parent_category_id === settings.curiobase_id && cat.id !== settings.nominations_id) b.classList.add("curio-entry");
    // persistent wing nav
    const cb = catById(api, settings.curiobase_id), vt = catById(api, settings.vault_id), nm = catById(api, settings.nominations_id);
    if (!cb || !vt) return;
    const nav = document.createElement("div");
    nav.id = "curio-wingnav";
    const mk = (label, target, active) => {
      const a = document.createElement("a");
      a.className = "cwn-link" + (active ? " cwn-active" : "");
      a.href = `/c/${target.slug}/${target.id}`;
      a.textContent = label;
      return a;
    };
    nav.append(
      mk("Curiobase", cb, inCurio && cat.id !== settings.nominations_id),
      mk("The Vault", vt, inVault),
      mk("Nominate", nm || cb, cat.id === settings.nominations_id)
    );
    const int = setInterval(() => {
      const outlet = document.getElementById("main-outlet");
      if (outlet && !document.getElementById("curio-wingnav")) { outlet.prepend(nav); }
      if (outlet) clearInterval(int);
    }, 120);
    setTimeout(() => clearInterval(int), 2000);
  });

  // discussion divider: the entry above, the room below
  api.onPageChange(() => {
    const attempt = (n) => {
      document.getElementById("curio-discussion-divider")?.remove();
      const b = document.body;
      if (!b.classList.contains("vault-entry") && !b.classList.contains("curio-entry")) return true;
      const posts = [...document.querySelectorAll(".topic-post")];
      if (!posts.length) return n <= 0 ? true : false;
      const isEntry = (el) => el.querySelector('.d-wrap[data-wrap="curio-card"], .d-wrap[data-wrap="curio-gravity"], .d-wrap[data-wrap="curio-concept"]');
      const firstDiscussion = posts.find((p) => !isEntry(p));
      if (firstDiscussion) {
        const div = document.createElement("div");
        div.id = "curio-discussion-divider";
        div.textContent = settings.label_discussion;
        firstDiscussion.parentNode.insertBefore(div, firstDiscussion);
      }
      return true;
    };
    let tries = 10;
    const int = setInterval(() => { if (attempt(tries--)) clearInterval(int); }, 250);
    setTimeout(() => clearInterval(int), 3500);
  });

  // ── listing pages: purpose-built indexes replace native lists ──
  api.onPageChange(async () => {
    document.getElementById("curio-atlas")?.remove();
    document.getElementById("curio-domain-index")?.remove();
    document.getElementById("vault-index")?.remove();
    document.body.classList.remove("curio-index-active");
    const cat = currentCategory(api);
    if (!cat) return;
    // tag-filtered category routes are utility views — never mount custom indexes there
    const routeName = api.container.lookup("service:router")?.currentRouteName || "";
    if (routeName.includes("tag") || window.location.pathname.startsWith("/tags/")) return;
    const mount = (node) => {
      const int = setInterval(() => {
        const list = document.querySelector(".topic-list, #list-area, .category-list");
        if (list) {
          clearInterval(int);
          const area = document.getElementById("list-area") || list.parentNode;
          area.parentNode.insertBefore(node, area);
          document.body.classList.add("curio-index-active");
        }
      }, 150);
      setTimeout(() => clearInterval(int), 2500);
    };
    const conceptCard = (t) => {
      const a = document.createElement("a");
      a.className = "ca-card";
      a.href = `/t/${t.slug}/${t.id}`;
      a.innerHTML = `<span class="ca-title">${t.fancy_title}</span>
        <span class="ca-meta">${settings.label_counting}</span>`;
      const slug = (t.tags || []).map(tagName).find((x) => x && !/^y\d{4}$/.test(x));
      if (slug) {
        (async () => {
          try {
            const feed = await fetchJson(`/tags/c/the-vault/${settings.vault_id}/${slug}.json`);
            const n = (feed.topic_list?.topics || []).length;
            const meta = a.querySelector(".ca-meta");
            meta.textContent = n === 0 ? settings.label_noworks_short
              : `${n} ${n === 1 ? settings.label_work : settings.label_works}`;
            if (!n) meta.classList.add("ca-empty-meta");
          } catch {}
        })();
      }
      return a;
    };
    const videoCat = siteCats(api).find((c) => c.parent_category_id === settings.vault_id && c.slug === "video");
    const tile = (t) => {
      const a = document.createElement("a");
      a.className = "vt-tile" + (videoCat && t.category_id === videoCat.id ? " vt-wide" : "");
      a.href = `/t/${t.slug}/${t.id}`;
      const tags = (t.tags || []).map(tagName).filter((x) => x && !/^y\d{4}$/.test(x)).slice(0, 2)
        .map((x) => `<i>${x.replace(/-/g, " ")}</i>`).join("");
      a.innerHTML = `${t.image_url
          ? `<img src="${t.image_url}" loading="lazy">`
          : `<span class="vt-noposter"><b>${t.fancy_title.slice(0, 1)}</b></span>`}
        <span class="vt-title">${t.fancy_title}</span>
        <span class="vt-tags">${tags}</span>`;
      return a;
    };

    // Curiobase landing: the atlas IS the page
    if (cat.id === settings.curiobase_id) {
      const domains = siteCats(api).filter(
        (c) => c.parent_category_id === settings.curiobase_id && c.id !== settings.nominations_id
      );
      const box = document.createElement("div");
      box.id = "curio-atlas";
      for (const d of domains) {
        const h = document.createElement("div");
        h.className = "ca-domain";
        h.textContent = d.name;
        box.append(h);
        const grid = document.createElement("div");
        grid.className = "ca-grid";
        try {
          const r = await fetchJson(`/c/${d.id}.json`);
          (r.topic_list.topics || []).filter((t) => !t.pinned).forEach((t) => grid.append(conceptCard(t)));
        } catch {}
        if (!grid.children.length) {
          const e = document.createElement("div");
          e.className = "ca-empty";
          e.textContent = "No entries yet.";
          grid.append(e);
        }
        box.append(grid);
      }
      const nomCat = catById(api, settings.nominations_id);
      if (nomCat) {
        const cta = document.createElement("a");
        cta.className = "ca-cta";
        cta.href = `/c/${nomCat.slug}/${nomCat.id}`;
        cta.textContent = settings.label_nominate_cta;
        box.append(cta);
      }
      mount(box);
      return;
    }

    // Domain page: concept cards for this domain only
    if (cat.parent_category_id === settings.curiobase_id && cat.id !== settings.nominations_id) {
      const box = document.createElement("div");
      box.id = "curio-domain-index";
      const h = document.createElement("div");
      h.className = "ca-domain";
      h.textContent = cat.name;
      box.append(h);
      const grid = document.createElement("div");
      grid.className = "ca-grid";
      try {
        const r = await fetchJson(`/c/${cat.id}.json`);
        (r.topic_list.topics || []).filter((t) => !t.pinned).forEach((t) => grid.append(conceptCard(t)));
      } catch {}
      if (!grid.children.length) {
        const e = document.createElement("div");
        e.className = "ca-empty";
        e.textContent = "No entries yet.";
        grid.append(e);
      }
      box.append(grid);
      mount(box);
      return;
    }

    // Vault landing: medium chips + poster wall of latest acquisitions
    if (cat.id === settings.vault_id) {
      const mediums = siteCats(api).filter(
        (c) => c.parent_category_id === settings.vault_id && c.id !== settings.screening_id
      );
      const box = document.createElement("div");
      box.id = "vault-index";
      const chips = document.createElement("div");
      chips.className = "vt-chips";
      const counts = new Map();
      try {
        const rc = await fetchJson(`/c/${settings.vault_id}.json`);
        (rc.topic_list?.topics || []).forEach((t) => {
          if (t.pinned) return;
          counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
        });
      } catch {}
      mediums.forEach((m) => {
        const a = document.createElement("a");
        a.className = "vt-chip";
        a.href = `/c/${m.slug}/${m.id}`;
        const n = counts.has(m.id) ? counts.get(m.id) : (m.topic_count || 0);
        a.innerHTML = `${m.name} <b>${n}</b>`;
        chips.append(a);
      });
      const sr = catById(api, settings.screening_id);
      if (sr) {
        const a = document.createElement("a");
        a.className = "vt-chip vt-chip-dim";
        a.href = `/c/${sr.slug}/${sr.id}`;
        a.textContent = `${sr.name} →`;
        chips.append(a);
      }
      box.append(chips);
      const wall = document.createElement("div");
      wall.className = "vt-wall";
      const mediumIds = new Set(mediums.map((m) => m.id));
      try {
        const r = await fetchJson(`/c/${settings.vault_id}.json`);
        (r.topic_list.topics || [])
          .filter((t) => !t.pinned && mediumIds.has(t.category_id))
          .slice(0, 24)
          .forEach((t) => wall.append(tile(t)));
      } catch {}
      if (!wall.children.length) {
        const e = document.createElement("div");
        e.className = "ca-empty";
        e.textContent = "No acquisitions yet.";
        wall.append(e);
      }
      box.append(wall);
      mount(box);
      return;
    }

    // Medium page: chips + poster wall for this medium
    if (cat.parent_category_id === settings.vault_id && cat.id !== settings.screening_id) {
      const box = document.createElement("div");
      box.id = "vault-index";
      const mediums = siteCats(api).filter(
        (c) => c.parent_category_id === settings.vault_id && c.id !== settings.screening_id
      );
      const chips = document.createElement("div");
      chips.className = "vt-chips";
      const home = document.createElement("a");
      home.className = "vt-chip vt-chip-home";
      const vaultCat = catById(api, settings.vault_id);
      home.href = `/c/${vaultCat.slug}/${vaultCat.id}`;
      home.textContent = "◂ The Vault";
      chips.append(home);
      mediums.forEach((m) => {
        const a = document.createElement("a");
        a.className = "vt-chip" + (m.id === cat.id ? " vt-chip-active" : "");
        a.href = `/c/${m.slug}/${m.id}`;
        a.innerHTML = `${m.name} <b>${m.topic_count || 0}</b>`;
        chips.append(a);
      });
      box.append(chips);
      const wall = document.createElement("div");
      wall.className = "vt-wall";
      try {
        const r = await fetchJson(`/c/${cat.id}.json`);
        (r.topic_list.topics || []).filter((t) => !t.pinned).forEach((t) => wall.append(tile(t)));
      } catch {}
      if (!wall.children.length) {
        const e = document.createElement("div");
        e.className = "ca-empty";
        e.textContent = "No acquisitions yet.";
        wall.append(e);
      }
      box.append(wall);
      mount(box);
    }
  });


  // ── v4 dossier: assemble work pages, teleport ballots into rows ──
  const assembleDossier = () => {
    const run = (tries) => {
      // compute membership directly — never depend on handler ordering
      const catNow = currentCategory(api);
      const routeNow = api.container.lookup("service:router")?.currentRouteName || "";
      const isEntry = catNow && routeNow.startsWith("topic") &&
        ancestryHas(api, catNow, settings.vault_id) && catNow.id !== settings.screening_id;
      if (!isEntry) return tries <= 0;
      document.body.classList.add("vault-entry");
      const stream = document.querySelector(".post-stream");
      const ctrl = api.container.lookup("controller:topic");
      const model = ctrl?.model;
      const posts = model?.postStream?.posts || [];
      const heroWrap = document.querySelector('.d-wrap[data-wrap="curio-card"]');
      if (!stream || !posts.length || !heroWrap) return tries <= 0;
      const existingZone = document.getElementById("curio-positions");
      if (existingZone && existingZone.dataset.complete === "1") return true;

      const edges = posts.map((p) => edgeFromPost(p)).filter(Boolean);
      if (!edges.length) return true;

      const zone = existingZone || document.createElement("section");
      if (!existingZone) {
        zone.id = "curio-positions";
        const lab = document.createElement("div");
        lab.className = "curio-sectlabel";
        lab.textContent = settings.label_positions;
        zone.append(lab);
      }

      edges.forEach((e) => {
        if (zone.querySelector(`.position-row[data-edge-post="${e.post_number}"]`)) return;
        const row = buildRow(e, { title: prettify(e.slug), href: `/t/${e.slug}/${e.concept_id || ""}`.replace(/\/$/, "") || "#" });
        // resolve concept link lazily
        (async () => {
          try {
            const feed = await fetchJson(`/tags/c/curiobase/${settings.curiobase_id}/${e.slug}.json`);
            const ct = (feed.topic_list?.topics || []).find((t) => t.category_id !== settings.nominations_id);
            if (ct) row.querySelectorAll(".pr-title, .pr-visual").forEach((a) => (a.href = `/t/${ct.slug}/${ct.id}`));
          } catch {}
        })();
        // context: the concept's own definition (not a verdict about this work)
        const exp = row.querySelector(".pr-expand");
        (async () => {
          try {
            const feed = await fetchJson(`/tags/c/curiobase/${settings.curiobase_id}/${e.slug}.json`);
            const ct = (feed.topic_list?.topics || []).find((t) => t.category_id !== settings.nominations_id);
            if (!ct) return;
            const cj = await fetchJson(`/t/${ct.id}.json`);
            const h = document.createElement("div");
            h.innerHTML = cj.post_stream.posts[0].cooked;
            const cw = h.querySelector('.d-wrap[data-wrap="curio-concept"]');
            const dekAttr = cw ? decode(cw.dataset.dek || "") : "";
            const p1 = [...h.querySelectorAll("p")].find((p) => p.textContent.trim().length > 60);
            if (!dekAttr && !p1) return;
            let txt = dekAttr || p1.textContent.trim().replace(/\s+/g, " ");
            if (txt.length > 190) txt = txt.slice(0, 187) + "…";
            exp.innerHTML = `<div class="pr-dek">${txt}</div>`;
          } catch {}
        })();
        // actions
        const acts = row.querySelector(".pr-actions");
        const score = document.createElement("button");
        score.className = "pr-btn pr-scorebtn";
        score.type = "button";
        score.textContent = settings.label_scorebtn;
        acts.append(score);
        const ch = document.createElement("button");
        ch.className = "pr-btn";
        ch.type = "button";
        ch.textContent = settings.label_challenge_btn;
        ch.addEventListener("click", async () => {
          try {
            const composer = api.container.lookup("service:composer");
            const post = posts.find((p) => p.post_number === e.post_number);
            await composer.open({ action: "reply", draftKey: model.draft_key, draftSequence: model.draft_sequence, topic: model, post });
            composer.model.appendText(`[wrap=curio-challenge]\n\n[/wrap]`);
          } catch (err) { window.location.href = `/t/${model.slug}/${model.id}/${e.post_number}`; }
        });
        const permalink = document.createElement("a");
        permalink.className = "pr-btn pr-link";
        permalink.href = `/t/${model.slug}/${model.id}/${e.post_number}`;
        permalink.textContent = settings.label_permalink;
        acts.append(ch, permalink);
        zone.append(row);
      });

      if (!existingZone) heroWrap.closest(".topic-post").after(zone);
      let pending = 0;
      edges.forEach((e2) => {
        const raw = [...document.querySelectorAll(".topic-post")].find(
          (n) => n.querySelector(`.d-wrap[data-wrap="curio-gravity"][data-concept="${e2.slug}"]`)
        );
        if (!raw) { pending++; return; }
        const row = zone.querySelector(`.position-row[data-edge-post="${e2.post_number}"]`);
        const btn = row?.querySelector(".pr-scorebtn");
        if (btn && !btn.dataset.wired) {
          btn.dataset.wired = "1";
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            raw.scrollIntoView({ behavior: "smooth", block: "center" });
            raw.classList.add("pr-flash");
            setTimeout(() => raw.classList.remove("pr-flash"), 1400);
          });
        }
      });
      zone.dataset.complete = pending === 0 ? "1" : "0";
      document.body.classList.toggle("curio-dossier-ready", pending === 0);

      // deep-link: /t/slug/id/N where N is an edge → highlight its row
      const m = window.location.pathname.match(/\/(\d+)$/);
      if (m) {
        const target = zone.querySelector(`.position-row[data-edge-post="${m[1]}"]`);
        if (target) {
          target.classList.add("pr-focus");
          setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
        }
      }
      return zone.dataset.complete === "1";
    };
    return run(0);
  };

  let dossierTimer = null;
  const scheduleDossier = () => {
    clearTimeout(dossierTimer);
    dossierTimer = setTimeout(() => {
      try { assembleDossier(); } catch (e) { /* boundary: native page survives */ }
    }, 120);
  };
  let streamObserver = null;
  api.onPageChange(() => {
    document.getElementById("curio-positions")?.remove();
    document.body.classList.remove("curio-dossier-ready");
    document.querySelectorAll(".curio-edge-hidden").forEach((n) => n.classList.remove("curio-edge-hidden"));
    streamObserver?.disconnect();
    streamObserver = null;

    const attach = () => {
      const stream = document.querySelector(".post-stream");
      if (!stream) return false;
      let busy = false;
      const tryAssemble = () => {
        if (busy) return;
        busy = true;
        let done = false;
        try { done = assembleDossier(); } catch (e) { done = false; }
        busy = false;
        if (done) { streamObserver?.disconnect(); streamObserver = null; }
      };
      streamObserver = new MutationObserver(tryAssemble);
      streamObserver.observe(stream, { childList: true, subtree: true });
      tryAssemble();
      // safety: stop observing after 15s of no completion (page may have no edges)
      setTimeout(() => { streamObserver?.disconnect(); streamObserver = null; }, 15000);
      return true;
    };
    if (!attach()) {
      const wait = new MutationObserver(() => { if (attach()) wait.disconnect(); });
      wait.observe(document.getElementById("main-outlet") || document.body, { childList: true, subtree: true });
      setTimeout(() => wait.disconnect(), 8000);
    }
  });

  api.decorateCookedElement(
    async (el, helper) => {
      const post = helper?.getModel?.();
      if (el.querySelector('.d-wrap[data-wrap="curio-gravity"]')) {
        el.closest(".topic-post")?.classList.add("curio-edge-post");
      }

      // ── concept entry: masthead + self-populating gallery + grid ──
      el.querySelectorAll('.d-wrap[data-wrap="curio-concept"]').forEach(async (w) => {
        if (w.querySelector(".curio-masthead")) return;
        const mast = document.createElement("div");
        mast.className = "curio-masthead";
        const dom = document.createElement("span");
        dom.className = "cm-domain";
        dom.textContent = decode(w.dataset.domain || "");
        mast.append(dom);
        (decode(w.dataset.related || "")).split(",").filter(Boolean).forEach((slug) => {
          const a = document.createElement("a");
          a.className = "cm-related";
          a.href = `/tag/${slug.trim()}`;
          a.textContent = prettify(slug.trim());
          mast.append(a);
        });
        w.prepend(mast);
        try {
          const tc1 = api.container.lookup("controller:topic");
          if (post && post.post_number === 1 && tc1?.model?.title) {
            const h = document.createElement("h1");
            h.className = "ch-title";
            h.textContent = tc1.model.title;
            mast.prepend(h);
            w.classList.add("curio-hero");
            const sib = w.nextElementSibling;
            if (sib && sib.id !== "curio-essay-label") {
              const lab = document.createElement("div");
              lab.id = "curio-essay-label";
              lab.className = "curio-sectlabel";
              lab.textContent = settings.label_theconcept;
              w.after(lab);
            }
          }
        } catch {}

        if (post && post.post_number === 1 && w.dataset.concept) {
          const slug = decode(w.dataset.concept);
          const works = await conceptWorks(slug);
          if (works.length) {
            w.append(buildGrid(works));
            const fic = works.filter((x) => (x.mode || "fiction") !== "nonfiction");
            const non = works.filter((x) => (x.mode || "fiction") === "nonfiction");
            const section = (label, list, cls) => {
              if (!list.length) return;
              const h = document.createElement("div");
              h.className = "curio-sublabel " + cls;
              h.textContent = label;
              w.append(h, buildGallery(list));
            };
            if (fic.length && non.length) {
              section(settings.label_fiction, fic, "cs-fiction");
              section(settings.label_nonfiction, non, "cs-nonfiction");
            } else {
              w.append(buildGallery(fic.length ? fic : non));
            }
          } else {
            const e = document.createElement("div");
            e.className = "curio-noworks";
            e.textContent = settings.label_noworks;
            w.append(e);
          }
          try {
            const cv = await fetchJson(`/tags/c/chronovisor/${settings.chronovisor_id}/${slug}.json`);
            const hits = (cv.topic_list?.topics || []).slice(0, 4);
            if (hits.length) {
              const strip = document.createElement("div");
              strip.className = "curio-chronostrip";
              strip.innerHTML = `<span class="cs-label">${settings.label_chronostrip}</span>` +
                hits.map((t) => `<a href="/t/${t.slug}/${t.id}">📼 ${t.fancy_title}</a>`).join("");
              w.append(strip);
            }
          } catch {}
        }
      });

      // ── vault card ──
      el.querySelectorAll('.d-wrap[data-wrap="curio-card"]').forEach((w) => {
        if (w.querySelector(".curio-cardhead")) return;
        const head = document.createElement("div");
        head.className = "curio-cardhead";
        const meta = document.createElement("div");
        meta.className = "cc-meta";
        if (!w.dataset.medium) {
          try {
            const cat = currentCategory(api);
            if (cat && cat.parent_category_id === settings.vault_id) w.dataset.medium = cat.name.toLowerCase();
          } catch {}
        }
        [["medium", "Medium"], ["year", "Year"], ["creator", "Creator"], ["runtime", "Runtime"]].forEach(([k, label]) => {
          if (!w.dataset[k]) return;
          const cell = document.createElement("div");
          cell.className = "cc-cell";
          cell.innerHTML = `<span class="cc-label">${label}</span><span class="cc-value">${decode(w.dataset[k])}</span>`;
          meta.append(cell);
        });
        ["tmdb", "imdb"].forEach((k) => {
          if (!w.dataset[k]) return;
          const a = document.createElement("a");
          a.className = "cc-ext";
          a.href = decode(w.dataset[k]);
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = k.toUpperCase() + " ↗";
          meta.append(a);
        });
        head.append(meta);
        // hero conversion on entry pages
        try {
          const tc0 = api.container.lookup("controller:topic");
          if (post && post.post_number === 1 && tc0?.model?.title) {
            const h = document.createElement("h1");
            h.className = "vh-title";
            h.textContent = tc0.model.title;
            head.prepend(h);
            w.classList.add("vault-hero");
            const img = w.querySelector("img");
            if (img) w.style.setProperty("--vh-bg", `url(${img.getAttribute("src")})`);
          }
        } catch {}
        // gravity plaques: the relationship's visual identity, right on the hero
        try {
          const tc = api.container.lookup("controller:topic");
          const posts = tc?.model?.postStream?.posts || [];
          const row = document.createElement("div");
          row.className = "gravity-plaques";
          let found = 0;
          posts.forEach((p) => {
            if (!(p.cooked || "").includes('data-wrap="curio-gravity"')) return;
            const ga = (n) => {
              const m = (p.cooked || "").match(new RegExp(`data-${n}="([^"]*)"`));
              return m ? m[1] : null;
            };
            const slug = ga("concept");
            if (!slug) return;
            const ex = parseFloat(ga("ex")), ey = parseFloat(ga("ey"));
            const tier = ga("tier") || "";
            const suffix = slug.replace(/-/g, "_");
            const px = pollMean((p.polls || []).find((x) => x.name === `axis_x_${suffix}`));
            const py = pollMean((p.polls || []).find((x) => x.name === `axis_y_${suffix}`));
            const hasComm = px && py && Math.min(px.voters, py.voters) >= settings.min_voters;
            const a = document.createElement("a");
            a.className = "gravity-plaque";
            a.href = `/t/${tc.model.slug}/${tc.model.id}/${p.post_number}`;
            a.innerHTML = `${miniGrid(ex, ey, hasComm ? px.mean : null, hasComm ? py.mean : null, tier)}
              <span class="gp-body">
                <span class="gp-name">${prettify(slug)}</span>
                <span class="gp-meta">${isNaN(ex) ? "" : `${ex} · ${ey}`}${tier ? ` · <i style="color:${tierColor(tier)}">${tier.toUpperCase()}</i>` : ""}</span>
                <span class="gp-hint">${hasComm ? `${settings.label_community} ${px.mean.toFixed(1)} · ${py.mean.toFixed(1)}` : settings.label_vote_hint}</span>
              </span>`;
            row.append(a);
            found++;
          });
          if (found) {
            const lab = document.createElement("div");
            lab.className = "gp-label";
            lab.textContent = settings.label_gravity;
            const wrap2 = document.createElement("div");
            wrap2.className = "gp-zone";
            wrap2.append(lab, row);
            head.append(wrap2);
          }
        } catch {}
        w.prepend(head);
      });


      // ── ballots: polls grouped into labeled voting boxes ──
      try {
      const pollEls = [...el.querySelectorAll(".poll[data-poll-name], div.poll")];
      if (pollEls.length && !el.querySelector(".curio-ballot")) {
        const labels = {};
        (settings.poll_labels || "").split("|").forEach((row) => {
          const [k, t, hint] = row.split("::");
          if (k) labels[k.trim()] = { t, hint };
        });
        const sliderNames = ["accessibility", "register", "strangeness", "footprint"];
        const labelFor = (name) => {
          if (labels[name]) return labels[name];
          if (name.startsWith("axis_x_")) return { t: settings.label_axis_x_short, hint: settings.label_axis_x_hint };
          if (name.startsWith("axis_y_")) return { t: settings.label_axis_y_short, hint: settings.label_axis_y_hint };
          return null;
        };
        const wrapPoll = (p, target) => {
          const name = p.dataset.pollName || p.getAttribute("data-poll-name") || "";
          const info = labelFor(name);
          const item = document.createElement("div");
          item.className = "cb-item";
          if (info) {
            const lab = document.createElement("div");
            lab.className = "csp-label";
            lab.innerHTML = `<b>${info.t}</b>${info.hint ? `<span>${info.hint}</span>` : ""}`;
            item.append(lab);
          }
          target.append(item);
          item.append(p);
          p.classList.add("csp-poll");
        };
        // relationship ballots: attach axis polls to their gravity block
        el.querySelectorAll('.d-wrap[data-wrap="curio-gravity"]').forEach((gw) => {
          const suffix = decode(gw.dataset.concept || "").replace(/-/g, "_");
          const mine = pollEls.filter((p) => {
            const n = p.dataset.pollName || "";
            return n === `axis_x_${suffix}` || n === `axis_y_${suffix}`;
          });
          if (!mine.length) return;
          const bal = document.createElement("div");
          bal.className = "curio-ballot";
          const head = document.createElement("div");
          head.className = "csp-head";
          // the page already tells you which work — the ballot only needs the concept
          const conceptName = prettify(decode(gw.dataset.concept || ""));
          head.innerHTML = conceptName
            ? `${settings.label_score_prefix} <b>${conceptName}</b>`
            : settings.label_scorepanel_work;
          bal.append(head);
          mine.forEach((p) => wrapPoll(p, bal));
          gw.append(bal);
        });
        // calibration ballot: the four sliders, one box
        const sliders = pollEls.filter((p) => sliderNames.includes(p.dataset.pollName || ""));
        if (sliders.length) {
          const bal = document.createElement("div");
          bal.className = "curio-ballot cb-calib";
          const head = document.createElement("div");
          head.className = "csp-head";
          head.textContent = settings.label_scorepanel_vault;
          bal.append(head);
          sliders.forEach((p) => wrapPoll(p, bal));
          sliders[0] && el.append(bal);
        }
      }
      } catch (e) { /* ballots are enhancement; never block render */ }

      // ── challenge / response citations ──
      [["curio-challenge", settings.label_challenge], ["curio-response", settings.label_response]].forEach(([name, label]) => {
        el.querySelectorAll(`.d-wrap[data-wrap="${name}"]`).forEach((w) => {
          if (w.querySelector(".curio-cite")) return;
          const h = document.createElement("div");
          h.className = "curio-cite";
          const who = post ? `@${post.username}` : "";
          const when = post?.created_at ? new Date(post.created_at).toISOString().slice(0, 10) : "";
          h.textContent = `${label}${who ? " · " + who : ""}${when ? " · " + when : ""}`;
          w.prepend(h);
        });
      });
    },
    { id: "curiobase" }
  );


});
