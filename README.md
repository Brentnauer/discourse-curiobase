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
            start="1980-12-26" end="1980-12-28"
            dek="One sentence a stranger could repeat back to you."]

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
- [ ] the exact date the memo was filed
- [ ] a photograph from the period
[/wrap]
```

**The fact table is authored as real markdown on purpose.** It renders server-side as a real
`<table>` that a crawler reads; the component swaps in a styled `<dl>`. If the JavaScript never
loads, the facts are still there. The `Reviewed` row is pulled out and shown as a freshness stamp.

`start` / `end` are **optional ISO dates, used only for the JSON-LD.** They are not read from
the fact table (`26–28 December 1980` is not a schema.org date) and cannot be read from the
`[event]` block — the plugin replaces its own cooked node before the component runs. Omit them
and the JSON-LD simply carries no date, which is better than carrying a wrong one.

**The needs list uses real `- [ ]` checklist syntax**, so the `checklist` plugin owns ticking. The
component only adds the heading and the done/total count.

#### ⚠ Entry-specific traps

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
