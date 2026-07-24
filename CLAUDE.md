# CLAUDE.md

Guidance for working in this project.

## What this is

A **personal todo-organization web app** for the owner (a non-developer). The whole app is a single self-contained file — **`todos.html`** — built with vanilla HTML, CSS, and JavaScript. No build step, no server, no dependencies, no accounts.

To use it: open `todos.html` in a browser (double-click). To develop it: edit the file and refresh the browser.

## Core concept

The primary axis is a **Work / Private mode** — a big toggle at the top of the main page. Switching mode re-scopes the *entire* app (sidebar, view counts, list, quick-add) and re-tints the accent color (blue = Work, purple = Private). The owner never wants work items visible in private mode or vice versa — keep this separation strict unless they ask otherwise.

Hierarchy: **mode → area → project → [group] → todo**.
- Each **area** has a `scope` of `"work"` or `"private"`.
- Each **todo** has: title, area, optional project, priority (1 Low / 2 Med / 3 High), deadline, time estimate (minutes), notes, `star` (Focus Today flag), `longterm` (someday flag), and a nullable `groupId`.
- A **set** (called a *group* in code — `state.groups`, `todo.groupId`; shape `{ id, name, prio, areaId, projectId|null, due, createdAt }`) is a lightweight named bundle of real todos — e.g. "Change tires" containing "Make appointment", "Bring the car", "Fetch the car". **User-facing this is always "Set" (🗂); the code identifiers stay `group`/`groupId` to avoid a risky localStorage migration.** A set carries its own priority + optional deadline but **no time estimate**; each member todo keeps its own deadline/priority/estimate and stays individually eligible for Quick Wins, Focus Today, Overdue, etc. Sets are **not** sidebar citizens — they render as clusters in the list. **Invariant:** tasks inherit the set's `areaId`/`projectId`, so a set is wholly Work or wholly Private; moving a set re-homes every task, deleting a set deletes its tasks. (This replaces the old flat `subtasks` checklist; existing subtasks are migrated losslessly — see Architecture notes.)
- **Rendering rule:** in **browse views** (All active, an area/project) a set's tasks always bundle under a clickable **cluster header** (name, priority, optional deadline, `n/total` progress) **regardless of the Arrange-by setting** — the set is treated as one unit that carries its own priority/area/project, so it slots into whichever arrangement is chosen and stays clustered (under Arrange-by = Priority a set sits in the block of *its own* priority, not its members'). The location chip is hidden on clustered tasks. In **time-views** (Focus Today, Quick Wins, Upcoming, Overdue), **Completed**, and **Long-term**, a set's tasks appear as standalone cards tagged `🗂 <set name>` — so a single member can surface on its own (e.g. as a Quick Win). Browse-view unit assembly + arranging lives in `buildUnits()` / `renderUnit()` / `groupByUnits()`; ordering in `orderUnits()`.
- **Quick Win** = active todo that is ≥ Medium priority AND ≤ 30 minutes.
- **Long-term** = a todo that is manually flagged (`longterm: true`) OR has a deadline `LONGTERM_DAYS` (60) or more days out — see `isLongTerm()`. Long-term todos are hidden from the time-focused views (the `HIDE_LT` set) but stay visible when browsing their area/project, and collect in their own "Long-term" view.

Views: All active, Focus Today (starred or due ≤ today), Quick Wins, Upcoming (7d), Overdue, Long-term, Completed. Plus Smart sort and an **Arrange by** control (the `#groupSel` dropdown / `ui.group`, values none / project / area / priority — labelled "Arrange by:" in the UI to avoid colliding with the 🗂 *Set* concept). **Arrange-by defaults to Project** on load (the toolbar dropdowns are synced to `ui` at startup). When arranging by project/area/priority, a thin **divider** (`.group-sep`) sits between each block (never above the first).

A **filter bar** (`#filterBar`, `renderFilterBar()`) sits under the toolbar in every view with four attribute toggles — **High priority · Overdue · Quick wins · ★ Focus** (`FILTERS`). Toggling them narrows the visible todos across all projects/groups at once with **AND** logic (`passesFilters()`); a **Clear** control shows only while a filter is active. Filters reflect in the main list, its sub-line, and arrange-block counts, but **not** the sidebar counts (which stay global, like Sort/Arrange-by). Filter state is transient (`ui.filters`, seeded by `noFilters()`, reset on reload) and is cleared on quick-add so a fresh todo never vanishes.

## Editing todos

Two ways to edit, both re-render via `render()`:
- **Inline chips** (primary, quick): the chips on each card are interactive. Clicking a chip opens a small popover (single reusable `#pop` element, positioned by `openPop()`) to edit priority, deadline (incl. the long-term toggle), or time estimate; the location chip opens an area/project picker. Empty attributes show faint dashed "add" chips. Editors live in the *Inline chip editors* section; each applies via `applyEdit()` (mutate → `closePop()` → `render()`). Chip clicks `stopPropagation` so they don't open the drawer.
- **Detail drawer** (fuller editing): the single shared `#drawer` shell is dispatched by `renderDrawer()` to either a **todo drawer** (`renderTodoDrawer()` — title, notes, area/project, a **Set** picker, and every attribute incl. the long-term toggle) or a **set drawer** (`renderGroupDrawer()` — name, priority, deadline, area/project move, the member-task list, and **Delete set**). Clicking a cluster header opens the set drawer; a task row's `→` opens that task's todo drawer. `ui.openId` / `ui.openGroupId` track which is open.
- **Set authoring:** a **🗂 New set** toolbar button (`newGroup()`) creates a set in the current area/project context and opens its drawer. The todo drawer's Set picker (`assignTodoToGroup()`) moves a todo into/out of a set (snapping its area/project to the set's), with a `+ New set…` sentinel.
- The **location chip** (area › project) is deliberately styled apart from the attribute chips (due / priority / estimate) — project is treated as a *different level* (where a todo lives) than its scheduling attributes.

## Architecture notes

- **State** lives in one `state` object `{ mode, updatedAt, areas, projects, groups, todos, importedKeys }`, persisted to `localStorage` under key `todo_overview_v1`. `updatedAt` is a ms-epoch **"last real change" stamp** used by the manual iPhone↔Mac sync guard: `save()` bumps it **only when a content signature of the real data (`areas`/`projects`/`groups`/`todos`/`importedKeys`) changes** — never on merely opening the app, switching mode, or changing sort/filter/view — and `migrate()` defaults a missing stamp to `0` (= unknown) so stamp-less old backups are still flagged on import. On import, the file's raw `updatedAt` is read *before* `migrate()` and compared to the current data to warn (but not block) when restoring an older backup. `ui` holds transient view state (current mode, selected view/area, sort, group, `openId`, `openGroupId`, and `filters` — the four attribute toggles, transient/not persisted).
- **`migrate(state)`** upgrades older saved data (e.g. adds missing `scope`/`mode`, defaults `longterm: false`, defaults `importedKeys: []`, defaults `groups: []` + a nullable `groupId` on every todo). It also runs a **one-time lossless subtask→group conversion**: each todo that still has non-empty `subtasks` becomes a group named after the todo, the todo joins as the group's first task, each subtask becomes its own task (title + `done` preserved), and the `subtasks` field is deleted. Run `migrate()` on any data loaded from storage or imported files (it's idempotent). Bump the storage key and extend `migrate()` if the shape changes incompatibly.
- **Rendering** is plain functions: `render()` → `renderNav()` + `renderList()` + `save()`. There is no framework; re-render by calling `render()` after mutating `state`.
- **Export / Import** (JSON) is the backup mechanism and the intended migration path to a future synced version.
- **Dev safety net (Tier 1):** the pure business rules live in `logic.js` (a classic `<script src>` the browser loads *before* the inline script, so they're plain globals exactly as before; also `require`-able in Node via a `module.exports` guard at the bottom). Exported rules: `noFilters, uid, todayISO, daysUntil, fmtDue, fmtEst, isQuickWin, LONGTERM_DAYS, isLongTerm, FILTERS, passesFilters, smartScore, groupScore, sortTodos, migrate`. Three were made **pure** so they take an explicit arg instead of reading `ui`/`state`: `passesFilters(t, filters)`, `sortTodos(list, sortMode)`, `groupScore(g, tasks)` — `todos.html` passes `ui.filters` / `ui.sort` / `groupTasks(id)` at the call site. `npm run check` runs ESLint + `tsc --noEmit` (JSDoc check-JS, **no build**) + `node --test` (`logic.test.js`) as one green gate — run it before declaring a change done. The toolbox (`package.json`, `tsconfig.json`, `eslint.config.js`, `node_modules/`) is **dev-only**; the app itself still opens by double-clicking `todos.html` with zero dependencies. Render/UI JS and CSS are **not** yet extracted (Tiers 2 & 3, deferred).

## Apple Notes import (optional)

- A separate, optional helper (`notes-helper/notes_helper.py`, Python 3 stdlib only) runs on the owner's Mac, reads a chosen Apple Notes folder **read-only**, and serves `TODO:` lines as JSON at `http://localhost:8787/todos`. See `notes-helper/README.md`.
- The helper ships with a **browser control panel** (not a native window). Double-clicking `Start Notes Helper.command` runs `python3 notes_helper.py`, which serves an HTML panel at `/` (`PANEL_HTML` / `control_panel_html()`) and auto-opens it in the default browser (`webbrowser.open`, skip with `--no-open`). The panel edits the folder + demo flag via `POST /config` and stops the server via `POST /quit`; `/todos` still serves the JSON. **Why browser, not tkinter:** a tkinter desktop window was tried first (2026-07-22) but rendered blank on the owner's Mac (Apple's deprecated Tk); the browser panel sidesteps Tk entirely and needs no install. Keep the helper stdlib-only.
- The app fetches it on open and via a **Check Notes** sidebar button (`checkNotes()`), dedups against `state.importedKeys` (a set of `noteId + " " + text` fingerprints), and shows a review banner. The banner offers **💼 Add to Work** (default/primary) and **🏠 Add to Private**; `importTodos(items, scope)` creates the todos in that scope's auto-created **Inbox** area (`ensureInboxArea(scope)`) and lands the view there. One-way (Notes → app); imported todos carry a `source: { noteId, text }` field.
- **The owner captures both work and private todos in Notes,** so the destination is a per-batch choice (Work is the default). The split is never crossed silently — nothing imports until the owner picks a side.
- **The helper is fully optional:** if it isn't running, the fetch fails silently and the app behaves exactly as before. Keep the app itself a single dependency-free file — the helper is a standalone add-on, not a dependency.

## Roadmap / decisions

- **Now:** local-first, single-file, offline. **Phase 2:** cross-device sync (would need a small backend + hosting) — the JSON export carries data across.
- Design intent: **clean & minimal**, light theme. One bright-green accent (fills only), forest-green ink; the Work/Private mode tints the **background**, not the accent. Full token reference + do/don't: **`docs/design-system.md`** — read it before any visual change, and keep it in sync with the `:root` block in `todos.html`.
- Ideas discussed but not built: optional "show both / combined overview" peek across modes, recurring todos, calendar view, tags, dark mode.

## Working with the owner

- The owner is a **non-developer**. Explain choices in plain terms; avoid unexplained jargon.
- They explicitly want **clarifying questions when something is ambiguous** and **proactive improvement suggestions**.
- Preserve the strict Work/Private separation as a first-class requirement.
- Keep the app a single dependency-free file unless a change genuinely requires otherwise — discuss before introducing a build step, framework, or backend.
