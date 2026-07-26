# Curiobase

A Discourse theme component for **timetravelinstitute.com**. Renders the Curiobase — a
community-scored map of ideas and the works that take them seriously.

Not a general-purpose component. It is wired to specific category IDs on TTI.

---

## What it does

| Surface | Description |
|---|---|
| **Concept dossier** | Assembles a concept page from its own post plus every work tagged with that concept |
| **Gravity grid** | SVG scatter plot — each work placed by its two community scores |
| **Position rows** | Per-work summary rows on a concept page, linking to the scoring ballots |
| **Vault cards** | Work entries with poster art, metadata, trailer |
| **Shelves** | Self-populating medium listings (Film, TV, Books, Games, Video) |
| **Hub** | Cross-domain index |
| **Challenge** | Cited disagreement with a community score |

Scores are **community-only**. There is deliberately no editorial score.

## Scoring model

Two axes, 1–5, one Discourse number poll each:

- **CENTRALITY** — is the idea set dressing, or load-bearing?
- **NERVE** — does the work tidy the idea away, or face it?

Axis names and all interface copy live in **component settings**, not in code or posts. Renaming an
axis updates every entry instantly.

A **pairing** is a reply post on a work, carrying one concept and two polls:

```
[wrap=curio-gravity concept="causal-loop"]
[/wrap]

[poll type=number name=axis_x_causal_loop min=1 max=5 step=1 results=always]
[/poll]

[poll type=number name=axis_y_causal_loop min=1 max=5 step=1 results=always]
[/poll]
```

Poll names are `axis_x_<concept-slug>` / `axis_y_<concept-slug>`. **The slug is the permanent key** —
it is embedded in poll names and tags. A concept's display title can change freely; its slug cannot.

---

## File layout

```
javascripts/discourse/
  api-initializers/
    curiobase.js     732 lines   every rendered surface, in api.onPageChange /
                                 decorateCookedElement blocks
  lib/
    helpers.js       116 lines   decode, tagName, pollScale, pollMean, siteCats,
                                 catById, ancestryHas, currentCategory, miniGrid,
                                 tierColor, prettify, fetchJson, cache
    scoring.js       233 lines   conceptWorks, edgeFromPost, scoreLine, buildRow,
                                 buildGrid, buildGallery
common/common.scss
settings.yml
```

Theme JS files import each other with **relative specifiers** — `import { decode } from
"../lib/helpers"`. Discourse bundles the whole `javascripts/` tree as one Rollup graph, so this is
portable and contains no theme id. A **bare** specifier like `discourse/lib/helpers` would be treated
as external and silently resolve to Discourse core instead.

`settings` and `themePrefix` are injected into **every** module in the tree by the build, not just
initializers — use them freely in `lib/`. Never declare a top-level binding with either name; it is a
hard compile error.

### Why this is one component and not two

An earlier plan called for splitting this into `curiobase-entries` and `curiobase-scoring`. Measured
against the actual code, that's the wrong trade:

- The settings both halves need are **exactly the four category IDs** — `curiobase_id`,
  `nominations_id`, `vault_id`, `screening_id`. Those are the settings that change when the category
  consolidation runs. Two components means maintaining them in two places, and when they drift one
  half renders and the other silently doesn't.
- 116 lines of shared helpers would have to be duplicated, since theme components cannot import from
  each other.
- The two halves would need a DOM mount-point contract plus retry logic, because load order between
  independent components isn't guaranteed.

Splitting the *file* gets the maintainability win with none of that. Further entry types should
become `lib/` modules, not new components.

---

## Post formats

### Work

```
[wrap=curio-card medium="film" title="Primer" year="2004" creator="Shane Carruth"
                 runtime="77 min" imdb="…" mode="fiction"]
![poster](https://…)
[/wrap]

One paragraph of factual description.

https://www.youtube.com/watch?v=…      ← trailer, oneboxes to a player
```

Every attribute is optional. Missing ones are skipped, not rendered blank. `medium` falls back to the
category name.

### Concept

```
[wrap=curio-concept domain="Temporal" concept="causal-loop"
                    related="temporal-perception,timeline-divergence"
                    dek="An event that is its own cause."]
[/wrap]

The essay.
```

`dek` is optional — without it the component summarises the first substantial paragraph.

### Entry — event · person · place · object · org · claim

Entries live in **Curiobase → Entries (118)**, which is wiki-by-default and carries a topic
template. They are identified by the wrap and the `entry-*` tag, **never by category id.**

```
[wrap=entry type="event" slug="rendlesham-forest-incident"
            start="1980-12-26" end="1980-12-28"]

One sentence a stranger could repeat back to you.

|  |  |
|---|---|
| **When** | 26–28 December 1980 |
| **Where** | Rendlesham Forest, Suffolk |
| **Witnesses** | [Charles Halt](/t/charles-halt/1235) |
| **Reviewed** | 2026-07-26 |

[/wrap]

[event start="1980-12-26" end="1980-12-28" status="standalone" allDay="true"
       timezone="Europe/London" name="Rendlesham Forest incident"]
[/event]

## What happened
Prose. Reports what sources say; does not adjudicate.

## Connected
- **Concept** — [UAP & Phenomena](/t/uap-phenomena/19616)

[wrap=entry-needs]

**This entry still needs**

- [ ] the exact date the memo was filed
- [ ] a photograph from the period

[/wrap]
```

**The fact table is authored as real markdown on purpose.** It renders server-side as a real
`<table>` that a crawler reads; the component swaps in a styled `<dl>`. If the JavaScript never
loads, the facts are still there. The `Reviewed` row is pulled out and shown as a freshness stamp.

**The first paragraph is the dek, and it must be real prose inside the wrap.** Discourse builds
`meta description` and `og:description` from the start of the cooked post. Author it as a `dek=`
attribute and the Google snippet becomes *"When 26–28 December 1980 Where Rendlesham Forest,
Suffolk — between RAF…"*, which is useless. The attribute is still read as a fallback, but prose
wins. The component hoists it into the masthead either way.

**Each open need renders as a button that opens a reply**, not as something to tick. Ticking means
*"this gap is filled"*, which is only true once the entry itself has been edited — so a member who
knows the answer would tick (easy, entry no better) rather than reply (useful). The checkbox stays
for staff to mark absorbed. Author a `**This entry still needs**` line inside the wrap so it reads
correctly without JavaScript.

`start` / `end` are **optional ISO dates, used only for the JSON-LD.** They are not read from
the fact table (`26–28 December 1980` is not a schema.org date) and cannot be read from the
`[event]` block — the plugin replaces its own cooked node before the component runs. Omit them
and the JSON-LD simply carries no date, which is better than carrying a wrong one.

**The needs list uses real `- [ ]` checklist syntax**, so the `checklist` plugin owns ticking. The
component only adds the heading and the done/total count.

## The record — one shape for everything

```
[wrap=tti type="work" slug="primer-2004"]

One sentence a stranger could repeat back to you.

|  |  |
|---|---|
| **Medium** | Film |
| **Year** | 2004 |
| **Creator** | Shane Carruth |
| **Reviewed** | 2026-07-26 |

[/wrap]

![poster](…)

The body. Then media, then anything else.
```

`type` is one of: `event · person · place · object · org · claim · work · concept · exhibit`
(the list is the `entry_types` setting — adding a type is config, not code).

**Every record has the same three-part anatomy, whatever its type:**

| | |
|---|---|
| **Record header** | type badge · title · dek · fact strip · reviewed stamp |
| **Body** | the essay, the document, the description |
| **Derived views** | works grid, witness register, needs list, Related Topics |

### Scoring works across both vocabularies

A **pairing** is still a reply carrying `[wrap=curio-gravity]` and two polls — that is a different
kind of thing from a record and keeps its own wrap.

What changed is how the concept page reads the *work* it is scoring. `readRecord()` in `helpers.js`
pulls facts from **either** vocabulary: the unified record's markdown table, or a legacy
`curio-card`'s `data-*` attributes, with the table winning where both exist. It also finds the poster
whether it sits inside the wrap (legacy) or after it (unified).

**This matters because converting a work must never silently drop it out of the grid.** Before the
fix, converting Primer left `conceptWorks` unable to find its card at all — it fell back to a bare
topic title with no year, medium or poster, and nothing would have reported the loss. Verified after
the fix: all four Causal Loop works resolve identically, one unified and three legacy.

### Relationships are not authored

**Do not write "Connected" lists.** Tag the record instead. Discourse derives the rest:

- `/tag/causal-loop` — everything about it, server-rendered
- `/tags/intersection/causal-loop/temporal-perception` — faceted, server-rendered, **cross-category**
- Related Topics surfaces siblings with no work at all

Verified: tagging Causal Loop with `temporal-perception` produced a five-item derived list —
Primer, Timecrimes, 12 Monkeys, Cause and Effect and the concept itself — with nothing authored.

Authored relationships are O(n²) work that goes stale silently. Tags are O(1) and always current.

Keep a hand-written link only where the relationship is a *specific claim about two specific things*
("Halt wrote this memo"), never for category membership.

### Migration

Legacy wraps (`curio-card`, `curio-concept`, `entry`) still have their own renderers, so nothing
broke. **Converting a post to `[wrap=tti]` is what moves it onto the new path — there is no flag
day.** Once nothing uses a legacy wrap, delete its renderer.

---

### ⚠ The authoring rule that governs every surface

**Discourse renders the post. Anything the component computes, fetches, or reads out of a `data-*`
attribute does not exist for search engines or for anyone without JavaScript.**

Verified 26 July by fetching the live site anonymously (the crawler view is suppressed for logged-in
users, so you must check while logged out):

| Surface | What a crawler actually gets |
|---|---|
| Entry page | dek, fact table, every section, every link — **correct** |
| Concept page | the essay and two bare links. **No grid, no gallery, no scores** — the live page shows four works, the HTML has two links |
| Vault work | poster and prose, but no card metadata; each pairing renders as `- 1 - 2 - 3 - 4 - 5 / 0 voters` |
| Chronovisor exhibit | the full document (excellent), but the snippet is the document's ASCII header and the manifest is invisible |

The two components read **21 distinct `data-*` attributes**. Every fact in them is invisible.

**So: author facts as markdown; let the component be a skin.** A fact strip authored as a markdown
table renders as a real `<table>` server-side and gets restyled client-side. A fact authored as
`data-year="2004"` renders as nothing. This is the single highest-leverage rule in the project and
the entry system is currently the only surface that follows it.

Corollary: **the first block of a post becomes the Google snippet.** Lead with a human sentence,
never a fact table and never a verbatim document header.

---

#### The gate: when is something an entry, and when is it a section?

**An entry must contain at least one fact that appears in no other entry. If it doesn't, it is a
section with a heading.**

This rule exists because the first cluster built here failed it completely. Rendlesham was split into
six entries — the event, the forest, Charles Halt, the Halt memo, Penniston's binary claim and
Majestic 12 — and a check across them found **zero facts unique to any of the four satellites**. The
radiation readings appeared in three entries; the date discrepancy in two. Every one of the four was
220–290 words entirely restated from the 900-word event entry. They were collapsed back the same day.

The mistake was applying the **type taxonomy** — is it a person? a place? an object? — instead of the
question that actually matters: *does anyone want this page, and does it hold anything of its own?*
Type describes what a thing **is**. Entry-worthiness is about **demand and distinct content**. A
person who only exists inside one event is a section of that event.

**Splitting buys you less than it looks like it does**, because Discourse already generates a
heading anchor for every `##` in a post:

```
/t/rendlesham-forest-incident/19627#p-126057-the-discrepancy-in-the-record-2
```

That is a real, indexable, deep-linkable URL. A section is already a destination. Splitting adds a
sync burden and buys a URL you effectively already had.

Types remain available — all eight — but the gate decides, not the type.

#### ⚠ Entry-specific traps

- **The four extra poll axes are dormant, not dead.** `poll_labels` defines `accessibility`,
  `register`, `strangeness` and `footprint`; `curiobase.js` filters polls by those exact names and
  renders them as a *calibration ballot*. No content uses them today. It looks like dead code and
  isn't — deleting it removes a working feature.
- **Needs must be a fixed block at the END of the post.** The checklist plugin finds boxes by
  counting `[ ]` / `[x]` pairs by ordinal position in the raw markdown. A stray bracket pair earlier
  in the post will make a tick flip the wrong box.
- **Only users who can *edit* get clickable boxes.** That's why the category is wiki-by-default.
  Without wiki, members see dead glyphs.
- **Every tick writes a revision and bumps the topic to /latest.** No setting disables this.
- **`status="standalone"`** on the event block — otherwise a 45-year-old event gets RSVP buttons.
- **New categories need `allowed_tag_groups` set explicitly.** Left empty, tags are silently
  dropped on save — the API returns 200 and simply doesn't apply them. Every other category on TTI
  declares its groups; follow that. Do **not** set `required_tag_groups` — that breaks topic
  creation for members.
- `entry-*` tags are in the **Entry Type (staff)** group, `one_per_topic`, staff-only. They drive
  rendering, so they're curation vocabulary rather than subject description.

---

## ⚠ Format rules, learned the hard way

- **Every wrap must close with `[/wrap]`.**
- **Never put a double quote inside an attribute value.** `author=""O.H. Krill""` silently kills the
  entire tag and the whole block renders as literal BBCode on the page. Use single quotes inside:
  `author="'O.H. Krill'"`. *(This shipped live and sat broken for a day.)*
- **Single-letter attribute names are eaten by the parser.** Use `ex=` / `ey=`, never `x=` / `y=`.
- **Polls sit outside wraps**, never inside.
- **A poll's scale and options cannot change once anyone has voted** — Discourse discards the votes.
  The component therefore *derives* the scale from the poll's own options rather than trusting a
  setting, so a future 1–10 poll renders correctly alongside old 1–5 ones.

### Check for broken wraps across the whole site

Should return only posts where a wrap sits inside a fenced code block on purpose:

```sql
SELECT p.id, p.topic_id, t.title
FROM posts p JOIN topics t ON t.id = p.topic_id
WHERE p.deleted_at IS NULL
  AND p.raw LIKE '%[wrap=%'
  AND p.cooked LIKE '%[wrap=%';
```

---

## ⚠ Settings values are not in this repo

`settings.yml` contains the **schema and defaults only**. The values configured on TTI — axis names,
category IDs, and every interface string — live in the site database.

**Reinstalling this component from git resets them to defaults.** They are recorded in
`SETTINGS.md`; check it before any reinstall.

### Category bindings

| Setting | TTI category |
|---|---|
| `curiobase_id` | 106 |
| `vault_id` | 112 |
| `screening_id` | 12 |
| `nominations_id` | 111 |

---

## Known limitations

- **The assembled output is client-side only.** Search engines see the raw post — the grid, scores
  and relationships are invisible to crawlers. Fixing this means moving facts into the post markdown
  rather than into `data-*` attributes.
- **Ballots stay in their own posts.** Teleporting live poll widgets into assembled rows was tried
  and caused the poll plugin to recreate nodes, producing 170 stacked ballots on one page. Rows now
  summarise and link instead.
- **Five settings are referenced nowhere in the code** — `label_editorial`, `label_referenced`,
  `label_assessment`, `label_unrated`, `label_this_work`. They survive a removed editorial layer.
  Left in place deliberately; delete them and the orphaned SCSS together.

## Development

```
gem install discourse_theme
discourse_theme watch .
```

**Always verify by looking at the rendered page**, not the API response. Every failure in this
component's history has been a successful write that rendered wrong.

## Related

- `discourse-chronovisor` — sibling component, recovered-forum exhibits
- Design docs live in the TTI working folder, not in this repo
