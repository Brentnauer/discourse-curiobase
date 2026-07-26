// THE TAG PAGE IS THE CONCEPT PAGE.
//
// Discourse already gives every tag a server-rendered, crawlable page listing everything
// filed under it, across categories, maintained by nobody. That derived list is the whole
// reason relationships stopped being authored.
//
// What it does NOT give is identity: /tag/temporal-perception is a bare topic list with a
// one-line description. It doesn't say what the idea IS, doesn't show how works score
// against it, and doesn't link to the essay.
//
// This module supplies that. It finds the concept record that owns the slug and mounts its
// masthead, dek and gravity grid above the list — so the page Discourse maintains for free
// becomes the page a reader actually wants.
//
// Deliberately additive: if the concept lookup fails, the native tag page is left exactly
// as it was. A missing enhancement is invisible; a broken one is not.

import { fetchJson, prettify, decode } from "./helpers";

const conceptCache = new Map();

// The tag slug from /tag/:slug or /tags/c/:cat/:id/:slug — never from the topic list,
// which may be filtered.
export function tagSlugFromRoute() {
  const m = window.location.pathname.match(/^\/tags?\/(?:c\/[^/]+\/\d+\/)?([^/?#]+)/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]);
  // /tags/intersection/... and the bare /tags index are not single-tag pages
  if (slug === "intersection" || slug === "c") return null;
  return slug;
}

// Find the concept record that owns this slug.
//
// Fast path: the concept topic's own slug usually equals the tag. Verify by reading the
// record's data-slug, because a topic slug is derived from the title and can drift.
export async function findConcept(tagSlug) {
  if (conceptCache.has(tagSlug)) return conceptCache.get(tagSlug);
  let found = null;
  try {
    const feed = await fetchJson(`/tags/c/curiobase/${settings.curiobase_id}/${tagSlug}.json`);
    const topics = feed.topic_list?.topics || [];
    const ordered = [
      ...topics.filter((t) => t.slug === tagSlug),
      ...topics.filter((t) => t.slug !== tagSlug),
    ];
    for (const t of ordered.slice(0, 4)) {
      const tj = await fetchJson(`/t/${t.id}.json`);
      const d = document.createElement("div");
      d.innerHTML = tj.post_stream?.posts?.[0]?.cooked || "";
      const w = d.querySelector('.d-wrap[data-wrap="tti"][data-type="concept"], .d-wrap[data-wrap="curio-concept"]');
      if (!w) continue;
      const slug = decode(w.dataset.slug || w.dataset.concept || "");
      if (slug !== tagSlug) continue;

      // the dek is the first paragraph inside the record; the domain a row in its table
      const dek = [...w.children].find((n) => n.tagName === "P")?.textContent?.trim() || "";
      const facts = {};
      w.querySelectorAll("table tr").forEach((tr) => {
        const c = tr.querySelectorAll("td, th");
        if (c.length < 2) return;
        const k = (c[0].textContent || "").trim().toLowerCase();
        const v = (c[1].textContent || "").trim();
        if (k && v) facts[k] = v;
      });
      found = { id: t.id, slug: t.slug, title: tj.title, dek, domain: facts.domain || "" };
      break;
    }
  } catch {
    found = null;
  }
  conceptCache.set(tagSlug, found);
  return found;
}

export function clearTagConcept() {
  document.getElementById("tag-concept")?.remove();
  document.body.classList.remove("tag-concept-active");
}

export async function mountTagConcept(api, buildGridFor) {
  clearTagConcept();
  const tagSlug = tagSlugFromRoute();
  if (!tagSlug) return null;

  const concept = await findConcept(tagSlug);
  if (!concept) return null; // not a concept tag — leave the native page alone

  const box = document.createElement("section");
  box.id = "tag-concept";

  const head = document.createElement("div");
  head.className = "tc-head";
  if (concept.domain) {
    const dom = document.createElement("span");
    dom.className = "tc-domain";
    dom.textContent = concept.domain;
    head.append(dom);
  }
  const h = document.createElement("h1");
  h.className = "tc-title";
  h.textContent = concept.title || prettify(tagSlug);
  head.append(h);
  box.append(head);

  if (concept.dek) {
    const d = document.createElement("p");
    d.className = "tc-dek";
    d.textContent = concept.dek;
    box.append(d);
  }

  // the grid is the thing a bare tag page can never show: how works sit against the idea
  try {
    const grid = await buildGridFor(tagSlug);
    if (grid) {
      const holder = document.createElement("div");
      holder.className = "tc-grid";
      holder.append(grid);
      box.append(holder);
    }
  } catch {
    /* grid is enhancement; the header still stands without it */
  }

  const more = document.createElement("a");
  more.className = "tc-more";
  more.href = `/t/${concept.slug}/${concept.id}`;
  more.textContent = settings.label_tag_concept_more || "Read the full entry →";
  box.append(more);

  // mount above the topic list, retrying because the list renders asynchronously
  await new Promise((resolve) => {
    let tries = 20;
    const int = setInterval(() => {
      const list = document.querySelector(".topic-list, #list-area");
      if (list && !document.getElementById("tag-concept")) {
        (list.closest("#list-area") || list).parentNode.insertBefore(box, list.closest("#list-area") || list);
        document.body.classList.add("tag-concept-active");
        clearInterval(int);
        resolve();
      } else if (--tries <= 0) {
        clearInterval(int);
        resolve();
      }
    }, 150);
  });

  return box;
}
