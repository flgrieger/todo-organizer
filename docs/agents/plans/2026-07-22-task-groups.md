---
date: 2026-07-22T12:02:22+00:00
git_commit: ""
branch: ""
topic: "Task groups (replacing subtasks)"
tags: [plan, todos-html, groups, migration]
status: ready
---

# PLAN: Task groups — replace flat subtasks with bundles of real todos

Redesign the subtask feature. Today a subtask is an invisible `{title, done}` checkbox
that only lives inside a todo's drawer. We replace it with a **group**: a lightweight
named bundle (e.g. "Change tires") that carries its own priority and optional deadline
and contains several **real todos**, each keeping its own deadline / priority and
remaining individually eligible for Quick Wins, Focus Today, Overdue, etc.

Example the owner gave:

```
🗂 Change tires   (group — name + priority + optional deadline, NO time estimate)
   ⚡ Make appointment   date, priority   → can itself be a Quick Win
      Bring the car      date, priority
      Fetch the car      date, priority
```

The app stays a single dependency-free `todos.html` file. The Work/Private split stays
strict: a group is wholly Work or wholly Private.

## Acceptance Criteria

- A group is a new entity `{ id, name, prio, areaId, projectId|null, due, createdAt }`.
  Todos gain a nullable `groupId`. Data is stored under the **same** key
  (`todo_overview_v1`) and migrated in place — no data loss and no lost existing todos.
- Existing todos that have subtasks **auto-convert losslessly**: each such todo becomes
  a group named after the todo; the original todo stays as the group's first task
  (keeping its date / priority / estimate / notes / star); each subtask becomes a task
  (title + `done` preserved, priority Low, no date). The `subtasks` field is removed
  from every todo afterward.
- Tasks in a group **inherit** the group's `areaId` and `projectId`. A group is entirely
  Work or entirely Private. Moving the group's area/project re-homes every task; deleting
  the group deletes its tasks (after a confirmation).
- **Browse views** (All active, an area, a project) with Group-by = None: a group's tasks
  bundle under a clickable **group header** showing name, priority, optional deadline, and
  progress (`n/total`). The shared location chip is hidden on tasks inside a cluster.
- **Time-views** (Focus Today, Quick Wins, Upcoming, Overdue), **Completed**, **Long-term**,
  and **any active Group-by**: a group's tasks appear as standalone cards, each tagged
  `🗂 <group name>`. So "Make appointment" can appear on its own as a Quick Win.
- A group has its **own drawer**: edit name, priority (Low/Med/High), deadline, the task
  list (add a task, check a task, open a task in its own drawer), and **Delete group**
  (deletes its tasks, confirmed).
- A **"New group"** button in the toolbar creates a group in the current area/project
  context and opens its drawer. A todo's drawer gains a **Group** picker
  (— None — / existing groups in the same area+project / + New group…).
- Export/Import carries `groups`; importing an old backup migrates it (adds `groups`,
  `groupId`, converts subtasks).
- The Work/Private separation, existing views, sorting, and non-group todos behave exactly
  as before.

## Technical Key Decisions and Tradeoffs

1. **Group is a new lightweight entity, not a project and not a todo.**
   - Why: The owner distinguishes group-level facts (name, one priority, one deadline)
     from per-task facts (each task's own date/priority). A project is a heavier sidebar
     citizen; a todo has a checkbox/estimate a group shouldn't.
   - Impact: New `state.groups` array + `groupId` on todos. Groups are **not** shown in
     the sidebar; they render as clusters in the list.

2. **Tasks inherit the group's area + project.**
   - Why: Keeps the Work/Private split airtight — a group can't straddle modes — and
     removes per-task location bookkeeping.
   - Impact: Assigning a todo to a group (or moving a group) forces the task's
     `areaId`/`projectId` to match the group. The task's own location chip is hidden
     inside a cluster.

3. **Cluster only in browse views with Group-by = None; standalone-with-tag elsewhere.**
   - Why: The whole point is that a task can stand alone in a time-view. Browse contexts
     are where bundling helps you plan a group.
   - Impact: `renderList()` branches on view + group setting. A single helper decides
     "cluster or not".

4. **A cluster is positioned as one unit by the group's own smart-score; tasks inside
   follow the active sort. The Group-by menu is unchanged.**
   - Why: Keeps a group visually together and ordered by how urgent/important the group
     is, without adding a new grouping mode.
   - Impact: Sorting logic treats a group as a synthetic sort key derived from its
     priority + deadline.

5. **The group's deadline is informational only (a header chip, red when overdue).
   Groups themselves never enter the time-views — only their tasks do.**
   - Why: The time-views filter todos; groups aren't todos. Avoids a second parallel
     filtering engine.
   - Impact: Group `due` affects only the header chip and the cluster's sort score.

6. **Same storage key, extended `migrate()`, lossless subtask conversion.**
   - Why: The owner has real data in `localStorage`. Bumping the key would orphan it.
     The change is backward-compatible through migration.
   - Impact: `migrate()` gains group defaults + a one-time subtask→group conversion that
     runs on load and on import of old backups.

## Current State

Hierarchy today (`todos.html`):

```
Mode (Work / Private)                       big toggle, re-scopes everything
└─ Area   scope: work|private               sidebar
   └─ Project (optional)                     sidebar, nested under area
      └─ Todo                                cards in the main list
         └─ Subtask { id, title, done }      drawer only; progress bar on card
```

Key facts:
- **State**: `state = { mode, areas, projects, todos, importedKeys }`, persisted under
  `todo_overview_v1` (`todos.html:402`, `435`). `migrate()` at `todos.html:422-434`
  already ensures `longterm`, a `subtasks` array, and `importedKeys`.
- **Todo shape** (`todos.html:889`): `{ id, title, areaId, projectId, prio, due, est,
  star, notes, done, createdAt, subtasks }` (+ optional `longterm`, `source`).
- **Subtask rendering**: progress bar on the card (`todos.html:733-741`); full checklist
  UI in the drawer (`todos.html:979-984`, `1030-1036`, `1056-1070`).
- **Filtering/sorting**: `VIEWS` + `currentFilter()` (`todos.html:503-522`), `sortTodos()`
  (`todos.html:531-553`), `groupBy()` (`todos.html:657-678`). Subtasks are invisible to
  all of it.
- **Rendering pipeline**: `render()` → `renderNav()` + `renderList()` + `save()`
  (`todos.html:556-560`). `renderList()` at `todos.html:617-646` builds cards via
  `todoCard()` (`todos.html:680-746`).
- **Drawer**: `openDrawer()` / `renderDrawer()` (`todos.html:954-1071`), a single shared
  `#drawer` element. Chips edited inline via one reusable `#pop` popover
  (`todos.html:748-874`).
- **Add todo**: `addTodo()` (`todos.html:883-892`) targets the current area/project.
- **Import**: `importTodos()` (`todos.html:1167-1187`) creates todos with `subtasks: []`.

## Desired End State

```
Mode → Area → Project (optional) → [ Group (optional) ] → Todo
                                       │
   state.groups: [{ id, name, prio, areaId, projectId|null, due, createdAt }]
   todo.groupId: string | null   (no more todo.subtasks)
```

Browse view (area/project or All active, Group-by = None):

```
Private › Admin                                   3 todos · 1 quick win
──────────────────────────────────────────────────────────────────
┌ 🗂 Change tires      › High   ⏱ by Nov 1        1/3 ▓▓▓░░░░░   │ ← click header → group drawer
│   ◯ ⚡ Make appointment      ⏱ Tue · Med                       │
│   ◯    Bring the car         ⏱ Thu · Low                       │
│   ◯    Fetch the car         ⏱ Fri · Low                       │
└──────────────────────────────────────────────────────────────
◯ Book car service              ⏱ 3d · Med · ≈15m      ← ungrouped todo
```

Time-view (Quick Wins) — the task stands alone, tagged with its group:

```
◯ ⚡ Make appointment    🗂 Change tires · ⏱ Tue · Med
```

Toolbar:

```
[ + Add a todo…            ] [Sort ▾] [Group ▾]  [🗂 New group]
```

Group drawer (reuses the `#drawer` shell):

```
‹ Close                                              [🗑 Delete group]
Name    [ Change tires                       ]
Priority [ Low ][ Med ][ High* ]
Deadline [ 2026-11-01 ]
Tasks · 1/3 done
  ◯  Make appointment            ⏱ Tue · Med   →
  ◯  Bring the car               ⏱ Thu · Low   →
  ◯  Fetch the car               ⏱ Fri · Low   →
  +  Add a task and press Enter…
```

## Abstractions and Code Reuse

- `todos.html`
  - **State / migration**
    - `seed()` — add a `groups` array (demo "Change tires" group under Private › Admin
      with 3 tasks) and `groupId` on seed todos; drop `subtasks` from the seed.
    - `migrate()` — default `groups: []`, default `groupId: null`, run the lossless
      subtask→group conversion, then `delete t.subtasks`.
    - New helpers: `groupById(id)`, `groupTasks(groupId)`, `groupProgress(group)`
      (returns `{done, total}`), `groupScore(group)` (smart score for cluster placement),
      `deleteGroup(g)`, `newGroup()`, `assignTodoToGroup(t, groupId)`.
  - **Rendering**
    - `renderList()` — decide clustered vs standalone; when clustered, group todos by
      `groupId` and interleave group-units with ungrouped todos, ordered by score.
    - `todoCard(t, opts)` — new `opts` flag: `inCluster` (hide location chip) and
      `showGroupTag` (append `🗂 <group>` tag when standalone). Remove the subtask
      progress bar block (`todos.html:733-741`).
    - New `groupCluster(group, tasks)` — renders the header + member cards.
    - New `groupHeaderChips(group)` — name, priority, deadline (red when overdue),
      progress bar (reuse `.subbar` styles).
  - **Group drawer**
    - Reuse `#drawer` / `openDrawer` machinery. Add `ui.openGroupId`; `renderDrawer()`
      dispatches to `renderTodoDrawer()` or `renderGroupDrawer()`.
    - `renderGroupDrawer()` — name input, priority `.seg`, deadline date, task list
      (reuse `.sub-item` styles but rows open the task's todo drawer), add-task input,
      delete (footer `Delete` button repurposed via the dispatch).
  - **Todo drawer**
    - `renderDrawer()` (todo path) — add a **Group** `<select id="fGroup">` next to
      Area/Project; changing it calls `assignTodoToGroup()` (which also snaps the todo's
      area/project to the group's).
  - **Toolbar / actions**
    - New `#newGroupBtn` in the toolbar; wired to `newGroup()`.
  - **Import**
    - `importTodos()` — create todos with `groupId: null` instead of `subtasks: []`.

No new files, no dependencies, single-file constraint preserved.

## Logging & Observability

No logging changes. This is a client-side single-file app; the only existing diagnostic
is `console.debug` in `checkNotes()`, which is unaffected.

## Implementation

### Phase 1: Data model, migration & read-only clusters

Dependencies: None

Stand up the group data model, migrate existing data losslessly, and make groups
**visible** — clusters in browse views, standalone-with-tag in time-views — while the old
subtask UI is retired. Authoring (creating/editing groups) comes in Phase 2; between
phases the app is fully usable and individual tasks are edited via their own drawers.

**Tasks**:
- [x] Add group helpers near the existing lookups (`todos.html:493-500`):
  ```js
  const groupById = id => state.groups.find(g => g.id === id);
  const groupTasks = gid => state.todos.filter(t => t.groupId === gid);
  const groupProgress = g => { const ts = groupTasks(g.id);
    return { done: ts.filter(t => t.done).length, total: ts.length }; };
  ```
  (`groupProgress` returns `total: 0` for an empty group; every consumer must guard the
  `done/total` percentage against divide-by-zero.)
- [x] Extend `seed()` (`todos.html:439-464`): add `groups: [...]` with a demo
  `chgTires = { id: uid(), name: "Change tires", prio: 3, areaId: priv.id,
  projectId: pAdmin.id, due: plus(20), createdAt: Date.now() }`; give 2–3 seed todos
  `groupId: chgTires.id` (e.g. "Book car service" + two new tasks "Bring the car",
  "Fetch the car", and make "Schedule dentist appointment" a separate ungrouped todo).
  Remove `subtasks` from seed todos; add `groupId: null` to the rest.
- [x] Extend `migrate()` (`todos.html:422-434`). First **remove** the existing
  `if (!Array.isArray(t.subtasks)) t.subtasks = [];` line (`todos.html:429`) so it can't
  re-add empty arrays after the conversion. Then:
  ```js
  if (!Array.isArray(s.groups)) s.groups = [];
  (s.todos || []).forEach(t => { if (t.groupId === undefined) t.groupId = null; });
  // Lossless subtask → group conversion (one-time).
  const newTasks = [];
  (s.todos || []).forEach(t => {
    if (Array.isArray(t.subtasks) && t.subtasks.length && !t.groupId) {
      const g = { id: uid(), name: t.title, prio: t.prio || 1,
        areaId: t.areaId, projectId: t.projectId || null,
        due: t.due || "", createdAt: t.createdAt || Date.now() };
      s.groups.push(g);
      t.groupId = g.id;                      // original todo joins its group
      t.subtasks.forEach(st => newTasks.push({
        id: uid(), title: st.title, areaId: g.areaId, projectId: g.projectId,
        prio: 1, due: "", est: null, star: false, longterm: false, notes: "",
        done: !!st.done, createdAt: g.createdAt, groupId: g.id }));
    }
  });
  s.todos.push(...newTasks);
  s.todos.forEach(t => { delete t.subtasks; });
  ```
  (Note: collect converted tasks in `newTasks` and push after the loop so we don't mutate
  `s.todos` while iterating. `uid()` is a hoisted function declaration, safe to call here.)
- [x] Update `importTodos()` (the `state.todos.unshift({…})` object, `subtasks: []` at
  `todos.html:1183`): replace `subtasks: []` with `groupId: null`.
- [x] Add cluster CSS to the stylesheet: a `.group-cluster` wrapper (left accent border /
  subtle panel), a `.group-head-card` header row, a `.chip.group-tag` for the standalone
  `🗂 <group>` tag, reusing existing `.chip`, `.subbar`, `.due-over`/`.due-soon` styles.
- [x] Add `groupHeaderChips(group)` and `groupCluster(group, tasks)` renderers near
  `todoCard()` (`todos.html:680`). Header shows name, `prio-N` chip, deadline chip
  (`due-over` tint when `daysUntil(group.due) < 0`), and a `.subbar` progress from
  `groupProgress()`. Header element carries `data-group-id` (click wiring added Phase 2;
  in Phase 1 it renders but is inert or logs).
- [x] Extend `todoCard(t, opts = {})` (`todos.html:680-746`): when `opts.inCluster`, skip
  the location chip block (`todos.html:700-707`); when `opts.showGroupTag` and `t.groupId`,
  append a `.chip.group-tag` (`🗂 ` + group name). **Remove** the subtask progress-bar
  block (`todos.html:733-741`).
- [x] **Retire the drawer subtask UI now** (not later): remove the `subs` template build
  (`todos.html:979-984`), the "Subtasks" `.field` block and add-input
  (`todos.html:1030-1036`), and the subtask wiring (`todos.html:1056-1070`). Nothing may
  reference `t.subtasks` outside `migrate()` after this. (Group editing arrives in Phase 2;
  in the interim, tasks are edited individually via their own drawer.)
- [x] Rework `renderList()` (`todos.html:617-646`) to cluster or not:
  ```js
  const clustered = ui.group === "none" &&
    (ui.view === "all" || ui.view === "area");
  ```
  - When `clustered` and Group-by = None: split the filtered list into ungrouped todos and
    grouped todos keyed by `groupId`. Then enumerate the **groups themselves** from
    `state.groups` that belong to the current view (`ui.view === "area"` → `g.areaId ===
    ui.areaId && (!ui.projectId || g.projectId === ui.projectId)`; `ui.view === "all"` →
    `inMode`-equivalent via the group's area scope). Render a `groupCluster()` for each such
    group — **including groups with zero matching tasks** so empty/just-created groups still
    show — with member cards via `todoCard(t, {inCluster:true})`. Place clusters among
    ungrouped cards by `groupScore(group)` (score fn added Phase 3 — Phase 1 may order
    groups by first-member position, empty groups last).
  - Otherwise (time-views, Completed, Long-term, or any Group-by): render every card via
    `todoCard(t, {showGroupTag:true})` — no headers. Existing `groupBy()` path unchanged
    except each card passes `{showGroupTag:true}`.
- [x] Confirm `currentFilter()` (`todos.html:515-522`) still returns tasks individually
  (grouped tasks are ordinary todos, so no filter change needed) and that `inMode()` holds
  because tasks inherit the group's area.

**Automated Verification**:
- [x] Copy `uid()` + the new `migrate()` into a throwaway `/tmp/mig.js` and run a real gate
  (uses `throw`, which exits non-zero — `console.assert` does **not** fail the process in
  Node):
  ```
  node -e "$(cat /tmp/mig.js); const s={mode:'work',areas:[{id:'a',scope:'work',name:'W'}],projects:[],todos:[{id:'t',title:'X',areaId:'a',projectId:null,prio:3,due:'',subtasks:[{id:'s1',title:'sub',done:true},{id:'s2',title:'two',done:false}]}],importedKeys:[]}; migrate(s); if(s.groups.length!==1)throw'no group'; if(s.todos.filter(t=>t.groupId).length!==3)throw'orig+2 subs not grouped'; if(s.todos.some(t=>'subtasks'in t))throw'subtasks left'; if(s.todos.find(t=>t.title==='sub').done!==true)throw'done lost'; migrate(s); if(s.groups.length!==1)throw'not idempotent'; console.log('ok')"
  ```
  prints `ok`.
- [x] `grep -n "subtasks" todos.html` shows references **only** inside `migrate()` (the
  conversion loop + `delete`) — none in `renderDrawer`, `todoCard`, `seed`, or `importTodos`.
- [x] Open `todos.html`; browser console shows no errors on load or when opening a todo's
  drawer.

**Manual Verification**:
- [ ] Open `todos.html`: the "Change tires" cluster renders under Private › Admin with a
  header (name, High priority, deadline, progress) and its member tasks below, and member
  cards do not show a location chip.
- [ ] Switch to Quick Wins (or Focus Today): a qualifying group task appears as a
  standalone card tagged `🗂 Change tires`, not inside a cluster.
- [ ] If you had existing subtasks before upgrading, each former subtasked todo now shows
  as a group whose tasks include the original todo plus the ex-subtasks, with `done` states
  preserved. Nothing disappeared and no other todo was lost.
- [ ] The Work/Private toggle still fully re-scopes the list; the group only appears in
  Private.

### Phase 2: Group drawer + authoring (create, edit, assign, delete)

Dependencies: Phase 1

Make groups fully editable: a clickable cluster header opens a group drawer; a toolbar
button creates groups; a todo's drawer can move it into/out of a group.

**Tasks**:
- [x] Add `ui.openGroupId` to the `ui` object (`todos.html:411`) and to the `ui` reset in
  `importData()` (`todos.html:1093`). Make `openDrawer()` (`todos.html:954-959`) set
  `ui.openGroupId = null` so opening a task (e.g. via a group drawer's `→` button) leaves
  the group view; make `openGroupDrawer()` set `ui.openId = null`. `closeDrawer()` clears
  both.
- [x] Add a toolbar button `<button class="btn" id="newGroupBtn">🗂 New group</button>`
  after the Group-by select (`todos.html:365-370`); wire in the "Wire up" section
  (`todos.html:1200`).
- [x] Implement `newGroup()`: create `{ id, name: "New group", prio: 1, areaId, projectId,
  due: "", createdAt }` using the current view's area/project (mirror `addTodo()`'s
  area/project resolution, `todos.html:886-887`; fall back to the first area of the current
  mode). Reuse `addTodo()`'s guard (`todos.html:888`): if no area exists in the current
  mode, `alert("Add an area first…")` and bail rather than create an area-less group. Push
  to `state.groups`, `render()`, then `openGroupDrawer(g.id)`.
- [x] Split the drawer open/close/render into a dispatch:
  - `openGroupDrawer(id)` sets `ui.openGroupId`, clears `ui.openId`, opens `#drawer`.
  - `renderDrawer()` (`todos.html:967`) branches: if `ui.openGroupId` →
    `renderGroupDrawer()`, else the existing todo path (extract into
    `renderTodoDrawer()`).
  - `closeDrawer()` (`todos.html:960-964`) also clears `ui.openGroupId`.
- [x] Implement `renderGroupDrawer()` into `#drawerBody`:
  - Name `<input id="gName">` (oninput → `g.name`, `save()`, `scheduleListRefresh()`).
  - Priority `.seg` (reuse markup from `todos.html:1006-1010`) → `g.prio`.
  - Deadline `<input type="date" id="gDue">` → `g.due`.
  - Task list from `groupTasks(g.id)`: rows with a round `.check` (toggle `done`), title,
    small due/prio chips, and a `→` button that calls `openDrawer(task.id)` (switches the
    same drawer to the task's todo view).
  - Add-task input (`id="gAddTask"`, Enter): create a todo with `groupId: g.id`,
    `areaId: g.areaId`, `projectId: g.projectId`, defaults matching `addTodo()`.
  - Header buttons: hide `#starBtn`; repurpose footer — `#doneBtn` hidden, `#deleteBtn`
    becomes "Delete group". **Symmetry note:** `renderTodoDrawer()` must actively *restore*
    these (un-hide `#starBtn`/`#doneBtn`, reset `#deleteBtn` label + handler to the todo
    delete) at the top of its render, or a todo drawer opened right after a group drawer
    inherits the group's button state.
- [x] Wire the header click from Phase 1: `groupCluster()` header `onclick` →
  `openGroupDrawer(group.id)`.
- [x] Implement `deleteGroup(g)`: `confirm("Delete group \"" + g.name + "\" and its N
  tasks?")`; on yes, remove `state.todos` where `groupId === g.id`, remove the group,
  `closeDrawer()`, `render()`. Route the drawer `#deleteBtn` to this when a group is open.
- [x] Add the **Group** picker to the todo drawer (`renderTodoDrawer()`, near Area/Project
  at `todos.html:994-1003`): `<select id="fGroup">` with `— None —` plus groups whose
  `areaId === t.areaId && (projectId === t.projectId || …)`; on change call
  `assignTodoToGroup(t, val)`.
- [x] Implement `assignTodoToGroup(t, groupId)`: set `t.groupId = groupId || null`; if
  assigned, snap `t.areaId = g.areaId; t.projectId = g.projectId`. `renderDrawer()` +
  `render()`. Also expose `+ New group…` as a sentinel option that calls `newGroup()`
  pre-assigning `t`.
- [x] Guard `renderGroupDrawer()`'s area list to the current mode so a group can't be
  edited into the other mode (consistent with `editLoc`, `todos.html:854`). (Group area is
  set at creation from context; no area picker needed in the group drawer for v1 — moving
  a group's area is Phase 3.)

**Automated Verification**:
- [x] `grep -q 'id="newGroupBtn"' todos.html && grep -q 'renderGroupDrawer' todos.html &&
  grep -q 'assignTodoToGroup' todos.html` succeeds.
- [x] Open `todos.html`; browser console shows no errors when opening the group drawer,
  adding a task, and deleting a group.

**Manual Verification**:
- [ ] Click a cluster header → the group drawer opens with name, priority, deadline, and
  the task list.
- [ ] Edit the group's name, priority, and deadline → the cluster header updates live.
- [ ] Add a task in the group drawer → it appears in the cluster and inherits the group's
  area/project; if it's ≤30 min and ≥Medium it shows in Quick Wins tagged with the group.
- [ ] Open an existing ungrouped todo's drawer, pick a group in the Group picker → the todo
  joins that cluster and its location snaps to the group's area/project.
- [ ] Click **New group** in the toolbar while viewing an area → an empty group drawer
  opens; the created group belongs to that area/mode.
- [ ] Delete a group → after confirming, the group and all its tasks are gone; no other
  todos are affected.
- [ ] Set the group picker back to **— None —** → the task leaves the cluster and shows as
  an ordinary todo.

### Phase 3: Sorting, moving, edge-case polish & docs

Dependencies: Phase 2

Order clusters sensibly, let a group move between areas/modes carrying its tasks, tidy
visual edge cases, and update the project docs.

**Tasks**:
- [x] Implement `groupScore(group)` mirroring the smart-score in `sortTodos()`
  (`todos.html:540-549`) using the group's `prio` + `due` (+ a boost if any task is
  overdue). Use it in `renderList()` to place each cluster among ungrouped cards; within a
  cluster, sort member tasks by the active `ui.sort` via `sortTodos()`.
- [x] For non-smart sorts (`due` / `prio` / `est` / `created`), define cluster placement:
  order clusters by the same key derived from the group (`due`→group.due, `prio`→group.prio,
  `created`→group.createdAt, `est`→treat as none/last since groups have no estimate).
- [x] Add group **area/project move**: in `renderGroupDrawer()`, add an Area (and Project)
  picker limited to the current mode; on change, update `g.areaId`/`g.projectId` **and**
  every `groupTasks(g.id)` task to match (inherit invariant). If moved to the other mode is
  disallowed for v1, keep pickers within-mode only and document that moving across
  Work/Private is done by moving the area (existing `moveAreaScope`) — verify a group's
  tasks follow because they share the area.
- [x] Edge cases:
  - Empty group (no tasks): cluster header still renders in browse view with `0/0` and an
    "Add the first task" hint; `groupProgress` guards divide-by-zero.
  - All tasks done: style the cluster header as complete (muted, ✓), consistent with
    `.todo.done`.
  - Deadline chip: `due-over` red when `daysUntil(g.due) < 0`, `due-soon` amber when `<= 2`.
  - A grouped task that is `done` still counts in progress and remains in the cluster.
- [x] Update `CLAUDE.md`: replace the `subtasks` description in **Core concept** and
  **Editing todos** with the group model; note `state.groups`, `todo.groupId`, the
  inherit-area invariant, cluster-vs-standalone rendering, the group drawer, and the
  lossless migration. Update the `state` shape line in **Architecture notes** to
  `{ mode, areas, projects, groups, todos, importedKeys }`.

**Automated Verification**:
- [x] `grep -n "subtasks" todos.html` shows references only inside `migrate()` (unchanged
  since Phase 1 — Phase 3 adds no new subtask code).
- [x] `grep -q "groups" CLAUDE.md` and `grep -q "groupId" CLAUDE.md` succeed (docs updated).
- [x] Open `todos.html`; browser console shows no errors across smart/due/prio/created
  sorts and when moving a group's area.

**Manual Verification**:
- [ ] With Sort = Smart, an urgent/high-priority group's cluster sits near the top; with
  Sort = Due date, clusters order by the group's deadline; tasks inside each cluster order
  by the chosen sort.
- [ ] Move a group to another area/project via its drawer → the cluster relocates and every
  task's location follows.
- [ ] Move the group's **area** across Work/Private (via the sidebar area move) → the group
  and its tasks all switch modes together; nothing leaks across the split.
- [ ] An empty group shows a header with an add-first-task hint; a fully-done group shows a
  completed header style.
- [ ] Export a backup, re-import it → groups and their tasks come back intact; importing an
  older (pre-group) backup migrates cleanly.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Implemented Phases 1–3 in one pass (2026-07-22). All automated checks pass.
- **No JS runtime in the dev environment** (`node` absent) — the Phase 1 migration gate was
  validated via a faithful Python port of `migrate()`'s group/subtask logic (group created,
  original + 2 subtasks grouped, `subtasks` deleted, `done` preserved, idempotent). Script
  syntax was checked with a custom bracket-balance pass over the `<script>` block (BALANCED).
  The **browser-console "no errors" checks and all Manual Verification steps still need the
  owner to open `todos.html`** — they could not be run headlessly here.
- `addTodo()` also had a stray `subtasks: []` (not called out in the plan); switched it to
  `groupId: null` so no `subtasks` reference survives outside `migrate()`.

## References

- `todos.html` — the entire app (state, rendering, drawer, popover, import).
- `CLAUDE.md` — project guidance (Core concept, Editing todos, Architecture notes) to be
  updated in Phase 3.
- Prior plan: `docs/agents/plans/2026-07-22-notes-todo-import.md` (pattern reference for
  migration + single-file changes).
