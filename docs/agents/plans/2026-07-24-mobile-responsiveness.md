---
date: 2026-07-24T16:16:14+00:00
git_commit: 96fd0268772af2a9b5ddedee5cb21aa120a861df
branch: main
topic: "Mobile responsiveness for the phone"
tags: [plan, todos-html, responsive, mobile, navigation, design-system]
status: in-progress
---

> **Progress (2026-07-25):** All three phases implemented on branch `feat/mobile-responsiveness`.
> Code + docs done; the agent sandbox has **no Node**, so `npm run check` runs in CI / on the
> owner's Mac (logic.js untouched → gate unaffected). `git grep` automated checks pass; a
> regex-aware bracket-balance pass over the inline script is clean. **Manual verification (on the
> iPhone / at a 390px viewport) is still pending the owner** — see the unchecked boxes below.

# PLAN: Make todos.html usable on a phone

The app is now openable on the owner's iPhone (via the manual iCloud/AirDrop sync path), but the
layout is desktop-only. The single existing responsive rule simply **hides the entire sidebar** on
narrow screens, which removes all navigation, area/project management, and backup actions. This plan
makes the app fully usable — and fully at parity with the desktop — on a phone, without adding a
build step, framework, or dependency.

## Acceptance Criteria

- On a phone-width screen, **all navigation is reachable**:
  - every View (All active, Focus Today, Quick Wins, Upcoming, Overdue, Long-term, Completed) via a
    horizontal **Views chip strip** under the title;
  - every Area and Project via a **"⋯" bottom sheet**;
  - all Data actions — Check Notes, Export backup, Import backup — plus the "last changed" line, in
    that same bottom sheet.
- Areas & projects can be **renamed, moved between Work↔Private, and deleted by touch**, via a **⋮
  row menu present on both mobile and desktop**. The hidden right-click rename and the hover-only
  "⇄" move control are removed.
- The toolbar (quick-add, Sort, Arrange by, New set) **no longer overflows** on a narrow screen.
- Primary tap targets (view chips, checkbox, card chips, nav rows, ⋮ menus, toolbar controls) are
  **comfortably tappable (~44px min)** on mobile.
- Focusing a text/number/date input on iOS **does not trigger auto-zoom** (inputs render ≥16px on
  mobile).
- The app shell and the detail drawer **fill the screen correctly under mobile browser chrome**
  (dynamic viewport height) — no content cut off behind the address/tab bars.
- `npm run check` stays green. Desktop layout and behavior are unchanged **except** the intended ⋮
  menu replacing right-click rename and the hover "⇄".

## Technical Key Decisions and Tradeoffs

1. **Mobile navigation = top Views chip strip + "⋯" bottom sheet (Areas + Data).**
   - Why: chosen by the owner — compact, preserves vertical space for the todo list.
   - Impact: `renderNav()` is refactored into per-section renderers (`renderViews`, `renderAreas`,
     `renderData`) that populate **both** the existing desktop sidebar containers **and** new
     mobile containers in one render pass, so the two never drift out of sync.

2. **Full desktop parity on touch.**
   - Why: chosen by the owner — the phone should do everything the Mac can.
   - Impact: every mouse-only affordance needs a visible touch equivalent (rename, move, delete).

3. **⋮ row menu, everywhere (mobile + desktop).**
   - Why: chosen by the owner — one consistent interaction model rather than two.
   - Impact: each area/project row gains a visible ⋮ button that opens a small action menu
     (Rename / Move to the other mode / Delete). The `oncontextmenu` right-click handlers
     (`todos.html:673`, `:683`) and the hover-reveal `.area-move` CSS + markup (`todos.html:88-94`,
     `:667-670`) are removed. The menu **reuses the existing `#pop` popover** (`openPop()`,
     `todos.html:1006`), so no new positioning/overlay machinery is introduced.

4. **Bottom-sheet form for the "⋯" menu.**
   - Why: chosen by the owner — thumb-friendly reach on tall phones.
   - Impact: a new `#navSheet` element + reuse of the existing scrim pattern (`.scrim`,
     `todos.html:294`). A second scrim instance is added so the sheet and the detail drawer can be
     dismissed independently.

5. **Keep native `prompt()` / `confirm()` dialogs** for rename/delete/move confirmations.
   - Why: zero-risk, already work on mobile Safari, and keep the file dependency-free. The existing
     `renameArea`, `renameProject`, `moveAreaScope` functions are reused as-is — only their
     *triggers* change.
   - Impact: none to those functions.

6. **Breakpoint stays at `max-width: 720px`** (the existing threshold, `todos.html:347`).
   - Why: avoids introducing a second breakpoint; 720px cleanly separates phone/small-tablet from
     desktop.
   - Impact: all mobile CSS lives under this one media query (plus the ergonomics tweaks).

## Current State

Fixed two-column CSS grid. The only width-based responsive rule (`todos.html:347-350`) collapses to
one column and **hides the whole sidebar**:

```css
@media (max-width: 720px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}
```

```
DESKTOP (>720px)                        PHONE TODAY (<720px)
┌──────────┬────────────────────┐       ┌────────────────────┐
│ SIDEBAR  │ topbar (mode+title)│       │ topbar (mode+title)│
│  Views   │ toolbar            │       │ toolbar  ⟵ overflow│
│  Areas   │ filter bar         │       │ filter bar         │
│  Data    │ ┌────────────────┐ │       │ ┌────────────────┐ │
│ (export) │ │  todo list     │ │       │ │  todo list     │ │
└──────────┴────────────────────┘       └────────────────────┘
                                          NAV / AREAS / EXPORT GONE
```

Relevant structure:
- Nav is rendered by `renderNav()` (`todos.html:639-692`) into three sidebar regions: `#viewNav`
  (views), `#areaNav` (areas + projects + "Add project"/"Add area"), and a static Data block
  (`#checkNotesBtn`, `#exportBtn`, `#importBtn`, `#lastChanged` — markup at `todos.html:371-378`).
- Area rows carry a hover-only move control (`.area-move`, `todos.html:88-94`, built at `:667-670`)
  and a right-click rename (`oncontextmenu`, `:673`). Project rows: right-click rename (`:683`).
- The toolbar (`todos.html:396-415`) is a single non-wrapping flex row.
- The detail drawer (`.drawer`, `:296-303`) and app shell (`.app`, `:51`) use `100vh`.
- Base font 14px set globally at `:47`; the quick-add input sets 14px explicitly (`:135`) and
  `.field` / `.pop` inputs (`:311`, `:256`) inherit that 14px → iOS auto-zooms any of them on focus.
- The Data block is **static markup** (`#checkNotesBtn`/`#exportBtn`/`#importBtn`/`#importFile`/
  `#lastChanged`, `:371-378`) wired **once by unique ID** at `:1609-1613`; `updateFreshness()`
  (`:618-621`) writes only the single `#lastChanged`.

## Desired End State

```
PHONE (<720px)                          DESKTOP (>720px) — mostly unchanged
┌────────────────────────┐              ┌──────────┬────────────────────┐
│ 💼|🏠   All active   ⋯ │              │ SIDEBAR  │ topbar             │
├────────────────────────┤              │  Views   │ toolbar            │
│ ◎All ★Focus ⚡Quick ▤… │← scroll      │  Areas ⋮ │ filter bar         │
├────────────────────────┤              │  Data    │ ┌────────────────┐ │
│ quick-add … + New set  │← wraps       │ (export) │ │  todo list     │ │
│ filter bar             │              └──────────┴────────────────────┘
│ ┌────────────────────┐ │              (sidebar area rows now show a
│ │  todo list         │ │               visible ⋮ menu instead of
│ └────────────────────┘ │               hover-⇄ / right-click)
└────────────────────────┘
   tap ⋯ → bottom sheet: Areas (each with ⋮) + Data actions
```

## Abstractions and Code Reuse

- **Reuse** the existing `#pop` popover (`openPop()` / `closePop()`) for the ⋮ area/project action
  menu — same positioning + outside-click-close logic.
- **Reuse** the `.scrim` + slide-in transform pattern (as used by `.drawer`) for the new bottom
  sheet.
- **Reuse** `renameArea`, `renameProject`, `moveAreaScope`, `addProject`, `addArea`, `exportData`,
  `importData`, `checkNotes` unchanged — only their triggers/containers move.
- **New**: split `renderNav()` into `renderViews(targets)`, `renderAreas(targets)`,
  `renderData(targets)` so the same DOM-building runs into the sidebar AND the mobile chip strip /
  sheet in a single `render()` pass.

- `todos.html`
  - CSS `<style>` block — new mobile media-query rules; ⋮ menu + chip-strip + bottom-sheet styles;
    ergonomics (tap targets, `100dvh`, 16px inputs, toolbar wrap). Remove `.area-move` hover CSS.
  - Markup — add `#viewChips` strip + `#navToggle` (⋯) in/near the topbar; add `#navSheet` bottom
    sheet + its scrim; remove the hover `.area-move` span.
    - `renderNav` → `renderViews` / `renderAreas` / `renderData` — split, render to multiple targets
    - area/project rows — add ⋮ button; remove `oncontextmenu` + hover ⇄
    - `openNavSheet` / `closeNavSheet` — new sheet controllers
    - `areaMenu(area)` / `projectMenu(project)` — new ⋮ action menus via `openPop`
- `docs/design-system.md` — add a "Responsive / mobile" section (breakpoint, chip strip, bottom
  sheet, ⋮ menu, tap-target + input-size rules).
- `CLAUDE.md` — note the responsive layout and that area/project management is now a visible ⋮ menu
  (right-click/hover removed).
- `NOTES.md` — add a short plain-language "Using it on your phone" note.

## Logging & Observability

None. This is a client-only UI change with no logging surface. `console.debug` in `checkNotes()`
stays as-is.

## Implementation

### Phase 1: Mobile navigation shell

Dependencies: None.

Give a phone access to every View, Area/Project, and Data action. Stop hiding the sidebar's content;
instead surface Views as a top chip strip and Areas + Data in a "⋯" bottom sheet. Desktop keeps its
sidebar.

**Tasks**:
- [x] Refactor `renderNav()` (`todos.html:639-692`) into three helpers that each accept one or more
      target containers and render identical DOM into each:
  - `renderViews(...containers)` — the VIEWS buttons (also used as the mobile chip strip content).
  - `renderAreas(...containers)` — areas + projects + "Add project", and an **"Add area"** trigger
    per container so the mobile sheet has its own (the desktop `#addAreaBtn` at `:366` stays for the
    sidebar). This keeps full parity (add-area was otherwise desktop-only).
  - `renderData(...containers)` — Check Notes / Export / Import / last-changed. **Critical:** because
    the current Data block is wired once by unique ID (`:1609-1613`) and `$()` only matches the first
    element, `renderData` must **build its buttons and attach their handlers per instance** (calling
    `checkNotes` / `exportData` / a per-instance file `<input>` for import, and `addArea`), using
    classes not IDs — do **not** duplicate the `#importFile`/`#exportBtn` IDs into the sheet (that
    breaks `$("#importFile").click()` at `:1612` and creates duplicate IDs). Retire the one-time
    wiring at `:1609-1613` in favor of handlers attached during render.
  - Keep a thin `renderNav()` that calls all three with the desktop sidebar containers **and** the
    new mobile containers, and still sets `document.body.dataset.mode` + the mode-toggle active
    state (`todos.html:640-642`).
- [x] Update `updateFreshness()` (`:618-621`) to write the "last changed" text into **every**
      `.last-changed` element (sidebar + sheet), not just the first `#lastChanged` — e.g. switch to a
      class selector and `querySelectorAll`.
- [x] Add mobile markup: a `#viewChips` strip and a `#navToggle` ("⋯") button. Place the chip strip
      directly under the topbar title and the ⋯ button at the right of the topbar (`.spacer` already
      exists at `todos.html:393`). Both are hidden on desktop via CSS.
- [x] Add a `#navSheet` bottom-sheet element (grab handle, "Areas" section = `#areaNavSheet`, "Data"
      section = `#dataNavSheet`) plus a dedicated scrim `#navScrim`. Model the slide-up transform +
      scrim on the existing `.drawer` / `.scrim` (`todos.html:294-303`).
- [x] Add `openNavSheet()` / `closeNavSheet()` and wire `#navToggle`, `#navScrim`, and the Escape
      handler (extend `todos.html:1624`). Tapping any item inside the sheet that changes the view
      (a view chip is in the top strip, but selecting an area/project or a Data action) closes the
      sheet.
- [x] Add CSS under `@media (max-width: 720px)`:
  - keep `.app { grid-template-columns: 1fr; }` and `.sidebar { display: none; }` (sidebar stays the
    desktop-only source; mobile uses the strip + sheet);
  - show `#viewChips` (horizontal scroll, `overflow-x:auto`, no wrap) and `#navToggle`;
  - style `.view-chip` as pill buttons with counts, active state = accent-soft (mirror `.fb-chip`).
  - Desktop (>720px): `#viewChips`, `#navToggle`, `#navSheet`, `#navScrim` are `display:none`.
- [x] Update `NOTES.md` with a short "Using it on your phone" paragraph (tap the Views chips to
      switch view; tap ⋯ for areas + backup).

**Automated Verification**:
- [ ] `npm run check` passes (lint + typecheck + `node --test`).
- [x] `git grep -n "renderNav" todos.html` shows the split helpers are all invoked in the render
      path.

**Manual Verification**:
- [ ] At a phone-sized viewport (e.g. 390px wide) in the browser: the Views chip strip appears, is
      horizontally scrollable, and switching a chip changes the list; the sidebar is not visible.
- [ ] Tapping ⋯ opens the bottom sheet; Areas/Projects switch the view; Check Notes / Export /
      Import all work; the "last changed" line shows; the sheet closes on selection, on the scrim,
      and on the ⋯/Escape.
- [ ] At desktop width the layout and sidebar are visually unchanged.

### Phase 2: Area & project management parity (⋮ menu everywhere)

Dependencies: Phase 1.

Replace the mouse-only management affordances with a single visible ⋮ row menu used on both mobile
and desktop, giving the phone full parity.

**Tasks**:
- [x] In `renderAreas(...)`, add a ⋮ button to each **area** row that calls `areaMenu(area)`; remove
      the hover `.area-move` "⇄" span (`todos.html:667-670`) and the `oncontextmenu` rename
      (`:673`).
- [x] Add a ⋮ button to each **project** row; remove its `oncontextmenu` rename (`todos.html:683`).
- [x] Implement `areaMenu(area)` using `openPop(anchor, build)`:
  - **Rename** → `renameArea(area)`
  - **Move to Work/Private** (label reflects the target, as `moveAreaScope` already computes) →
    `moveAreaScope(area)`
  - **Delete** → reuse the delete path (invoke `renameArea` which deletes on empty, or factor a small
    `deleteArea(area)` from the existing confirm+delete block at `todos.html:1169-1175` — keep the
    same confirm text). Prefer factoring `deleteArea` so the menu has an explicit Delete item.
- [x] Implement `projectMenu(project)` similarly: **Rename** → `renameProject(project)`; **Delete** →
      factor `deleteProject(project)` from `todos.html:1187-1191`. (Projects have no Work/Private
      move — they follow their area.)
- [x] Remove the now-unused `.area-move` CSS block (`todos.html:88-94`). Add `.row-menu` (the ⋮
      button) styling: faint by default, full-strength on hover/focus, always visible and ≥40px hit
      area on mobile.
- [x] Update `CLAUDE.md` (Editing / Architecture area) and `docs/design-system.md` to state that
      area/project management is a visible ⋮ menu on every row (right-click and hover-⇄ removed).

**Automated Verification**:
- [ ] `npm run check` passes.
- [x] `git grep -n "oncontextmenu\|area-move" todos.html` returns nothing (both mouse-only
      affordances are gone).

**Manual Verification**:
- [ ] Desktop: each area/project row shows a ⋮; it opens Rename / Move / Delete; each action behaves
      exactly as the old right-click/hover did.
- [ ] Phone (in the ⋯ bottom sheet): the same ⋮ menu is tappable; rename, move Work↔Private, and
      delete all complete via the native dialogs.

### Phase 3: Touch ergonomics & polish

Dependencies: Phase 1 (Phase 2 independent but land after for a clean diff).

Make the whole surface comfortable one-handed and correct under mobile browser chrome.

**Tasks**:
- [x] Toolbar (`todos.html:125-128`, `396-415`): allow `flex-wrap: wrap` under the mobile
      breakpoint so quick-add takes the first line and Sort / Arrange / New set wrap beneath; ensure
      the quick-add stays full-width.
- [x] Tap targets under `@media (max-width: 720px)`: bump the checkbox (`.check`, `:194`), card chips
      (`.chip`, `:207`), nav/sheet rows, ⋮ buttons, and toolbar controls so their interactive hit
      area is ~44px (increase padding/min-height; keep visual size restrained where needed via
      padding rather than font bloat).
- [x] iOS zoom: set form inputs to `font-size: 16px` on mobile — quick-add input (`:135`), `.pop`
      inputs (`:256`), and `.field` inputs (`:311`). Scope to the media query so desktop density is
      unchanged.
- [x] Replace `100vh` with `100dvh` (with a `100vh` fallback line before it) on `.app`
      (`todos.html:51`) and `.drawer` (`:297`) so mobile browser chrome doesn't cut off content.
- [x] Detail drawer on mobile: make it effectively full-width (e.g. `width: 100%` / keep
      `max-width: 92vw` behavior sensible) and confirm the drawer foot buttons remain reachable.
- [x] Verify the inline chip popover (`openPop`, `todos.html:1006-1027`) still positions on-screen at
      phone width (it already clamps to the viewport) — adjust `max-width`/`min-width` (`:243`) only
      if it overflows.
- [x] Finalize the "Responsive / mobile" section in `docs/design-system.md` (breakpoint = 720px,
      chip strip, bottom sheet, ⋮ menu, 44px tap targets, 16px mobile inputs, `dvh`).

**Automated Verification**:
- [ ] `npm run check` passes.
- [x] `git grep -n "100dvh" todos.html` shows the app shell and drawer both updated.

**Manual Verification**:
- [ ] At 390px width: the toolbar wraps without overflow; chips, checkbox, and ⋮ menus are easy to
      tap; opening a text/number/date input does not zoom the page (test on the actual iPhone).
- [ ] On the iPhone, scrolling to the bottom of a long list and opening the drawer shows all content
      and buttons with no cut-off behind the Safari chrome.
- [ ] Full end-to-end on the iPhone: switch views + areas, quick-add, edit chips, check off, rename
      an area, move an area Work↔Private, export a backup — all succeed.

## Implementation Notes

- **`npm run check` gives no coverage of this work.** ESLint (`eslint.config.js`) lints only
  `logic.js` / `logic.test.js`, and tsc / `node --test` never touch `todos.html`'s inline script.
  The gate must stay green (logic.js is untouched), but it is **not** evidence the mobile UI works —
  the Manual Verification steps are the real acceptance check, ideally on the actual iPhone.

During implementation, document user feedback, problems, and decisions here.

## References

- `todos.html` — the entire app (single file).
- `docs/design-system.md` — visual tokens (source of truth = `:root` in `todos.html`).
- `docs/agents/research/2026-07-22-phone-access-and-sync.md` — how the app reached the phone (manual
  iCloud/AirDrop sync).
- `docs/agents/plans/2026-07-22-path-a-manual-sync.md` — the sync path that made phone use possible.
- `CLAUDE.md` — project constraints (single dependency-free file; strict Work/Private separation).
