---
date: 2026-08-06T09:13:01+00:00
git_commit: fd637a72d4727531445929b71e56004330527528
branch: main
topic: "Mobile header: slim sticky bar + scroll-away chrome"
tags: [plan, mobile, responsive, toolbar, filterbar]
status: draft
---

# PLAN: Mobile header — slim sticky bar + scroll-away chrome

Improve the mobile (`≤720px`) view of `todos.html`. Today the entire header stack
(topbar + view-chips + toolbar + filter bar) is pinned above the list and eats ~4–5 rows of
screen before the first todo. This plan slims the pinned chrome down to a **slim sticky bar**
(view-chips + quick-add + 🗂 New set), lets everything else **scroll away and return at the
top**, moves **🗂 New set next to the quick-add input**, and turns the **"Show only" filter row
into a single-line horizontal scroll**. Desktop stays visually unchanged.

There is no ticket; this comes from the owner's direct request:
> "the sticky area is too big. new set button should be horizontally next to the add to do
> input. show only should be a horizontal scroll. and what is now sticky should not be sticky
> on mobile but on scroll should collapse."

## Acceptance Criteria

- On mobile (`≤720px`), scrolling the list keeps **only** the slim bar
  {View-chips + Quick-add + 🗂} pinned; the **mode toggle, view title, ⋯ menu, Sort/Arrange,
  and "Show only"** scroll away and **return when scrolled back to the top**.
- The **🗂 New set** button sits on the **same row as the quick-add input**, to its right
  (icon-only on mobile, accessible name preserved).
- The **"Show only"** filter row is a **single-line horizontal scroll** (no wrapping) on mobile.
- At the very top of the page, the fixed chrome is **visibly shorter** than today (tighter
  vertical padding).
- **Desktop (>720px) is visually unchanged**: same one-row toolbar (`quick-add | Sort | Arrange |
  New set`), same sidebar scroller, same filter-bar wrapping.
- `npm run check` stays green (no JS/logic regressions); the app still opens by double-clicking
  `todos.html` with zero dependencies.

## Technical Key Decisions and Tradeoffs

1. **Slim pinned bar = View-chips + Quick-add + 🗂 only.**
   - Why: the owner's selected design; keeps the two most-used actions (switch view, add todo)
     always reachable while scrolling.
   - Impact: mode toggle + title + ⋯ + Sort/Arrange + filters live in the scroll-away zones
     (reachable by scrolling to the top).

2. **Collapse via CSS `position: sticky`, not a JS scroll listener.**
   - Why: native, jank-free, less code; reproduces "stays / scrolls away / returns at top"
     exactly without scroll-direction math.
   - Impact: on mobile `.main` becomes the scroll container (today only `.list-wrap` scrolls); a
     single sticky wrapper — a **direct child of `.main`** — holds the slim bar. (A sticky element
     only stays pinned while its *parent* is on screen, so its parent must be the scroll
     container, not the short toolbar.)

3. **One DOM, two layouts via `display: contents`.**
   - Why: keep the desktop toolbar pixel-identical while regrouping the *same* nodes on mobile.
   - Impact: new wrapper `<div>`s dissolve on desktop (`display: contents`) so the flex toolbar is
     unchanged, and become real rows on mobile. Desktop visual order is preserved with flex
     `order`. `display: contents` is supported in iOS Safari 11.3+ / all current browsers.

4. **🗂 New set is icon-only on mobile; Sort + Arrange become a scroll-away row.**
   - Why: fit "New set" next to the input without crowding; declutter the pinned bar.
   - Impact: the "New set" text is wrapped in a span hidden under the breakpoint (same pattern as
     the sync pill's `.sync-label`); Sort + Arrange sit just under the slim bar and scroll away.

## Current State

All CSS lives in the single `<style>` block of `todos.html`; the mobile rules are the
`@media (max-width: 720px)` block at `todos.html:441-485`. Markup for the header is
`todos.html:513-560`. No `position: sticky` and no scroll listeners exist (verified by grep).

The header does not scroll because `.main` is `overflow: hidden` (`:103`) and only `.list-wrap`
scrolls (`flex: 1; overflow-y: auto`, `:222`). Everything above the list is therefore pinned:

```
┌──────────────────────────────────────────┐  mobile ≤720px
│ TOPBAR   :514-529   [💼│🏠] Title      ⋯ │  ← pinned
│ VIEW-CHIPS :531  ◎All ★ ⚡ ▤ ! 🌱 ✓     │  ← pinned (already h-scroll)
│ TOOLBAR :533-552  [ + Add a todo…      ]  │  ← pinned; quickadd flex:1 0 100%
│                   [Sort▾][Arrange▾][🗂]   │  ← wraps to a 2nd line
│ FILTERBAR :554    Show only [H][O][Q][★]  │  ← pinned; flex-wrap: wrap
├──────────────────────────────────────────┤
│ LIST-WRAP :559  (the only scroller) ↓     │
└──────────────────────────────────────────┘
```

Relevant markup (`todos.html`):
- `.topbar` — mode toggle (`#modeToggle`), `.mode-div`, `.topbar-title` (`#viewTitle`/`#viewSub`),
  `.spacer`, `#syncPill`, `#navToggle` (⋯). Lines 514-529.
- `.view-chips#viewChips` — line 531 (populated by `renderViews(..., {chip:true})`).
- `.toolbar` — `.quickadd` (`#quickAdd`), `#sortSel`, `#groupSel`, `#newGroupBtn`. Lines 533-552.
- `.filterbar#filterBar` — line 554 (populated by `renderFilterBar()`, `:799-813`).
- `.list-wrap#listWrap` — line 559.

Relevant mobile CSS (`todos.html:441-485`): `.toolbar { flex-wrap: wrap }` +
`.quickadd { flex: 1 0 100% }` force the wrap; `.filterbar` inherits `flex-wrap: wrap` from
`:208`.

JS touchpoints (must keep working): `renderViews` writes into `#viewChips` (`:830-843`),
`renderFilterBar` into `#filterBar` (`:799-813`), `#newGroupBtn` handler is bound by ID at
startup. **No JS behavior changes are required** — only element IDs must be preserved when the
DOM is regrouped.

## Desired End State

Mobile scroll flow inside `.main` (which becomes the scroll container), top → bottom:

```
  ┌ scrolls away ┐  Topbar:      [💼│🏠]  Title            ⋯
  ┌═ PINNED ═════┐  View-chips:   ◎All ★ ⚡ ▤ ! 🌱 ✓        (h-scroll)
  └═ (sticky) ═══┘  Quick-add:    [ + Add a todo…        ]  🗂
  ┌ scrolls away ┐  Sort ▾   Arrange ▾
  └ scrolls away ┘  Show only  [⬆High][⏰Overdue][⚡][★]…   (h-scroll, nowrap)
  ═══ todo list (fills the rest) ═══════════════════════════
```

- At top: full chrome, but tighter padding so it's shorter than today.
- Scrolled down: topbar + Sort/Arrange + "Show only" have scrolled off; the slim bar
  {view-chips + quick-add + 🗂} stays pinned at the top with a solid background + hairline.
- Scrolled back to top: everything returns.

Desktop (>720px): **unchanged** — one toolbar row `quick-add | Sort | Arrange | New set`,
sidebar is the nav, filter bar wraps as today.

## Abstractions and Code Reuse

- Reuse the existing sticky/pinned idiom already in the file: solid `var(--panel)` background +
  `1px solid var(--line)` bottom border (as `.topbar`/`.toolbar` use), and the
  **label-hidden-on-mobile** trick from `.sync-label` (`:482`) for the New-set label.
- Reuse the `.view-chips` h-scroll recipe (`overflow-x: auto; -webkit-overflow-scrolling: touch;`
  nowrap, `flex: none` children) for the filter bar's mobile scroll.
- New CSS-only wrappers (no new JS): `.tb-add` (quick-add + New set), `.tb-arrange`
  (Sort + Arrange), and `.stickybar` (view-chips + `.tb-add`). All are `display: contents` on
  desktop so the desktop toolbar collapses back to one flat flex row.

File tree of changes:

- `todos.html`
  - `<style>` — mobile `@media` block + a few base rules
    - `.toolbar` — desktop `display: flex` (unchanged look); mobile `display: contents`
    - `.stickybar` (new) — desktop `display: contents`; mobile `position: sticky; top: 0` wrapper
    - `.tb-add` (new) — desktop `display: contents`; mobile flex row (quick-add + 🗂)
    - `.tb-arrange` (new) — desktop `display: contents`; mobile flex row (Sort + Arrange)
    - `.main` — mobile becomes the scroll container; `.list-wrap` mobile becomes normal flow
    - `.filterbar` — mobile nowrap horizontal scroll
    - `#newGroupBtn` — new `.newset-label` span hidden on mobile; desktop `order` to keep position
    - tighten mobile paddings on `.topbar`, `.view-chips`, `.toolbar` rows
  - header markup (`:513-560`) — regroup toolbar + view-chips into the new wrappers; **all
    existing IDs preserved** (`#viewChips`, `#quickAdd`, `#sortSel`, `#groupSel`, `#newGroupBtn`,
    `#filterBar`, `#listWrap`)
- `docs/design-system.md` — update the "Responsive / mobile" section to describe the slim sticky
  bar, scroll-away chrome, New-set-inline, and filter h-scroll.

No new files. No dependency or build changes. App still opens by double-click.

## Logging & Observability

None — this is a presentational (CSS + markup) change with no runtime logging.

## Implementation

### Phase 1: Toolbar regroup — New set inline + Sort/Arrange split (desktop identical)

Dependencies: None.

Regroup the toolbar nodes into `display: contents` wrappers so the **same** markup renders as
one flat row on desktop and as separate rows on mobile, and move **🗂 New set** next to the
quick-add input. **Scroll behavior is unchanged in this phase** — the whole header is still
pinned (Phase 3 flips that). This phase de-risks `display: contents` before Phase 3 relies on it.

**Tasks**:
- [x] In `todos.html` header markup (`:533-552`), replace the flat `.toolbar` children with
  wrappers, preserving every ID and the `#newGroupBtn` label as a span:
  ```html
  <div class="toolbar">
    <div class="tb-add">
      <div class="quickadd">
        <span class="plus">+</span>
        <input id="quickAdd" type="text" placeholder="Add a todo and press Enter…" />
      </div>
      <button class="btn" id="newGroupBtn" title="Create a set of related todos"
              aria-label="Create a set of related todos">🗂 <span class="newset-label">New set</span></button>
    </div>
    <div class="tb-arrange">
      <select class="control" id="sortSel">…</select>
      <select class="control" id="groupSel">…</select>
    </div>
  </div>
  ```
- [x] Add base CSS: `.tb-add, .tb-arrange { display: contents; }` so desktop `.toolbar` stays a
  single flex row of `quickadd, newGroupBtn, sortSel, groupSel`.
- [x] Preserve the **desktop** visual order `quick-add | Sort | Arrange | New set` with flex
  `order` (default breakpoint only, i.e. outside the mobile media query): e.g.
  `.quickadd { order: 0 } #sortSel { order: 1 } #groupSel { order: 2 } #newGroupBtn { order: 3 }`.
  (Guard these `order` rules so they don't apply under `≤720px`.)
- [x] In the mobile `@media` block: `.tb-add { display: flex; align-items: center; gap: 8px; }`
  with `#newGroupBtn { flex: none; order: 0 }` and `.quickadd { flex: 1 }` so the input + 🗂
  share one row; `.tb-arrange { display: flex; gap: 10px; }` for the Sort/Arrange row; and
  `.newset-label { display: none }` so New set is icon-only on mobile.
- [x] Force the two rows to stack in this phase: `.tb-add, .tb-arrange { flex: 1 0 100% }` while
  `.toolbar` is still `flex-wrap: wrap` (the `display: contents` flip only happens in Phase 3,
  so without this each wrapper would size to content and share one line). Remove the now-obsolete
  `.quickadd { flex: 1 0 100% }` mobile rule (`:456`) — the full-width forcing now lives on the
  wrapper, not the input.

**Automated Verification**:
- [x] `npm run check` passes (ESLint + `tsc --noEmit` + `node --test`).

**Manual Verification**:
- [x] Desktop (>720px): the toolbar is still one row in the order
  `quick-add | Sort | Arrange | New set`, visually identical to before.
- [x] Mobile (≤720px, e.g. 390px): the quick-add input and 🗂 (icon-only) share one row; Sort +
  Arrange sit on the row below; the New-set button still opens a new set (`newGroup()`).

### Phase 2: Filter bar → horizontal scroll on mobile

Dependencies: None (independent of Phase 1; can land in either order).

Turn the "Show only" row into a single-line horizontal scroll on mobile instead of wrapping.

**Tasks**:
- [x] In the mobile `@media` block add: `.filterbar { flex-wrap: nowrap; overflow-x: auto;
  -webkit-overflow-scrolling: touch; }` and
  `.filterbar .fb-chip, .filterbar .fb-label, .filterbar .fb-clear { flex: none; }`
  so the label, chips, and Clear keep their size and the row scrolls horizontally (without
  `flex: none`, items shrink in a `nowrap` overflow strip).
- [x] Neutralize `.fb-clear { margin-left: auto }` (`:218-219`) on mobile (`margin-left: 0`) so
  the Clear control sits inline at the end of the scroll strip rather than being pushed by an
  auto margin inside an overflow container.

**Automated Verification**:
- [x] `npm run check` passes.

**Manual Verification**:
- [x] Mobile: the "Show only" row does not wrap; it scrolls sideways to reveal all chips
  (High · Overdue · Quick wins · ★ Focus). Toggling a chip still filters; Clear appears when a
  filter is active and clears it.
- [x] Desktop: the filter bar still wraps as before (unchanged).

### Phase 3: Sticky slim bar + scroll-away chrome + tighter top density

Dependencies: Phase 1 (relies on the `.tb-add` / wrapper structure) and Phase 2 (filter row is
finalized). Recommended last.

Make `.main` the mobile scroll container, wrap {view-chips + quick-add row} in a `position: sticky`
element that is a **direct child of `.main`**, let the topbar + Sort/Arrange + filter bar scroll
away, and tighten top paddings so the at-top chrome is shorter (ask #1).

**Tasks**:
- [x] Regroup markup so view-chips and the quick-add row live inside one sticky wrapper, with the
  Sort/Arrange row and filter bar as siblings **after** it, all direct children of `.main`:
  ```html
  <div class="topbar"> … </div>            <!-- scrolls away -->
  <div class="toolbar">                    <!-- display:contents on mobile → children join .main -->
    <div class="stickybar">                <!-- sticky on mobile -->
      <div class="view-chips" id="viewChips"></div>
      <div class="tb-add"> …quickadd + #newGroupBtn… </div>
    </div>
    <div class="tb-arrange"> …#sortSel + #groupSel… </div>   <!-- scrolls away -->
  </div>
  <div class="filterbar" id="filterBar"></div>                <!-- scrolls away -->
  <div class="imp-banner" …></div>
  <div class="sync-banner" …></div>
  <div class="list-wrap" id="listWrap"></div>
  ```
  Move `#viewChips` from its current standalone position (`:531`) into `.stickybar`; keep its ID.
- [x] Base CSS: `.stickybar { display: contents; }` (desktop no-op — view-chips is
  `display: none` on desktop, so the desktop toolbar is unchanged) and confirm `.toolbar`'s
  desktop `display: flex` still yields one flat row via the nested `display: contents` wrappers.
- [x] Mobile `@media`: make `.main` the scroll container and neutralize the inner list scroller:
  ```css
  .main { display: block; overflow-y: auto; }      /* was flex + overflow:hidden */
  .list-wrap { flex: initial; overflow: visible; }  /* main scrolls now, not list-wrap */
  .toolbar { display: contents; }                   /* dissolve so stickybar/tb-arrange are .main's children */
  .stickybar {
    display: flex; flex-direction: column; gap: 8px;
    position: sticky; top: 0; z-index: 20;
    background: var(--panel); border-bottom: 1px solid var(--line);
  }
  ```
  (`.tb-add` / `.tb-arrange` / `.filterbar` mobile rules from Phases 1–2 stay as-is.)
  *(Note during impl: the Phase-1 `.tb-add,.tb-arrange { flex: 1 0 100% }` stacking hack was
  removed — with `.toolbar { display: contents }` the rows are laid out by `.stickybar` (flex
  column) and `.main` (block), so the hack is obsolete; `.tb-add` gets side padding + bottom
  padding here since the dissolved `.toolbar` no longer supplies it, and `.tb-arrange` becomes a
  padded scroll-away row of its own.)*
- [x] Verify `.view-chips` inside `.stickybar` keeps its own bottom border/appearance without
  double borders; adjust (drop the chip strip's own `border-bottom` on mobile if it doubles with
  `.stickybar`). *(Dropped `.view-chips` `border-bottom` on mobile — the `.stickybar` hairline is
  the single divider under the whole slim bar.)*
- [x] Tighten top density (ask #1) in the mobile `@media` block: reduce `.topbar` padding
  (e.g. `16px` → `10px 16px`), trim `.view-chips` padding (`10px 16px` → `8px 16px`), and reduce
  the sticky bar's internal gaps so the at-top chrome is shorter. Keep ~44px tap targets on
  interactive controls (padding on the controls themselves, per the existing mobile rules).
- [x] Confirm the `#navSheet` bottom sheet, `#drawer`, `#pop`, and `#syncModal` (all
  `position: fixed`) are unaffected by `.main` becoming a scroll container (they escape `.main`).
  *(Verified: all are `position: fixed` and are DOM siblings **outside** `</main>` (`:610+`), so
  they anchor to the viewport, not `.main`.)*
- [x] Keep the two banners reachable: `#importBanner` and `#syncBanner` now scroll with the list
  (they were pinned before). Place them in the scroll flow **directly under the sticky bar**
  (before `.list-wrap`) so a triggered banner sits at the top of the content, and when either
  becomes visible ensure the view is scrolled to the top (they already appear only right after a
  fetch/import, when the user is at the top). Decision: banners scroll away rather than pin —
  pinning the tall conflict banner would defeat the slim-bar goal, and both are momentary CTAs.
  *(Verified: both banners already sit directly after the toolbar/filterbar and before
  `.list-wrap`, so they scroll into view at the top; no markup move was needed.)*

**Automated Verification**:
- [x] `npm run check` passes.

**Manual Verification**:
- [x] Mobile: with enough todos to scroll, scrolling **down** hides the topbar (mode toggle +
  title + ⋯), the Sort/Arrange row, and the "Show only" row, while the slim bar
  {view-chips + quick-add + 🗂} stays pinned at the top with a solid background (cards do not
  bleed through).
- [x] Mobile: scrolling **back to the top** brings the topbar, Sort/Arrange, and filter row back.
- [x] Mobile: the at-top fixed chrome is noticeably shorter than before; the first todo is visible
  sooner.
- [x] Mobile: tapping ⋯ (after scrolling up) still opens the Areas/Data sheet; the mode toggle
  still switches Work/Private; the detail drawer, chip popover, and sync modal still open and are
  not clipped.
- [x] Desktop (>720px): unchanged — sidebar nav, one-row toolbar, list scrolls within
  `.list-wrap`, filter bar wraps.
- [x] Mobile: when a Notes-import review banner or a sync-conflict banner appears, it is visible
  at the top of the content and its buttons are tappable (it scrolls with the list, not pinned).
- [ ] iPhone Safari (owner's device via GitHub Pages once merged): sticky bar pins correctly with
  the dynamic address bar; no zoom-on-focus regression on the quick-add input.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `display: contents` caveat: keep interactive controls (button/input/select) as the *leaf*
  elements — they retain their semantics/accessibility. The dissolved wrappers only ever contain
  layout, never labels or roles.
- Watch the **sticky-parent confinement** rule: `.stickybar` must end up a direct child of the
  mobile scroll container (`.main`) — achieved by `.toolbar { display: contents }` on mobile —
  otherwise it would unstick as soon as the short `.toolbar` scrolls past.

## References

- `todos.html` — single-file app; header markup `:513-560`, mobile `@media` `:441-485`,
  scroll model `.main`/`.list-wrap` `:103` / `:222`.
- `docs/design-system.md` — "Responsive / mobile" section (to be updated in Phase 3).
- `docs/agents/plans/2026-07-24-mobile-responsiveness.md` — the original mobile pass that
  introduced the view-chips strip + ⋯ bottom sheet this plan builds on.
</content>
</invoke>
