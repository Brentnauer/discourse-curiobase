# Curiobase — live settings

**Captured from timetravelinstitute.com, 26 July 2026.**

`settings.yml` in this repo holds the schema and defaults only. These are the values actually
configured on TTI. **Reinstalling the component from git resets everything below to defaults.**

---

## Category bindings

| Setting | Value | Category |
|---|---|---|
| `curiobase_id` | `106` | Curiobase |
| `nominations_id` | `111` | Curiobase → Nominations |
| `vault_id` | `112` | The Vault |
| `screening_id` | `12` | The Vault → Screening Room |
| `chronovisor_id` | `85` | Chronovisor *(for the cross-wing strip)* |

⚠ **These change if the category consolidation runs.** See `tti-architecture.md` — the plan dissolves
Curiobase's four domain subcategories and moves concepts into subject rooms. Update these first.

## Scoring behaviour

| Setting | Value | Note |
|---|---|---|
| `min_voters` | `1` | Community numbers appear after a single vote |
| `scale_max` | `5` | Fallback only — the component derives the real scale from each poll's own options |

---

## Axis labels — the two-axis model

**Grid endpoints**

| Setting | Value |
|---|---|
| `label_x_left` | `SET DRESSING` |
| `label_x_right` | `LOAD-BEARING` |
| `label_y_bottom` | `TIDIED` |
| `label_y_top` | `UNFLINCHING` |

**Short names**

| Setting | Value |
|---|---|
| `label_axis_x_short` | `CENTRALITY` |
| `label_axis_y_short` | `NERVE` |

**Hints**

| Setting | Value |
|---|---|
| `label_axis_x_hint` | `is the idea load-bearing? 1 = set dressing · 5 = the work cannot exist without it` |
| `label_axis_y_hint` | `how far does it follow the idea? 1 = tidied into a neat ending · 5 = pursued past the point of comfort` |
| `label_grid_hint` | `Each work sits where the community has scored it — centrality across, nerve up. Click a poster to open the work.` |

## Poll labels

Format: `<key>::<HEADING>::<hint>` separated by `|`

```
axis_x::DECORATION → OBSESSION::1 = the concept is set dressing · 5 = the work cannot exist without it|axis_y::CONTAINED → UNRESOLVED::1 = tidied into a neat ending · 5 = pursued past the point of comfort|accessibility::ACCESSIBILITY::1 = anyone can start here · 5 = demands homework|register::EMOTIONAL REGISTER::1 = cerebral · 5 = visceral|strangeness::STRANGENESS::1 = grounded · 5 = fully outside consensus reality|footprint::CULTURAL FOOTPRINT::1 = obscure · 5 = household name
```

**See the discrepancies section below — this setting disagrees with the grid labels.**

## Tier colours

```
Essential:#2aa79b|Significant:#7fb8b0|Notable:#5a7a76
```

---

## Interface strings

| Setting | Value |
|---|---|
| `label_gravity` | `GRAVITY INDEX` |
| `label_theconcept` | `THE CONCEPT` |
| `label_positions` | `POSITIONS` |
| `label_discussion` | `DISCUSSION` |
| `label_fiction` | `FICTION` |
| `label_nonfiction` | `NONFICTION · documentary, explainer, investigation` |
| `label_referenced` | `Referenced by` |
| `label_chronostrip` | `From the Chronovisor` |
| `label_community` | `Community` |
| `label_assessment` | `why this work engages the idea` |
| `label_permalink` | `permalink` |

**Scoring calls to action**

| Setting | Value |
|---|---|
| `label_scorepanel_work` | `SCORE THIS PAIRING` |
| `label_scorepanel_vault` | `RATE THIS WORK` |
| `label_score_prefix` | `SCORE THIS WORK AGAINST` |
| `label_scorebtn` | `score this pairing ↓` |
| `label_vote_cta` | `open the work & score it →` |
| `label_vote_hint` | `tap to score` |
| `label_yourscore` | `your score` |
| `label_nominate_cta` | `Nominate a work or concept →` |
| `label_challenge_btn` | `challenge this score` |

**States and counts**

| Setting | Value |
|---|---|
| `label_awaiting` | `not yet scored — be first` |
| `label_noworks` | `No works referenced yet — tag a Vault entry with this concept and give it a gravity block.` |
| `label_noworks_short` | `no works yet — add one` |
| `label_counting` | `…` |
| `label_voter` / `label_voters` | `voter` / `voters` |
| `label_work` / `label_works` | `work` / `works` |
| `label_this_work` | `this work` |

**Vestigial — see below**

| Setting | Value |
|---|---|
| `label_editorial` | `Editorial` |
| `label_unrated` | `unrated by Editorial` |
| `label_response` | `EDITORIAL RESPONSE` |
| `label_challenge` | `CHALLENGE FILED` |

⚠ Multi-byte characters throughout — `↓ → · …`. Copy exactly.

---

# ⚠ Three discrepancies worth resolving

Found while transcribing. None are breaking anything today, but all three are landmines for the
planned rewrite.

## 1 · The axis labels contradict each other

Two different vocabularies are live simultaneously for the same two axes:

| | X axis | Y axis |
|---|---|---|
| **Grid endpoints** | SET DRESSING → LOAD-BEARING | TIDIED → UNFLINCHING |
| **Short names** | CENTRALITY | NERVE |
| **Poll headings** | **DECORATION → OBSESSION** | **CONTAINED → UNRESOLVED** |

A member reading the grid sees one framing; the same member opening the ballot sees another. The
hints match, so the *meaning* is consistent — but the words aren't. **Pick one vocabulary.**

## 2 · Four axes are defined but unused

`poll_labels` defines six axes: `axis_x`, `axis_y`, **`accessibility`**, **`register`**,
**`strangeness`**, **`footprint`**.

Only the first two are part of the live two-axis model. The other four are almost certainly left over
from an earlier design. They cost nothing while dormant, but anyone reading this setting cold will
assume six-axis scoring exists.

**Either delete them or document them as reserved.**

## 3 · Editorial labels survive a removed feature

`label_editorial`, `label_unrated` *("unrated by Editorial")*, `label_response`
*("EDITORIAL RESPONSE")* and `label_challenge` *("CHALLENGE FILED")* all describe an editorial-score
layer that was **deliberately removed** — scoring is community-only by design.

If those code paths are dead, the settings should go with them. If they're *not* dead, something can
still render "unrated by Editorial" on a page that has no editorial layer.

**Worth grepping `curiobase.js` for `label_editorial` and `label_unrated` before the split.**

`tier_colors` (Essential / Significant / Notable) may be in the same category — check whether a tier
is still assigned anywhere.

---

## Restore procedure

1. Install the component from this repo
2. **Category IDs first** — nothing else renders correctly without them
3. Then axis labels, then interface strings
4. Open a concept page *(e.g. Causal Loop)* and a Vault work *(e.g. Primer)* and **look at the
   rendered pages**
5. Confirm the gravity grid draws, position rows appear, and a ballot opens
