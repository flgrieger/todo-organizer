# Design: Sets → Done, plus inline "+" add on a set

**Date:** 2026-07-24
**App:** `todos.html` (single-file, vanilla HTML/CSS/JS; pure rules in `logic.js`)
**Status:** Approved (design), pending implementation plan

## Problem

Two owner requests about **sets** (the 🗂 bundles of real todos; code identifiers `group`/`groupId`):

1. **A completed set should retire like a done todo.** Today, when the last task in a set
   is ticked in a browse view, the cluster flips to a struck-through **"✓ All tasks
   complete"** state — and then lingers there forever in the active list. The owner *likes*
   that celebratory moment but wants the set to then leave the active list.
2. **Add a task straight into a set from the list.** Today the only way to add a task to a
   set is to open its detail drawer. The owner wants a `+` on the set itself.

## Current behavior (baseline)

- **Browse views** (All active, an area, a project): sets render as **clusters** via
  `groupCluster()`. `groupsInView()` returns every set in scope — including fully-done ones —
  so an all-done set keeps rendering with `allDone` styling and the message
  **"✓ All tasks complete"** (`todos.html` ~L895–923). It never disappears.
- **`toggleDone(t)`** (~L1119) just flips `done` / `completedAt` and calls `render()`.
- **Completed view** (`ui.view === "done"`, filter `t => t.done`) uses the non-browse path
  (`renderList` ~L757–767): each done todo renders as a **standalone** `todoCard` with
  `showGroupTag: true`, so a set's members scatter as loose `🗂 <set name>`-tagged cards.
- **Set drawer** (`renderGroupDrawer()` ~L1363) already has a working "Add a task and press
  Enter…" row (`#gAddTask`, ~L1447–1455) that unshifts a Low-prio task carrying the set's
  `areaId`/`projectId`/`groupId`.
- Header layout: `.group-head-card` is a flex row — `.g-name` left, chips, and `.subbar`
  (progress `n/total`) pushed right with `margin-left:auto` (CSS ~L275–285).

## Requirements (approved)

### Part A — Inline `+` to add a task into a set

- An icon button `+` sits on the **set cluster header's title line**, at the far right
  (after the progress bar), styled as a small icon button — not an attribute chip.
- Clicking it opens a **slim inline input inside the cluster**, directly under the header,
  mirroring the set drawer's add-task row ("Add a task and press Enter…").
- Pressing **Enter** adds the task to that set: inherits the set's `areaId`/`projectId`,
  `groupId = set.id`, `prio: 1`, no deadline/estimate/star — identical to the drawer's add
  flow (reuse the same task-creation shape).
- The input **stays open and focused** after each add so several tasks can be entered in a
  row. **Esc** or clicking away closes it.
- Clicking `+` must **not** open the set drawer (the header's own click opens the drawer, so
  the `+` handler must `stopPropagation`).
- Which set's inline input is open is transient UI state (proposed `ui.addTaskGroupId`),
  reset on reload; it survives re-renders so rapid entry keeps working. If a set becomes
  hidden (e.g. it just went fully done), its open input closes.

### Part B — Celebrate, then the set leaves the active list

- When `toggleDone` causes a set to become **fully done** (all member tasks done, ≥1 task),
  the cluster shows the existing **"✓ All tasks complete"** state for **~2.5 seconds**,
  then the set **disappears from active/browse views**.
- **Only a fresh completion celebrates.** A set that is already fully done when the app
  loads (from storage or import) is simply hidden from the active list — no celebration.
- **Browse rule:** a fully-done set is hidden from browse views **unless** it is currently
  in its celebration window.
- **Reversible:** un-ticking any member task makes the set no longer fully done, so it
  immediately returns to the active list.
- **Concurrency:** more than one set can be celebrating at once; each completion tracks its
  own timer and clears independently (proposed: a transient `Set` of celebrating set ids,
  each with its own timeout that removes just that id and re-renders).
- Empty sets (0 tasks) are unaffected — `allDone` requires `total > 0`; they keep showing
  "No tasks yet — open the set to add one."

### Part C — Finished sets cluster in the Completed view

- A **fully-done** set renders in the **Completed** view as its **own cluster** (set name +
  its ticked tasks bundled under a cluster header), instead of its tasks scattering as loose
  `🗂`-tagged cards.
- A **partially**-done set is unchanged: it stays an active cluster in browse, and its
  already-done members continue to appear as **standalone `🗂`-tagged cards** in Completed.
  Only fully-done sets cluster in Completed. (This avoids one set appearing as a cluster in
  two places at once.)
- Loose done todos (no set) are unchanged in Completed.

## Implementation sketch (non-binding; refined in the plan)

- **`groupProgress` / completeness:** a fully-done set = `total > 0 && done === total`.
  Consider extracting a small pure helper (e.g. `isGroupComplete(group, tasks)`) into
  `logic.js` so it's unit-testable in the Tier-1 net.
- **Part A:** add the `+` button in `groupCluster()`; render the inline input when
  `ui.addTaskGroupId === group.id`; wire Enter to the same task shape as `#gAddTask`;
  `stopPropagation` on the `+` and on the input.
- **Part B:** in `toggleDone`, detect a set crossing into fully-done; add its id to a
  transient celebrating set and `setTimeout(~2500)` to remove + re-render. In the browse
  path (`buildUnits`/`groupsInView`), exclude fully-done sets unless celebrating.
- **Part C:** give the Completed view a unit builder that clusters **only fully-done** sets
  and leaves everything else as standalone tagged cards; render clusters via the existing
  `groupCluster()` and loose cards via `todoCard(..., { showGroupTag: true })`.
- **Docs:** update `CLAUDE.md` (the rendering rule that says sets show *standalone* in
  Completed) and `docs/design-system.md` if any visual token/pattern is touched.

## Testing

- **`logic.js` (`npm run check`):** unit-test any extracted pure helper (e.g.
  `isGroupComplete`); keep the ESLint + tsc + `node --test` gate green.
- **Browser (Playwright recipe in memory):** manual/automated checks for — inline add joins
  the set and stays focused; ticking the last task shows "✓ All tasks complete" then the set
  leaves the active list after the delay; un-tick returns it; a fully-done set clusters in
  Completed while a partial set's done tasks stay loose-tagged.

## Non-goals / preserved invariants

- Strict Work/Private separation is untouched (tasks still inherit the set's area/project).
- Single dependency-free `todos.html` — no build step, framework, or backend added.
- No localStorage shape change and no key bump: celebration state and the open-input flag
  are **transient `ui` state**, never persisted; `state.groups`/`groupId` are unchanged, so
  no `migrate()` change is required.
