# Sets → Done + Inline "+" Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a fully-ticked set celebrate briefly then retire out of the active list into Completed (as a cluster), and let tasks be added straight into a set via a `+` on its cluster header.

**Architecture:** All changes live in `todos.html` (rendering + a little transient `ui`/module state) plus one new pure helper in `logic.js`. No storage-shape change, no `migrate()` change — celebration and open-input flags are transient. Reuse the existing cluster (`groupCluster`), unit (`buildUnits`/`renderUnit`), and drawer add-task patterns.

**Tech Stack:** Vanilla HTML/CSS/JS single file (`todos.html`); pure rules in `logic.js`; Tier-1 net = `npm run check` (ESLint + `tsc --noEmit` JSDoc + `node --test` on `logic.test.js`).

## Global Constraints

- Single dependency-free `todos.html` — no build step, framework, or backend. The dev toolbox (`package.json`, ESLint, tsc, node:test) is dev-only.
- Strict Work/Private separation: tasks always inherit their set's `areaId`/`projectId`; never surface a set outside `ui.mode`.
- No `localStorage` key bump and no `migrate()` change: new state is transient `ui`/module-level only, never persisted.
- User-facing wording: a "set" (🗂); code identifiers stay `group`/`groupId`.
- Pure rules in `logic.js` take explicit args — NO DOM, NO reads of `state`/`ui`. Keep `npm run check` green before declaring done.
- New task shape must match the existing add flow exactly: `{ id: uid(), title, areaId, projectId, prio: 1, due: "", est: null, star: false, longterm: false, notes: "", done: false, createdAt: Date.now(), groupId }`.

---

## File Structure

- **`logic.js`** — add pure `isGroupComplete(group, tasks)`; export it. (Task 1)
- **`logic.test.js`** — add unit tests for `isGroupComplete`. (Task 1)
- **`todos.html`** — celebration state + `toggleDone` change + browse hide (Task 2); Completed-view clustering (`buildCompletedUnits`, `renderUnit` opts, `renderList` branch) (Task 3); cluster `+` button, inline input, CSS, `ui.addTaskGroupId`, focus hook (Task 4).
- **`CLAUDE.md`** — update the rendering rule (Completed no longer always standalone) + note the `+` and celebrate-then-hide behavior. (Tasks 3 & 4)
- **`docs/design-system.md`** — check only; touch only if a token is added (none expected). (Task 5)

---

## Task 1: Pure `isGroupComplete` helper in `logic.js`

**Files:**
- Modify: `logic.js` (add function near `groupScore` ~L139–146; add to `module.exports` ~L227–231)
- Test: `logic.test.js`

**Interfaces:**
- Produces: `isGroupComplete(group, tasks)` → `boolean`. `true` iff `tasks.length > 0` and every task in `tasks` has `done === true`. `tasks` is the group's member todos (caller supplies, e.g. `groupTasks(g.id)`). An empty set is **not** complete.

- [ ] **Step 1: Write the failing tests**

Add to `logic.test.js` (after the existing `groupScore` test ~L99–104):

```javascript
test("isGroupComplete: true only when all members done and at least one member", () => {
  const g = { id: "g", name: "s", prio: 1, areaId: "a", projectId: null, due: "", createdAt: 0 };
  const done = mkTodo({ done: true, groupId: "g" });
  const open = mkTodo({ done: false, groupId: "g" });
  assert.strictEqual(L.isGroupComplete(g, []), false);                // empty set: not complete
  assert.strictEqual(L.isGroupComplete(g, [open]), false);            // one open
  assert.strictEqual(L.isGroupComplete(g, [done, open]), false);      // mixed
  assert.strictEqual(L.isGroupComplete(g, [done]), true);             // single, done
  assert.strictEqual(L.isGroupComplete(g, [done, { ...done }]), true);// all done
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `TypeError: L.isGroupComplete is not a function`.

- [ ] **Step 3: Implement the helper**

In `logic.js`, add after `groupScore` (after line ~146):

```javascript
/**
 * @param {Group} g
 * @param {Todo[]} tasks  The group's member todos (caller supplies).
 * @returns {boolean} True iff the set has >= 1 task and every task is done. Empty set = false.
 */
function isGroupComplete(g, tasks) { return tasks.length > 0 && tasks.every((t) => t.done); }
```

Then add `isGroupComplete` to the `module.exports` object (~L227–231):

```javascript
  module.exports = {
    noFilters, uid, todayISO, daysUntil, fmtDue, fmtEst,
    isQuickWin, LONGTERM_DAYS, isLongTerm, FILTERS, passesFilters,
    smartScore, groupScore, isGroupComplete, sortTodos, migrate,
  };
```

- [ ] **Step 4: Run the full gate**

Run: `npm run check`
Expected: PASS — ESLint clean, tsc clean, all node:test tests pass (including the 5 new assertions).

- [ ] **Step 5: Commit**

```bash
git add logic.js logic.test.js
git commit -m "feat: add pure isGroupComplete helper + tests"
```

---

## Task 2: Celebrate, then let a finished set leave the active list

**Files:**
- Modify: `todos.html` — `toggleDone` (~L1119–1123); add celebration state + `startGroupCelebration` near it; filter `relGroups` in `renderList` (~L722).

**Interfaces:**
- Consumes: `isGroupComplete(g, tasks)` (Task 1, a global once `logic.js` defines it), `groupById(id)`, `groupTasks(gid)`, `render()`.
- Produces: module-level `celebratingGroups` (a `Set` of set ids currently celebrating) and `startGroupCelebration(gid)`. Browse views hide a fully-done set unless its id is in `celebratingGroups`.

- [ ] **Step 1: Add celebration state + helper**

In `todos.html`, immediately **above** `function toggleDone(t)` (~L1119), add:

```javascript
// A set that just had its last task ticked celebrates ("✓ All tasks complete") for a beat,
// then drops out of the active/browse list. Transient (module-level), never persisted.
const celebratingGroups = new Set();
const celebrationTimers = {};
const CELEBRATE_MS = 2500;
function startGroupCelebration(gid) {
  if (celebrationTimers[gid]) clearTimeout(celebrationTimers[gid]);
  celebratingGroups.add(gid);
  celebrationTimers[gid] = setTimeout(() => {
    celebratingGroups.delete(gid);
    delete celebrationTimers[gid];
    render();
  }, CELEBRATE_MS);
}
```

- [ ] **Step 2: Trigger the celebration on the completing tick**

Replace `toggleDone` (~L1119–1123) with:

```javascript
function toggleDone(t) {
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : null;
  // If this tick just completed a set, celebrate briefly before it leaves the active list.
  if (t.done && t.groupId) {
    const g = groupById(t.groupId);
    if (g && isGroupComplete(g, groupTasks(g.id))) startGroupCelebration(g.id);
  }
  render();
}
```

- [ ] **Step 3: Hide fully-done sets from browse (unless celebrating)**

In `renderList`, replace the `relGroups` line (~L722):

```javascript
  const relGroups = (browse && !anyFilterActive()) ? groupsInView() : [];
```

with:

```javascript
  // A fully-done set retires from the active list — keep it only during its brief celebration.
  const relGroups = (browse && !anyFilterActive())
    ? groupsInView().filter(g => !isGroupComplete(g, groupTasks(g.id)) || celebratingGroups.has(g.id))
    : [];
```

(A fully-done set has no active tasks, so it can only enter a browse view via `relGroups`; filtering here is sufficient. A set already fully-done at load is simply never in `celebratingGroups`, so it stays hidden with no stale celebration.)

- [ ] **Step 4: Manual verification (browser)**

Open `todos.html`. In a Work area, make a set with 2 tasks.
1. Tick the first task → cluster still shows (`1/2`). ✅
2. Tick the second task → cluster flips to struck-through **"✓ All tasks complete"** and stays ~2.5s, then disappears from **All active**. ✅
3. Reload the page → the finished set does **not** reappear in All active (and no celebration flashes). ✅
4. Go to Completed, un-tick one of its tasks → the set returns to All active as a normal cluster (`1/2`). ✅

- [ ] **Step 5: Commit**

```bash
git add todos.html
git commit -m "feat: finished sets celebrate then leave the active list"
```

---

## Task 3: Cluster fully-done sets in the Completed view

**Files:**
- Modify: `todos.html` — add `buildCompletedUnits` (near `buildUnits` ~L774–797); extend `renderUnit` (~L799–802); add a `ui.view === "done"` branch in `renderList` (~L757); update `CLAUDE.md`.

**Interfaces:**
- Consumes: `isGroupComplete`, `groupTasks`, `groupById`, `areaById`, `sortTodos(list, ui.sort)`, `orderUnits`, `groupByUnits`, `groupCluster`, `todoCard`, `el`.
- Produces: `buildCompletedUnits(list)` → array of units (`{type:"group",group,tasks}` for fully-done sets only; `{type:"todo",todo}` for everything else). `renderUnit(wrap, u, todoOpts)` now forwards `todoOpts` to `todoCard` for loose units.

- [ ] **Step 1: Add the Completed-view unit builder**

In `todos.html`, add immediately after `buildUnits` (after ~L797):

```javascript
// Completed-view units: cluster ONLY fully-done sets (all members ticked); every other done
// todo — loose ones and the done members of a still-active set — stays a standalone tagged card.
function buildCompletedUnits(list) {
  const doneGroupIds = new Set(
    state.groups.filter(g => {
      const a = areaById(g.areaId);
      return a && a.scope === ui.mode && isGroupComplete(g, groupTasks(g.id));
    }).map(g => g.id)
  );
  const tasksByGroup = new Map();
  list.forEach(t => {
    if (t.groupId && doneGroupIds.has(t.groupId)) {
      if (!tasksByGroup.has(t.groupId)) tasksByGroup.set(t.groupId, []);
      tasksByGroup.get(t.groupId).push(t);
    }
  });
  const units = [];
  const seen = new Set();
  list.forEach(t => {
    if (t.groupId && doneGroupIds.has(t.groupId)) {
      if (seen.has(t.groupId)) return;
      seen.add(t.groupId);
      units.push({ type: "group", group: groupById(t.groupId), tasks: sortTodos(tasksByGroup.get(t.groupId), ui.sort) });
    } else {
      units.push({ type: "todo", todo: t });
    }
  });
  return units;
}
```

- [ ] **Step 2: Let `renderUnit` forward todo options**

Replace `renderUnit` (~L799–802) with:

```javascript
function renderUnit(wrap, u, todoOpts = {}) {
  if (u.type === "todo") wrap.appendChild(todoCard(u.todo, todoOpts));
  else wrap.appendChild(groupCluster(u.group, u.tasks));
}
```

(Existing browse callers pass no third arg, so `todoOpts` defaults to `{}` — unchanged behavior.)

- [ ] **Step 3: Render the Completed view via units**

In `renderList`, insert a new branch **between** the `if (browse) { … }` block and the `else if (ui.group === "none") { … }` line (~L757). The `else if (browse)` closing brace is at ~L756; add:

```javascript
  } else if (ui.view === "done") {
    // Completed: fully-done sets appear as clusters; other done todos stay standalone (tagged).
    const units = buildCompletedUnits(list);
    if (ui.group === "none") {
      orderUnits(units).forEach(u => renderUnit(wrap, u, { showGroupTag: true }));
    } else {
      groupByUnits(units).forEach((b, i) => {
        if (i > 0) wrap.appendChild(el("div", "group-sep"));
        const h = el("div", "group-head");
        h.appendChild(document.createTextNode(b.label));
        const n = b.items.reduce((s, u) => s + (u.type === "todo" ? 1 : u.tasks.length), 0);
        h.appendChild(el("span", "g-count", " · " + n));
        wrap.appendChild(h);
        orderUnits(b.items).forEach(u => renderUnit(wrap, u, { showGroupTag: true }));
      });
    }
  } else if (ui.group === "none") {
```

(The trailing `} else if (ui.group === "none") {` line replaces the original `else if (ui.group === "none") {` so the other time-views keep their standalone-tagged rendering untouched.)

- [ ] **Step 4: Update the rendering rule in `CLAUDE.md`**

In `CLAUDE.md`, find the bullet describing time-view/Completed rendering (the sentence: "In **time-views** (Focus Today, Quick Wins, Upcoming, Overdue), **Completed**, and **Long-term**, a set's tasks appear as standalone cards tagged `🗂 <set name>` …"). Replace it with:

```markdown
In **time-views** (Focus Today, Quick Wins, Upcoming, Overdue) and **Long-term**, a set's tasks appear as standalone cards tagged `🗂 <set name>` — so a single member can surface on its own (e.g. as a Quick Win). In **Completed**, a **fully-done** set appears as its own cluster (name + its ticked tasks bundled under a cluster header, via `buildCompletedUnits()`); the still-open state's done members — and any partially-done set's done tasks — stay standalone tagged. Browse-view unit assembly + arranging lives in `buildUnits()` / `renderUnit()` / `groupByUnits()`; ordering in `orderUnits()`.
```

- [ ] **Step 5: Manual verification (browser)**

1. Fully complete a 2-task set → after it leaves All active, open **Completed**: the set shows as one cluster (struck name + both ticked tasks under it), not two loose cards. ✅
2. Make a 3-task set, tick only 1 → **Completed** shows that 1 done task as a standalone `🗂 <set>`-tagged card (no cluster); All active still shows the set cluster `1/3`. ✅
3. In Completed, switch **Arrange by** between None / Project / Area / Priority → the finished-set cluster stays intact and slots into the right block. ✅
4. Loose (no-set) completed todos still show normally. ✅

- [ ] **Step 6: Run the gate + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add todos.html CLAUDE.md
git commit -m "feat: cluster fully-done sets in the Completed view"
```

---

## Task 4: Inline "+" to add a task straight into a set

**Files:**
- Modify: `todos.html` — CSS (after the Group cluster block ~L288); `ui` initializers (~L460 and ~L1495); `groupCluster` (~L896–923); add `toggleAddTask`/`addTaskToGroup` helpers; focus hook at the end of `renderList` (~L768); update `CLAUDE.md`.

**Interfaces:**
- Consumes: `groupById`, `uid`, `render()`, `renderList()`, `el`.
- Produces: `ui.addTaskGroupId` (string id of the set whose inline input is open, or `null`); `toggleAddTask(gid)`; `addTaskToGroup(gid, title)`. The open input has DOM id `clusterAddInput`.

- [ ] **Step 1: Add `ui.addTaskGroupId` to both `ui` initializers**

Line ~460 — add `addTaskGroupId: null` to the initial `ui`:

```javascript
let ui = { view: "all", areaId: null, projectId: null, sort: "smart", group: "project", openId: null, openGroupId: null, filters: noFilters(), mode: state.mode || "work", addTaskGroupId: null };
```

Line ~1495 (the import reset) — add it there too:

```javascript
      ui = { view: "all", areaId: null, projectId: null, sort: ui.sort, group: ui.group, openId: null, openGroupId: null, filters: noFilters(), mode: state.mode || "work", addTaskGroupId: null };
```

- [ ] **Step 2: Add the CSS**

In `todos.html`, after the `.chip.group-tag` rule (~L288), add:

```css
  .group-head-card .g-add-btn {
    margin-left: 4px; flex: none; width: 24px; height: 24px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--panel); color: var(--ink-soft);
    font-size: 16px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .group-head-card .g-add-btn:hover { border-color: var(--accent); color: var(--forest); background: var(--accent-soft); }
  .cluster-add { display: flex; align-items: center; gap: 8px; padding: 2px 10px 8px; }
  .cluster-add .cluster-add-plus { color: var(--ink-faint); }
  .cluster-add input { flex: 1; border: none; border-bottom: 1px dashed var(--line-strong); background: none; outline: none; padding: 4px 2px; font: inherit; color: inherit; }
```

- [ ] **Step 3: Add the `+` button and inline input in `groupCluster`**

In `groupCluster` (~L896), after `head.onclick = () => openGroupDrawer(group.id);` and before `wrap.appendChild(head);`, add the `+` button (only on a not-all-done set):

```javascript
  if (!allDone) {
    const addBtn = el("button", "g-add-btn", "+");
    addBtn.title = "Add a task to this set";
    addBtn.onclick = e => { e.stopPropagation(); toggleAddTask(group.id); };
    head.appendChild(addBtn);
  }
```

Then, immediately **after** `wrap.appendChild(head);` and **before** the `tasks.forEach(...)` line, add the inline input:

```javascript
  if (!allDone && ui.addTaskGroupId === group.id) {
    const addRow = el("div", "cluster-add");
    addRow.appendChild(el("span", "cluster-add-plus", "+"));
    const inp = el("input");
    inp.id = "clusterAddInput";
    inp.placeholder = "Add a task and press Enter…";
    inp.onkeydown = e => {
      if (e.key === "Enter" && inp.value.trim()) { addTaskToGroup(group.id, inp.value.trim()); }
      else if (e.key === "Escape") { ui.addTaskGroupId = null; renderList(); }
    };
    // Click-away closes it — but ignore the blur that fires when we re-render after an add
    // (focus lands back on the freshly-rendered input within the timeout).
    inp.onblur = () => setTimeout(() => {
      const a = document.activeElement;
      if (!a || a.id !== "clusterAddInput") { ui.addTaskGroupId = null; renderList(); }
    }, 120);
    addRow.appendChild(inp);
    wrap.appendChild(addRow);
  }
```

- [ ] **Step 4: Add the `toggleAddTask` / `addTaskToGroup` helpers**

Add near `toggleDone` (e.g. just below the `celebrating` block from Task 2, ~L1119):

```javascript
// Inline "+" on a set cluster: open/close a one-line add row, and add a task into the set.
function toggleAddTask(gid) {
  ui.addTaskGroupId = ui.addTaskGroupId === gid ? null : gid;
  renderList();
  const i = document.getElementById("clusterAddInput");
  if (i) i.focus();
}
function addTaskToGroup(gid, title) {
  const g = groupById(gid);
  if (!g) return;
  state.todos.unshift({ id: uid(), title, areaId: g.areaId, projectId: g.projectId,
    prio: 1, due: "", est: null, star: false, longterm: false, notes: "", done: false, createdAt: Date.now(), groupId: gid });
  render();               // render() persists via save(); ui.addTaskGroupId stays set so the row reopens
}
```

- [ ] **Step 5: Refocus the input after any list render while open**

At the very end of `renderList` (after the final rendering branch, before the closing `}` ~L768), add:

```javascript
  // Keep the inline set-add input focused across re-renders so several tasks flow in a row.
  if (ui.addTaskGroupId) {
    const i = document.getElementById("clusterAddInput");
    if (i) i.focus();
  }
```

- [ ] **Step 6: Update `CLAUDE.md` (Set authoring)**

In `CLAUDE.md`, in the "Editing todos" section under **Set authoring**, append a sentence after the existing "🗂 New set toolbar button …" line:

```markdown
Each set's cluster header also carries a small **`+`** icon button (right of the progress `n/total`) that opens a slim inline add-row inside the cluster (`toggleAddTask()` / `addTaskToGroup()`, tracked by `ui.addTaskGroupId`) — Enter adds a task into the set and keeps the row focused for rapid entry; Esc or clicking away closes it. The `+` is hidden once a set is fully done.
```

- [ ] **Step 7: Manual verification (browser)**

1. On a set cluster in All active, a `+` sits at the far right of the header row (right of `n/total`). Click it → a dashed inline input opens under the header, focused. ✅
2. Type "Bring the car", Enter → task joins the set (progress denominator grows), input stays open and focused; type another, Enter → also added. ✅
3. Press Esc → input closes. Reopen, click a different card/toolbar → input closes (click-away). ✅
4. New tasks carry the set's area/project (open one via `→` in the set drawer to confirm), Low priority, no deadline. ✅
5. Fully complete the set → the `+` is gone on its (celebrating / Completed) cluster. ✅
6. Clicking `+` does not open the set drawer. ✅

- [ ] **Step 8: Run the gate + commit**

Run: `npm run check`
Expected: PASS (no `logic.js` change here, but keep the gate green).

```bash
git add todos.html CLAUDE.md
git commit -m "feat: inline + on a set cluster to add a task directly"
```

---

## Task 5: Final regression + design-doc check

**Files:**
- Check: `docs/design-system.md` (touch only if a token was added — none expected).
- Verify: whole app.

- [ ] **Step 1: Design-system check**

Open `docs/design-system.md`. Confirm the new `+` button and inline input reuse existing tokens (`--panel`, `--line`, `--line-strong`, `--ink-soft`, `--ink-faint`, `--forest`, `--accent`, `--accent-soft`) — no new token was introduced. If the doc enumerates components and would benefit from a one-line mention of the cluster `+`, add it; otherwise no change.

- [ ] **Step 2: Full manual regression (browser)**

- Work/Private toggle still re-scopes everything; finished sets in one mode never leak into the other. ✅
- Browse arrange-by (None/Project/Area/Priority) + Sort still work with active clusters. ✅
- Sidebar counts unchanged by the celebration/hide (they were never set-aware). ✅
- Completed view: fully-done set clusters; partial set's done tasks stay tagged-standalone. ✅
- Quick Wins / Focus Today / Overdue / Upcoming / Long-term still show set members standalone-tagged (unchanged). ✅

- [ ] **Step 3: Final gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit any doc change (if Step 1 edited the file)**

```bash
git add docs/design-system.md
git commit -m "docs: note cluster + control in design system"
```

(Skip if `docs/design-system.md` was not modified.)

---

## Self-Review (author)

- **Spec coverage:** Part A → Task 4; Part B → Task 2; Part C → Task 3; pure completeness rule → Task 1; docs → Tasks 3–5. All spec sections mapped.
- **Type consistency:** `isGroupComplete(g, tasks)` defined in Task 1 is used identically in Tasks 2 & 3. `ui.addTaskGroupId`, `toggleAddTask`, `addTaskToGroup`, DOM id `clusterAddInput`, and `celebratingGroups`/`startGroupCelebration` are named identically wherever referenced. `renderUnit(wrap, u, todoOpts)` third arg is optional, so browse callers are unaffected.
- **No placeholders:** every code step shows the exact code; every run step names the command + expected result.
- **Invariants:** no storage-key/`migrate()` change; Work/Private scoping preserved via `a.scope === ui.mode` in `buildCompletedUnits` and the `groupsInView` filter.
