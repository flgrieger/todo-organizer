---
date: 2026-07-22T12:01:30+00:00
git_commit: ""
branch: ""
topic: "Project dividers + cross-project attribute filter bar"
tags: [plan, renderList, groupBy, filters, ui]
status: ready
---

# PLAN: Dividers between grouped blocks + cross-project attribute filters

Make the "all projects on one screen" view easy to scan and easy to narrow, without
losing the existing "filter to one project" flow.

Two changes to `todos.html`:
1. A thin **divider line** between grouped blocks in the main list (any grouping).
2. A **filter bar** with four attribute toggles (High priority · Overdue · Quick wins · ★ Focus)
   that narrow the visible todos across every project/group at once.

The owner reaches the combined view exactly as today — toolbar **Group: Project** — now with
dividers between blocks and the filter toggles layered on top.

## Acceptance Criteria

- When grouping is on (Group: Project / Area / Priority), a divider line appears **between**
  each block — never above the first block.
- A filter bar with four toggle chips (High priority, Overdue, Quick wins, ★ Focus) sits just
  under the existing toolbar and is visible in every view.
- Toggling one or more filters narrows the visible todos across all projects/groups at once
  (**AND** logic — each toggle shows *less*). Blocks with no matching todos disappear.
- The main list, the group-head counts, and the "X todos · ~time" sub-line all reflect the
  filtered set. **Sidebar counts stay global** (unaffected), same as Sort/Group today.
- Combined with **Group: Project**, this produces the "all projects on one screen, filtered"
  experience. The same filters also work in other views/groupings.
- A **Clear** control appears only when at least one filter is active; clearing restores the full list.
- When active filters match nothing, a friendly empty message explains why and offers **Clear**.
- **Work/Private separation stays strict** — filters never surface items from the other mode.
- Existing behavior is unchanged: single-project view from the sidebar, Sort, the detail drawer,
  quick-add, Notes import.
- `CLAUDE.md` documents the new `ui.filters` state, the dividers, and the filter behavior.

## Technical Key Decisions and Tradeoffs

1. **Entry point — reuse the Group dropdown (owner's choice).**
   - Why: no new sidebar item; the combined view is already "any view + Group: Project".
   - Impact: no `VIEWS` change; work is concentrated in `renderList` + a new filter bar.

2. **Dividers apply to *all* groupings (project / area / priority), not just project.**
   - Why: all groups share the same `.group-head` render loop; one rule is cleaner and less
     code than special-casing project.
   - Impact: a single separator element inserted before every group except the first.

3. **Filter bar is always visible** (a slim row under the toolbar), working in any view.
   - Why: predictable; nothing appears/disappears with the Group dropdown. Still useful outside
     the combined view.
   - Impact: one new toolbar-style row; easy to later gate on `ui.group === "project"` if desired.

4. **Multiple filters combine with AND** ("narrow down").
   - Why: conventional filter behavior; the common single-toggle case is intuitive, and combining
     (e.g. High + Overdue) shows items that are both.
   - Impact: `passesFilters(t)` = every active filter's test must pass.

5. **Counts follow the filter; sidebar counts stay global.**
   - Why: consistency with how Sort/Group already leave sidebar numbers untouched.
   - Impact: filters are applied inside `renderList` after `currentFilter`, so `subLine`,
     `groupBy`, and group-head counts all see the filtered list. `renderNav` is untouched.

6. **Filter state is transient** — lives in `ui.filters`, resets on reload.
   - Why: consistent with `ui.sort` / `ui.group` (not persisted). A `noFilters()` helper seeds it
     in both `ui` init sites (startup + `importData`) so it is never `undefined`.

7. **Quick-add clears active filters** so a newly added todo is never invisible.
   - Why: a fresh todo (prio 1, no star/due) won't match High/Overdue/Focus; without this the
     owner would "add a todo and watch it vanish" — confusing for a non-dev.
   - Impact: one line in `addTodo`. Easy to remove if the owner prefers filters to persist.

## Current State

`todos.html` is a single self-contained file. Rendering is `render()` → `renderNav()` +
`renderList()` + `save()`.

```
toolbar (todos.html:353-371)
  [ + quick-add …………………… ]  [ Sort ▾ ]  [ Group ▾ ]
list-wrap (todos.html:375, rendered by renderList todos.html:617-646)
  group "none":  flat list of todoCard()s
  group set:     for each group -> .group-head (label + count) then its cards
                 (NO line between groups)
```

Relevant code:
- `renderList()` `todos.html:617-646` — builds the list; grouped branch at `todos.html:636-645`.
- `groupBy(list)` `todos.html:657-678` — buckets todos by project/area/priority.
- `subLine(list)` `todos.html:648-655` — the "X todos · ~time · N quick wins" sub.
- `.group-head` CSS `todos.html:159-164`.
- `ui` init at startup `todos.html:411` and rebuilt in `importData` `todos.html:1093`
  (holds `sort`, `group`, etc. — transient, not saved).
- `currentFilter()` `todos.html:515-522` — view/mode/long-term predicate.
- Attribute helpers already present: `isQuickWin` `todos.html:495`, `daysUntil` `todos.html:471`,
  `t.prio`, `t.star`, `t.due`, `t.done`.
- Empty-state branch `todos.html:624-630`.

## Desired End State

```
toolbar (unchanged)
  [ + quick-add …………………… ]  [ Sort ▾ ]  [ Group ▾ ]
filter bar (NEW)
  Show only:  [▲ High priority] [! Overdue] [⚡ Quick wins] [★ Focus]      Clear
list-wrap  (Group: Project example, one filter active)
  PROJECT ALPHA · 1
    ○ Prepare kickoff slides      [High] [Tomorrow]
  ──────────────────────────────────────────────    ← divider (NEW)
  ADMIN · 1
    ○ Book car service            [High] [3d]
```

- No filter active → identical to today plus the dividers.
- `renderNav` / sidebar untouched. Work/Private toggle and its scoping unchanged.

## Abstractions and Code Reuse

Reuse: the `groups.forEach` render loop, `el()` helper, existing chip/`--line`/`--accent-soft`
design tokens, `isQuickWin`/`daysUntil`, the `.empty` block, and the `render()` fan-out.

New (all in `todos.html`):
- `.group-sep` CSS — the divider element.
- `.filterbar` + `.fb-*` CSS — the filter row, styled like the existing toolbar/chips.
- `FILTERS` config array — `{ key, label, icon, test }` per toggle.
- `noFilters()` — returns a fresh `{high,overdue,quickwin,star}` object.
- `passesFilters(t)` — AND across active filters.
- `renderFilterBar()` — renders the row; wired into `render()`.
- `#filterBar` container element in the markup.

- `todos.html`
  - CSS block — add `.group-sep`, `.filterbar`, `.fb-label`, `.fb-chip`, `.fb-chip.on`,
    `.fb-clear`.
  - markup — add `<div class="filterbar" id="filterBar"></div>` between `.toolbar` and
    `#importBanner`.
  - `render()` — call `renderFilterBar()`.
  - `renderList()` — insert `.group-sep` before each group after the first; apply
    `passesFilters` to `list`; filter-aware empty state.
  - `ui` init (startup + `importData`) — add `filters: noFilters()`.
  - `addTodo()` — reset `ui.filters = noFilters()` before `render()`.
  - new symbols: `FILTERS`, `noFilters`, `passesFilters`, `renderFilterBar`.
- `CLAUDE.md` — document dividers + `ui.filters`.

## Logging & Observability

None. Client-only UI; no logging in this app.

## Implementation

### Phase 1: Dividers between grouped blocks

Dependencies: None.

Put a thin line between grouped sections in the main list, for any grouping.

**Tasks**:
- [x] Add `.group-sep` CSS near `.group-head` (`todos.html:159`):
  ```css
  .group-sep { height: 1px; background: var(--line); margin: 6px 4px 0; }
  ```
- [x] In `renderList()` grouped branch (`todos.html:638-644`), insert a divider before every
  group except the first:
  ```js
  groups.forEach((g, gi) => {
    if (gi > 0) wrap.appendChild(el("div", "group-sep"));
    const h = el("div", "group-head");
    // …unchanged…
  });
  ```
- [x] Eyeball spacing: the divider sits above `.group-head`, whose `padding-top: 20px`
  (`todos.html:162`) gives the gap below the line. Tune the `.group-sep` margins only if the
  line looks cramped or floaty.

**Automated Verification**:
- [x] `grep -q 'group-sep' todos.html` (divider CSS + element present)

**Manual Verification**:
- [ ] Open `todos.html`. Set **Group: Project** — a line appears between each project block, and
  **no** line above the first block.
- [ ] Switch **Group: Area** and **Group: Priority** — dividers appear there too.
- [ ] Switch **Group: None** — flat list, no dividers (unchanged).

### Phase 2: Cross-project attribute filter bar

Dependencies: Phase 1 (shares `renderList`; keep edits coherent).

Add the four toggle chips, AND filtering across the whole list, filtered counts, Clear, and a
filter-aware empty state. Update docs.

**Tasks**:
- [x] Add filter-bar CSS after the notes-banner block (near `todos.html:157`):
  ```css
  .filterbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    padding:10px 28px; border-bottom:1px solid var(--line); background:var(--panel); }
  .fb-label { font-size:11px; text-transform:uppercase; letter-spacing:.06em;
    color:var(--ink-faint); font-weight:600; margin-right:2px; }
  .fb-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line-strong);
    background:var(--panel); color:var(--ink-soft); border-radius:999px; padding:6px 12px;
    font-size:13px; font-weight:500; }
  .fb-chip:hover { border-color:var(--forest); color:var(--forest); }
  .fb-chip.on { background:var(--accent-soft); border-color:var(--accent); color:var(--forest); font-weight:600; }
  .fb-chip .fb-ic { font-size:12px; }
  .fb-clear { border:none; background:none; color:var(--ink-faint); font-size:13px;
    padding:6px 8px; margin-left:auto; border-radius:8px; }
  .fb-clear:hover { color:var(--red); background:#fdeceb; }
  ```
- [x] Add the container in markup between `.toolbar` (`todos.html:371`) and
  `#importBanner` (`todos.html:373`):
  ```html
  <div class="filterbar" id="filterBar"></div>
  ```
- [x] Add `FILTERS` config + `noFilters()` + `passesFilters()` near the view/filter helpers
  (around `todos.html:513`):
  ```js
  const FILTERS = [
    { key: "high",     label: "High priority", icon: "▲", test: t => t.prio === 3 },
    { key: "overdue",  label: "Overdue",       icon: "!", test: t => !t.done && t.due && daysUntil(t.due) < 0 },
    { key: "quickwin", label: "Quick wins",    icon: "⚡", test: t => isQuickWin(t) },
    { key: "star",     label: "Focus",         icon: "★", test: t => t.star },
  ];
  function noFilters() { return { high:false, overdue:false, quickwin:false, star:false }; }
  function passesFilters(t) { return FILTERS.every(f => !ui.filters[f.key] || f.test(t)); }
  ```
- [x] Seed `ui.filters` in both init sites so it is never `undefined`:
  - startup `ui` (`todos.html:411`): add `filters: noFilters()`.
  - `importData` `ui` rebuild (`todos.html:1093`): add `filters: noFilters()`.
- [x] Add `renderFilterBar()` and call it from `render()` (`todos.html:556-560`):
  ```js
  function render() { renderNav(); renderFilterBar(); renderList(); save(); }

  function renderFilterBar() {
    const bar = $("#filterBar"); bar.innerHTML = "";
    bar.appendChild(el("span", "fb-label", "Show only"));
    FILTERS.forEach(f => {
      const b = el("button", "fb-chip" + (ui.filters[f.key] ? " on" : ""));
      b.innerHTML = `<span class="fb-ic">${f.icon}</span> ${escapeHtml(f.label)}`;
      b.onclick = () => { ui.filters[f.key] = !ui.filters[f.key]; render(); };
      bar.appendChild(b);
    });
    if (FILTERS.some(f => ui.filters[f.key])) {
      const clr = el("button", "fb-clear", "Clear");
      clr.onclick = () => { ui.filters = noFilters(); render(); };
      bar.appendChild(clr);
    }
  }
  ```
- [x] Apply filters in `renderList()` right after the base filter (`todos.html:621`):
  ```js
  let list = state.todos.filter(currentFilter()).filter(passesFilters);
  ```
  (This makes `subLine`, `groupBy`, and group-head counts all reflect the filtered set.)
- [x] Make the empty state filter-aware (`todos.html:624-630`):
  ```js
  if (!list.length) {
    const e = el("div", "empty");
    if (FILTERS.some(f => ui.filters[f.key])) {
      e.innerHTML = `<div class="big">🔍</div><div>No todos match the active filters.</div>`;
      const clr = el("button", "btn", "Clear filters"); clr.style.marginTop = "12px";
      clr.onclick = () => { ui.filters = noFilters(); render(); };
      e.appendChild(clr);
    } else {
      e.innerHTML = `<div class="big">✳</div><div>Nothing here yet.</div>
        <div style="font-size:12.5px;margin-top:6px">Add a todo above to get started.</div>`;
    }
    wrap.appendChild(e);
    return;
  }
  ```
- [x] In `addTodo()` (`todos.html:883-892`), reset filters so the new item is visible:
  add `ui.filters = noFilters();` just before `render();`.
- [x] Update `CLAUDE.md`: note that grouped views show a divider between blocks, and add
  `ui.filters` to the `ui` transient-state description — four attribute toggles
  (High priority / Overdue / Quick wins / Focus), combined with AND, transient (reset on
  reload), affecting the main list + its counts but **not** the sidebar counts, and cleared on
  quick-add.

**Automated Verification**:
- [x] `grep -q 'renderFilterBar' todos.html`
- [x] `grep -q 'passesFilters' todos.html`
- [x] `grep -q 'noFilters' todos.html`
- [x] `grep -q "id=\"filterBar\"" todos.html`
- [x] `grep -q 'ui.filters' CLAUDE.md`

**Manual Verification**:
- [ ] Open `todos.html`. The filter bar shows under the toolbar with four chips and **no** Clear.
- [ ] Toggle **Overdue** — only overdue todos remain across all projects; the sub-line count and
  (with Group: Project) the per-project counts drop accordingly; **Clear** appears.
- [ ] Add **High priority** on top — list narrows to items that are both High *and* overdue (AND).
- [ ] **Clear** — all chips reset and the full list returns.
- [ ] With **Group: Project** + a filter active, project blocks with no matches disappear and
  dividers still sit correctly between the remaining blocks.
- [ ] Toggle every filter so nothing matches — the "No todos match the active filters" message
  shows with a working **Clear filters** button.
- [ ] Switch **Work ↔ Private** while a filter is on — only current-mode items appear; no items
  from the other mode leak in.
- [ ] With a filter active, quick-add a new todo — filters clear and the new todo is visible.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Implemented after the task-groups plan (2026-07-22), so line numbers had shifted and
  `renderList()` had already been reworked for group clusters. Reconciled both:
  - **Filter application:** `state.todos.filter(currentFilter()).filter(passesFilters)` — one
    line, so clusters, group-head counts, and the sub-line all see the filtered set.
  - **Dividers** apply to the group-by branch (`groupBy`) only; the clustered browse layout
    already separates groups with the `.group-cluster` panel spacing, so no divider there.
  - **Empty clusters under filters:** task-groups shows empty/just-created group clusters in
    browse view, but a filter means "narrow down" — so `relGroups` is suppressed when
    `anyFilterActive()`, and groups with no matching task disappear like any other block.
  - Added an `anyFilterActive()` helper (used by the empty-state, the Clear control, and the
    empty-cluster suppression) beyond the plan's `noFilters`/`passesFilters`.
- **No JS runtime in the dev environment** (`node` absent): all `grep` gates pass and a
  custom bracket-balance pass over the `<script>` block reports BALANCED. The browser-console
  and Manual Verification steps still need the owner to open `todos.html`.

## References

- Original request: "show all projects below each other with a divider in between … then I
  should also be able to filter across all of them" (attribute filters chosen).
- `todos.html` — `renderList` (`:617`), `groupBy` (`:657`), `subLine` (`:648`),
  `currentFilter` (`:515`), `ui` init (`:411`, `:1093`), `addTodo` (`:883`).
- `CLAUDE.md` — Architecture notes (state / rendering).
