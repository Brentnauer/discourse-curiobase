// Curiobase scoring: the two-axis model and everything that renders from it.
//
// Split out of curiobase.js -- code is unchanged, only relocated.

import {
  cache,
  decode,
  pollScale,
  pollMean,
  miniGrid,
  tierColor,
  prettify,
  fetchJson,
} from "./helpers";

// ── gather works for a concept: tag feed in the Vault, gravity block per work ──
async function conceptWorks(conceptSlug) {
  const key = `works:${conceptSlug}`;
  if (cache.has(key)) return cache.get(key);
  let works = [];
  try {
    const feed = await fetchJson(`/tags/c/the-vault/${settings.vault_id}/${conceptSlug}.json`);
    // Filter BEFORE the cap: Screening Room is discussion, not works, and letting it
    // through both wasted a topic fetch per thread and could push real works past the 24.
    const topics = (feed.topic_list?.topics || [])
      .filter((t) => t.category_id !== settings.screening_id)
      .slice(0, 24);
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


export { conceptWorks, edgeFromPost, scoreLine, buildRow, buildGrid, buildGallery };
