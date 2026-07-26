// The TTI entry system: event, person, place, object, org, claim.
//
// Design rules this file obeys, and why:
//
//  1. KEYED ON TAGS, NOT CATEGORIES. Entries are identified by the `entry-*` tag and the
//     `[wrap=entry type="..."]` block, never by category id. The category tree is being
//     restructured; tags are not. Wiring entries to category ids would break them all on
//     the day the consolidation runs.
//
//  2. THE MARKDOWN IS THE STRUCTURE. The fact strip is authored as a real markdown table,
//     so it renders server-side as a real <table> that a crawler reads. This file only
//     restyles what is already there. If the JavaScript never loads, the entry still
//     works and still ranks.
//
//  3. THE PLUGIN DOES THE BEHAVIOUR. Needs lists are authored as real `- [ ]` checklist
//     items so the checklist plugin makes them tickable. This file adds the heading and
//     the count; it does not reimplement ticking.

import { decode, prettify } from "./helpers";

// ── type vocabulary: slug : DISPLAY : schema.org type ──
function entryTypes() {
  const map = {};
  (settings.entry_types || "").split("|").forEach((chunk) => {
    const [slug, label, schema] = chunk.split(":");
    if (slug) {
      map[slug.trim()] = { label: (label || slug).trim(), schema: (schema || "Thing").trim() };
    }
  });
  return map;
}

function typeInfo(slug) {
  return entryTypes()[slug] || { label: prettify(slug || "entry"), schema: "Thing" };
}

// ── read the authored fact table into ordered [label, valueEl] pairs ──
function readFacts(wrap) {
  const table = wrap.querySelector("table");
  if (!table) return { table: null, rows: [] };
  const rows = [...table.querySelectorAll("tr")]
    .map((tr) => {
      const cells = tr.querySelectorAll("td, th");
      if (cells.length < 2) return null;
      const label = (cells[0].textContent || "").trim().replace(/[:：]\s*$/, "");
      if (!label) return null;
      return { label, valueCell: cells[1] };
    })
    .filter(Boolean);
  return { table, rows };
}

// ── the fact strip: restyle the authored table into a definition grid ──
function buildFactStrip(rows, reviewedLabel) {
  const strip = document.createElement("dl");
  strip.className = "entry-facts";
  let reviewed = null;

  rows.forEach(({ label, valueCell }) => {
    // the review date is a freshness stamp, not a fact about the subject
    if (label.toLowerCase() === String(reviewedLabel || "reviewed").toLowerCase()) {
      reviewed = (valueCell.textContent || "").trim();
      return;
    }
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    // move the authored nodes, so links (and their topic ids) survive intact
    while (valueCell.firstChild) dd.append(valueCell.firstChild);
    strip.append(dt, dd);
  });

  return { strip, reviewed };
}

// ── needs list: the checklist plugin owns the boxes, we own the frame ──
function decorateNeeds(wrap) {
  if (wrap.querySelector(".entry-needs-head")) return;

  const boxes = [...wrap.querySelectorAll(".chcklst-box")];
  const done = boxes.filter(
    (b) => b.classList.contains("checked") || b.classList.contains("permanent")
  ).length;
  const open = boxes.length - done;

  const head = document.createElement("div");
  head.className = "entry-needs-head";

  const h = document.createElement("span");
  h.className = "en-title";
  h.textContent = open > 0 ? settings.label_entry_needs : settings.label_entry_complete;
  head.append(h);

  if (boxes.length) {
    const count = document.createElement("span");
    count.className = "en-count";
    count.textContent = `${done}/${boxes.length}`;
    head.append(count);
  }

  wrap.classList.toggle("entry-needs-open", open > 0);
  wrap.classList.toggle("entry-needs-done", open === 0 && boxes.length > 0);
  wrap.prepend(head);

  if (open > 0 && settings.label_entry_needs_hint) {
    const hint = document.createElement("div");
    hint.className = "en-hint";
    hint.textContent = settings.label_entry_needs_hint;
    wrap.append(hint);
  }
}

// ── connected: turn the authored list into chips, keeping every link intact ──
function decorateConnected(root) {
  const wanted = (settings.label_entry_connected || "Connected").trim().toLowerCase();
  const heads = [...root.querySelectorAll("h1, h2, h3")].filter(
    (h) => (h.textContent || "").trim().toLowerCase() === wanted
  );
  heads.forEach((h) => {
    const list = h.nextElementSibling;
    if (!list || list.tagName !== "UL" || list.classList.contains("entry-connected")) return;
    list.classList.add("entry-connected");
    [...list.children].forEach((li) => {
      const strong = li.querySelector("strong");
      if (strong) strong.classList.add("ec-kind");
    });
    h.classList.add("entry-sectlabel");
  });
}

// ── JSON-LD. A bonus for crawlers, never the primary structure. ──
function injectJsonLd(wrap, { type, title, dek, facts, url }) {
  if (wrap.querySelector("script.entry-jsonld")) return;
  const info = typeInfo(type);
  const data = {
    "@context": "https://schema.org",
    "@type": info.schema,
    name: title,
    url,
  };
  if (dek) data.description = dek;

  facts.forEach(({ label, valueCell }) => {
    const text = (valueCell.textContent || "").trim();
    if (!text) return;
    const key = label.toLowerCase();
    if (info.schema === "Event") {
      if (key === "when") data.startDate = text;
      if (key === "where") data.location = { "@type": "Place", name: text };
    }
    if (info.schema === "Person" && key === "lived") data.description = `${text}. ${dek || ""}`.trim();
    if (info.schema === "Place" && key === "location") data.address = text;
  });

  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.className = "entry-jsonld";
  s.textContent = JSON.stringify(data);
  wrap.append(s);
}

// ── the whole entry surface, called from decorateCookedElement ──
export function renderEntry(el, post, api) {
  el.querySelectorAll('.d-wrap[data-wrap="entry-needs"]').forEach(decorateNeeds);

  el.querySelectorAll('.d-wrap[data-wrap="entry"]').forEach((wrap) => {
    if (wrap.querySelector(".entry-masthead")) return;

    const type = decode(wrap.dataset.type || "");
    const dek = decode(wrap.dataset.dek || "");
    const info = typeInfo(type);
    const isFirst = post && post.post_number === 1;

    const { table, rows } = readFacts(wrap);
    const { strip, reviewed } = buildFactStrip(rows, settings.label_entry_reviewed_key);

    const mast = document.createElement("div");
    mast.className = "entry-masthead";

    const badge = document.createElement("span");
    badge.className = `entry-type et-${type || "generic"}`;
    badge.textContent = info.label;
    mast.append(badge);

    let title = "";
    try {
      const tc = api.container.lookup("controller:topic");
      if (isFirst && tc?.model?.title) {
        title = tc.model.title;
        const h1 = document.createElement("h1");
        h1.className = "entry-title";
        h1.textContent = title;
        mast.append(h1);
        wrap.classList.add("entry-hero");
      }
    } catch {}

    if (dek) {
      const d = document.createElement("p");
      d.className = "entry-dek";
      d.textContent = dek;
      mast.append(d);
    }

    wrap.prepend(mast);

    if (table) {
      table.replaceWith(strip);
    }

    if (reviewed) {
      const r = document.createElement("div");
      r.className = "entry-reviewed";
      r.textContent = `${settings.label_entry_reviewed} ${reviewed}`;
      wrap.append(r);
    }

    if (isFirst) {
      document.body.classList.add("entry-entry", `entry-is-${type || "generic"}`);
      injectJsonLd(wrap, {
        type,
        title,
        dek,
        facts: rows,
        url: window.location.origin + window.location.pathname,
      });
    }
  });

  decorateConnected(el);
}

// ── clear body state between routes ──
export function resetEntryBodyClasses() {
  const b = document.body;
  [...b.classList].forEach((c) => {
    if (c === "entry-entry" || c.startsWith("entry-is-")) b.classList.remove(c);
  });
}
