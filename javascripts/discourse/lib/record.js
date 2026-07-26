// THE TTI RECORD — one shape for every kind of thing the site holds.
//
//   [wrap=tti type="event|person|place|object|org|claim|work|concept|exhibit" slug="…"]
//
// Every record has the same three-part anatomy, whatever its type:
//
//   RECORD HEADER   type badge · title · dek · fact strip · reviewed stamp   (this file)
//   BODY            the essay, the document, the description                 (authored prose)
//   DERIVED VIEWS   works grid, witness register, needs list, Related Topics (elsewhere / native)
//
// Design rules, and why:
//
//  1. KEYED ON TAGS AND THE WRAP, NEVER ON CATEGORY ID. The category tree is being
//     restructured; tags are not.
//
//  2. THE MARKDOWN IS THE STRUCTURE. The fact strip is authored as a real markdown table,
//     so it renders server-side as a <table> a crawler reads. This file only restyles it.
//     Facts in data-* attributes are invisible to search engines — that was the single
//     biggest defect found in the 26 July audit, and this shape is the fix.
//
//  3. RELATIONSHIPS ARE NOT AUTHORED. No hand-typed "Connected" lists. Tag the record and
//     let Discourse derive the connections: tag pages and tag intersections are
//     server-rendered and free, and Related Topics surfaces siblings automatically.
//     Authored relationships are O(n^2) work that goes stale silently.
//
//  4. THE PLUGIN DOES THE BEHAVIOUR. Checklists, polls and events belong to their plugins.
//
// Legacy wraps (curio-card, curio-concept, chrono-manifest) still have their own renderers.
// Converting a post to [wrap=tti] is what moves it onto this path — there is no flag day.

import { decode, prettify, fetchJson } from "./helpers";

// ── type vocabulary: slug : DISPLAY : schema.org type ──
// One list covers every record on the site — entries, Vault works, concepts and
// Chronovisor exhibits. Adding a type is a settings change, not a code change.
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
      // capture `text` NOW: buildFactStrip moves these nodes into the <dd>, after which
      // valueCell is empty. Reading it later silently yields "" -- which is how the
      // JSON-LD shipped without startDate or location the first time.
      return { label, valueCell: cells[1], text: (cells[1].textContent || "").trim() };
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

// ── needs list ──
//
// The affordance problem this solves: a checkbox invites the reader to TICK, but ticking
// means "this gap is now filled", which is only true if they also edited the entry. A
// member who knows the answer would tick (easy, and leaves the entry no better) instead of
// replying (useful). So the tick is left as the staff absorption action, and each open need
// becomes a button that opens a reply with the need quoted. Contribution = posting, which
// is the behaviour the whole system is built on.
function openReplyFor(api, needText) {
  try {
    const topic = api.container.lookup("controller:topic")?.model;
    const composer = api.container.lookup("service:composer");
    if (!topic || !composer) return false;
    composer.open({
      action: "reply",
      topic,
      draftKey: topic.draft_key,
      draftSequence: topic.draft_sequence,
      topicBody: `> ${needText}\n\n`,
    });
    return true;
  } catch {
    return false;
  }
}

// A 🔍 reaction on the entry means "this needs a source" — a gap raised by the
// community rather than by staff. It is deliberately excluded from the like set
// site-wide, so flagging a gap is not scored as endorsement and does not feed
// trust-level progress. Counts arrive preloaded with the topic; no extra request.
function communityGapCount(post) {
  const want = (settings.entry_gap_reaction || "mag").trim();
  const hit = (post?.reactions || []).find((r) => r.id === want);
  return hit ? hit.count : 0;
}

function decorateNeeds(wrap, api, post) {
  if (wrap.dataset.entryNeedsDone === "1") return;
  wrap.dataset.entryNeedsDone = "1";

  const boxes = [...wrap.querySelectorAll(".chcklst-box")];
  const isDone = (b) => b.classList.contains("checked") || b.classList.contains("permanent");
  const done = boxes.filter(isDone).length;
  const open = boxes.length - done;

  // Prefer a heading the author wrote (it is visible without JavaScript); fall back to ours.
  let head = [...wrap.children].find(
    (n) => n.tagName === "P" && n.textContent.trim() && !n.querySelector("ul, li")
  );
  if (head) {
    head.classList.add("entry-needs-head", "en-authored");
  } else {
    head = document.createElement("div");
    head.className = "entry-needs-head";
    const h = document.createElement("span");
    h.className = "en-title";
    h.textContent = open > 0 ? settings.label_entry_needs : settings.label_entry_complete;
    head.append(h);
    wrap.prepend(head);
  }

  if (boxes.length) {
    const count = document.createElement("span");
    count.className = "en-count";
    count.textContent = `${done}/${boxes.length}`;
    head.append(count);
  }

  // turn each open need into a reply prompt
  boxes.forEach((box) => {
    const li = box.closest("li");
    if (!li || isDone(box) || li.querySelector(".en-ask")) return;
    const label = (li.textContent || "").trim();
    if (!label) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "en-ask";
    btn.textContent = label;
    btn.title = settings.label_entry_needs_cta || "Reply with this";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!openReplyFor(api, label)) {
        // composer unavailable — send them to the reply button rather than failing silently
        document.querySelector(".topic-footer-main-buttons .create")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    });

    // replace the text nodes after the checkbox with the button
    [...li.childNodes].forEach((n) => {
      if (n !== box) n.remove();
    });
    li.append(btn);
  });

  wrap.classList.toggle("entry-needs-open", open > 0);
  wrap.classList.toggle("entry-needs-done", open === 0 && boxes.length > 0);

  if (open > 0 && settings.label_entry_needs_hint && !wrap.querySelector(".en-hint")) {
    const hint = document.createElement("div");
    hint.className = "en-hint";
    hint.textContent = settings.label_entry_needs_hint;
    wrap.append(hint);
  }

  // community-raised gaps sit alongside the authored ones
  const gaps = communityGapCount(post);
  if (gaps > 0 && !wrap.querySelector(".en-gap")) {
    const g = document.createElement("div");
    g.className = "en-gap";
    g.textContent = (
      gaps === 1 ? settings.label_entry_gap_one : settings.label_entry_gap_many
    ).replace("%{count}", gaps);
    wrap.append(g);
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
  const slug = decode(wrap.dataset.slug || "");
  const data = {
    "@context": "https://schema.org",
    "@type": info.schema,
    name: title,
    url,
  };
  // the slug is the entry's permanent key — use it as the stable @id so cross-references
  // survive retitling, which is the whole reason the slug exists
  if (slug) data["@id"] = `${window.location.origin}/entry/${slug}`;
  if (dek) data.description = dek;

  // Machine-readable dates come from optional ISO attributes on the wrap, never from the
  // prose in the fact table ("26–28 December 1980" is not a schema.org date), and never
  // from the event plugin's DOM -- it replaces its own cooked node, so nothing is readable
  // there by the time we run.
  const start = decode(wrap.dataset.start || "");
  const end = decode(wrap.dataset.end || "");
  if (start) data.startDate = start;
  if (end) data.endDate = end;

  facts.forEach(({ label, text }) => {
    if (!text) return;
    const key = label.toLowerCase();
    if (info.schema === "Event" && key === "where") {
      data.location = { "@type": "Place", name: text };
    }
    if (info.schema === "Place" && key === "location") data.address = text;
  });

  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.className = "entry-jsonld";
  s.textContent = JSON.stringify(data);
  wrap.append(s);
}

// ── the whole entry surface, called from decorateCookedElement ──
export function renderRecord(el, post, api) {
  el.querySelectorAll('.d-wrap[data-wrap="entry-needs"]').forEach((w) => decorateNeeds(w, api, post));

  // `tti` is the vocabulary. `entry` is kept as an alias so already-published entries
  // keep rendering; it can go once nothing uses it.
  el.querySelectorAll('.d-wrap[data-wrap="tti"], .d-wrap[data-wrap="entry"]').forEach((wrap) => {
    if (wrap.querySelector(".entry-masthead")) return;

    const type = decode(wrap.dataset.type || "");
    const dek = decode(wrap.dataset.dek || "");
    let dekText = dek;
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

    // The dek should be the FIRST content in the post, authored as a real paragraph.
    // Discourse builds the meta description and og:description from the start of the cooked
    // post -- so if the fact table comes first, the Google snippet is
    // "When 26-28 December 1980 Where Rendlesham Forest, Suffolk - between RAF..." which is
    // useless. An authored paragraph is preferred and hoisted into the masthead; the dek=
    // attribute stays supported as a fallback for entries not yet migrated.
    const authoredDek = [...wrap.children].find(
      (n) => n.tagName === "P" && n.textContent.trim()
    );
    if (authoredDek) {
      dekText = authoredDek.textContent.trim();
      authoredDek.classList.add("entry-dek");
      mast.append(authoredDek);
    } else if (dek) {
      const d = document.createElement("p");
      d.className = "entry-dek";
      d.textContent = dek;
      mast.append(d);
    }

    // ── LAYOUT, chosen by type ──
    //
    // One authoring vocabulary, three layouts. These are three different products that
    // happen to share a data shape; giving them one template put a film's poster sixth
    // on its own page, under a document header it never wanted.
    //
    //   card      works        poster-led, metadata inline   (TTIDB)
    //   index     concepts     definition + what's filed here (the join)
    //   document  everything else                             (encyclopedia)
    const layout = type === "work" ? "card" : type === "concept" ? "index" : "document";
    wrap.classList.add(`record-${layout}`);

    wrap.prepend(mast);

    if (layout === "card") {
      // The poster IS the identity of a work. Lift it beside the title rather than
      // leaving it below the prose, and render the facts as one inline row: five facts
      // do not need five rows of a definition list.
      const poster =
        wrap.querySelector("img") ||
        wrap.closest(".cooked")?.querySelector("img");
      if (poster) {
        const fig = document.createElement("div");
        fig.className = "rc-poster";
        fig.append(poster.closest("p") || poster);
        wrap.prepend(fig);
        wrap.classList.add("has-poster");
      }
      if (rows.length) {
        const line = document.createElement("div");
        line.className = "rc-meta";
        rows
          .filter((r) => r.label.toLowerCase() !== String(settings.label_entry_reviewed_key || "reviewed").toLowerCase())
          .forEach(({ valueCell }) => {
            const span = document.createElement("span");
            span.className = "rc-fact";
            while (valueCell.firstChild) span.append(valueCell.firstChild);
            line.append(span);
          });
        mast.append(line);
      }
      table?.remove();
      // no freshness stamp on a work: a runtime does not go stale
    } else if (layout === "index") {
      // A concept has no facts worth tabulating — a one-row "Domain" table is noise.
      // The domain already appears in the masthead.
      table?.remove();
    } else {
      if (table) table.replaceWith(strip);
      if (reviewed) {
        const r = document.createElement("div");
        r.className = "entry-reviewed";
        r.textContent = `${settings.label_entry_reviewed} ${reviewed}`;
        wrap.append(r);
      }
    }

    if (isFirst) {
      injectJsonLd(wrap, {
        type,
        title,
        dek: dekText,
        facts: rows,
        url: window.location.origin + window.location.pathname,
      });
    }
  });

  decorateConnected(el);
}

// ── the entries index ──
//
// Built from ONE category request. The listing does not carry excerpts, so showing a dek per
// entry would cost a fetch per entry -- the same waste that made a John Titor concept page
// issue 19 requests to render 2 works. Discovery does not justify that; titles, type and
// contribution counts do the job.
export async function buildEntryIndex(api, mountInto) {
  const id = parseInt(settings.entries_id, 10);
  if (!id) return null;

  let topics = [];
  try {
    const feed = await fetchJson(`/c/${id}.json`);
    topics = feed.topic_list?.topics || [];
  } catch {
    return null;
  }

  // drop the category definition topic — it is machinery, not an entry
  topics = topics.filter((t) => !t.pinned || (t.tags || []).some((x) => tname(x).startsWith("entry-")));

  const types = entryTypes();
  const groups = new Map();
  topics.forEach((t) => {
    const tag = (t.tags || []).map(tname).find((x) => x.startsWith("entry-"));
    if (!tag) return;
    const key = tag.replace(/^entry-/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  const wrap = document.createElement("section");
  wrap.id = "entry-index";

  const head = document.createElement("div");
  head.className = "ei-head";
  const h = document.createElement("h2");
  h.className = "ei-title";
  h.textContent = settings.label_entry_index_title;
  head.append(h);
  const n = [...groups.values()].reduce((a, g) => a + g.length, 0);
  const count = document.createElement("span");
  count.className = "ei-count";
  count.textContent = String(n);
  head.append(count);
  wrap.append(head);

  if (settings.label_entry_index_hint) {
    const hint = document.createElement("p");
    hint.className = "ei-hint";
    hint.textContent = settings.label_entry_index_hint;
    wrap.append(hint);
  }

  if (!n) {
    const empty = document.createElement("p");
    empty.className = "ei-empty";
    empty.textContent = settings.label_entry_index_empty;
    wrap.append(empty);
    mountInto(wrap);
    return wrap;
  }

  // preserve the order the type vocabulary is declared in, not alphabetical
  const order = Object.keys(types);
  [...groups.keys()]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .forEach((key) => {
      const info = types[key] || { label: prettify(key) };
      const sec = document.createElement("div");
      sec.className = `ei-group ei-is-${key}`;

      const lab = document.createElement("span");
      lab.className = `entry-type et-${key}`;
      lab.textContent = info.label;
      sec.append(lab);

      const ul = document.createElement("ul");
      ul.className = "ei-list";
      groups
        .get(key)
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
        .forEach((t) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.className = "ei-link";
          a.href = `/t/${t.slug}/${t.id}`;
          a.textContent = t.title;
          li.append(a);

          const subj = (t.tags || [])
            .map(tname)
            .filter((x) => x && !x.startsWith("entry-"))
            .slice(0, 3);
          if (subj.length) {
            const s = document.createElement("span");
            s.className = "ei-tags";
            s.textContent = subj.join(" · ");
            li.append(s);
          }

          const contributions = Math.max(0, (t.posts_count || 1) - 1);
          if (contributions > 0) {
            const c = document.createElement("span");
            c.className = "ei-contrib";
            c.textContent = `${contributions} ${settings.label_entry_contributions}`;
            li.append(c);
          }
          ul.append(li);
        });
      sec.append(ul);
      wrap.append(sec);
    });

  mountInto(wrap);
  return wrap;
}

// tag entries arrive as either strings or {name} objects depending on the endpoint
function tname(x) {
  return typeof x === "string" ? x : x?.name || "";
}

// ── body state, driven from the topic's tags ──
//
// This deliberately does NOT live in renderEntry. decorateCookedElement runs BEFORE
// onPageChange, so a class set during render was being wiped by the reset a moment later.
// Reading the entry type off the topic's `entry-*` tag makes it independent of decorator
// ordering, and it works on every route the topic model is available on.
export function applyRecordBodyClass(api) {
  const b = document.body;
  [...b.classList].forEach((c) => {
    if (c === "entry-entry" || c.startsWith("entry-is-")) b.classList.remove(c);
  });

  let tags = [];
  try {
    tags = api.container.lookup("controller:topic")?.model?.tags || [];
  } catch {
    return;
  }
  const typeTag = tags.find((t) => typeof t === "string" && t.startsWith("entry-"));
  if (!typeTag) return;

  b.classList.add("entry-entry", `entry-is-${typeTag.replace(/^entry-/, "")}`);
}
