import { apiInitializer } from "discourse/lib/api";

import {
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
} from "../lib/helpers";

import {
  conceptWorks,
  edgeFromPost,
  scoreLine,
  buildRow,
  buildGrid,
  buildGallery,
} from "../lib/scoring";

import { renderRecord, applyRecordBodyClass, buildEntryIndex } from "../lib/record";

export default apiInitializer("1.0", (api) => {
  api.onPageChange(() => {
    const b = document.body;
    applyRecordBodyClass(api);
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
    const en = catById(api, settings.entries_id);
    nav.append(
      mk("Curiobase", cb, inCurio && cat.id !== settings.nominations_id && cat.id !== settings.entries_id),
      mk("The Vault", vt, inVault)
    );
    // entries are only reachable if they have somewhere to be reached from
    if (en) nav.append(mk(settings.label_nav_entries, en, cat.id === settings.entries_id));
    nav.append(mk("Nominate", nm || cb, cat.id === settings.nominations_id));
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
      // Every authored vocabulary must be listed, or the divider decides the record
      // itself is "discussion" and drops a DISCUSSION rule above the first post.
      const AUTHORED = '.d-wrap[data-wrap="tti"], .d-wrap[data-wrap="curio-card"], .d-wrap[data-wrap="curio-gravity"], .d-wrap[data-wrap="curio-concept"], .d-wrap[data-wrap="entry"], .d-wrap[data-wrap="entry-needs"]';
      const isEntry = (el) => el.querySelector(AUTHORED);
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
    document.getElementById("entry-index")?.remove();
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
    // the entries index — its own listing page, grouped by type
    if (settings.entries_id && cat.id === parseInt(settings.entries_id, 10)) {
      try {
        await buildEntryIndex(api, mount);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[curiobase] entry index failed", e);
      }
      return;
    }

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
            // Screening Room lives inside the Vault but holds discussion, not works.
            // Counting it made the index advertise works the concept page won't render.
            const n = (feed.topic_list?.topics || [])
              .filter((t) => t.category_id !== settings.screening_id).length;
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
      const heroWrap = document.querySelector('.d-wrap[data-wrap="tti"][data-type="work"], .d-wrap[data-wrap="curio-card"]');
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
            const cw = h.querySelector('.d-wrap[data-wrap="tti"][data-type="concept"], .d-wrap[data-wrap="curio-concept"]');
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

      // ── entry system: event / person / place / object / org / claim ──
      try {
        renderRecord(el, post, api);
      } catch (e) {
        // never let an entry failure take down the scoring surfaces below
        // eslint-disable-next-line no-console
        console.warn("[curiobase] record render failed", e);
      }

      // ── concept entry: masthead + self-populating gallery + grid ──
      // Each surface is isolated. One thrown error used to abort the whole decorator,
      // taking the masthead, grid, gallery AND vault card down together -- which is
      // exactly what a stray non-string tag did.
      try {
      el.querySelectorAll('.d-wrap[data-wrap="tti"][data-type="concept"], .d-wrap[data-wrap="curio-concept"]').forEach(async (w) => {
        if (w.querySelector(".curio-masthead")) return;
        // A unified record keeps its facts in the markdown table and its relationships in
        // tags. Read the table first, fall back to the legacy attributes.
        const wFacts = {};
        w.querySelectorAll("table tr").forEach((tr) => {
          const c = tr.querySelectorAll("td, th");
          if (c.length < 2) return;
          const k = (c[0].textContent || "").trim().toLowerCase();
          const v = (c[1].textContent || "").trim();
          if (k && v) wFacts[k] = v;
        });
        const conceptSlug = decode(w.dataset.slug || w.dataset.concept || "");
        // Topic tags arrive as either strings or {name} objects depending on where they
        // come from. Not normalising them threw `e.trim is not a function`, which killed
        // the WHOLE decorator -- masthead, grid, gallery and vault card at once.
        const relatedTags = (() => {
          try {
            const raw = w.dataset.related
              ? decode(w.dataset.related).split(",")
              : api.container.lookup("controller:topic")?.model?.tags || [];
            return raw.map(tagName).filter((t) => t && t !== conceptSlug);
          } catch { return []; }
        })();

        const mast = document.createElement("div");
        mast.className = "curio-masthead";
        const dom = document.createElement("span");
        dom.className = "cm-domain";
        dom.textContent = wFacts.domain || decode(w.dataset.domain || "");
        mast.append(dom);
        relatedTags.forEach((slug) => {
          const a = document.createElement("a");
          a.className = "cm-related";
          a.href = `/tag/${slug}`;
          a.textContent = prettify(slug);
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

        if (post && post.post_number === 1 && conceptSlug) {
          const slug = conceptSlug;
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
      } catch (e) { console.warn("[curiobase] concept surface failed", e); }

      try {
      el.querySelectorAll('.d-wrap[data-wrap="tti"][data-type="work"], .d-wrap[data-wrap="curio-card"]').forEach((w) => {
        if (w.querySelector(".curio-cardhead")) return;
        // On a unified record the header (badge, title, dek, fact strip) is already
        // drawn by record.js from the markdown table. Only the hero treatment and the
        // gravity plaques are still wanted here.
        const unified = w.dataset.wrap === "tti";
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
            // On a unified record the poster sits AFTER the wrap, not inside it, so
            // scoping this lookup to the wrap silently loses the hero background.
            const img = w.querySelector("img") || w.closest(".cooked")?.querySelector("img");
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


      } catch (e) { console.warn("[curiobase] vault card surface failed", e); }

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
