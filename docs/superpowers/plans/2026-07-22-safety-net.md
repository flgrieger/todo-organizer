# Safety Net (Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the todo app's pure business rules into a testable `logic.js`, and wrap them in a lint + type-check + test "green gate" (`npm run check`), without adding a build step or changing app behavior.

**Architecture:** The ~15 pure rule functions move out of `todos.html`'s inline `<script>` into a sibling `logic.js`, loaded by the browser as a classic script (functions become globals, exactly as before) and made importable in Node tests via a `module.exports` guard ("dual-mode"). A small dev toolbox (Node's built-in test runner + `typescript` in check-JS mode + `eslint`) verifies the rules. `todos.html`'s call sites are unchanged except where a function's signature is made pure (filters/sort/group-score gain an explicit parameter instead of reading `ui`/`state`).

**Tech Stack:** Vanilla JS (unchanged app), Node.js ≥ 20 (built-in `node --test`), TypeScript (JSDoc `checkJs`, no emit), ESLint 9 (flat config). Two dev dependencies only: `typescript`, `eslint`.

## Global Constraints

- **No build step; app opens by double-clicking `todos.html` on `file://`.** `logic.js` is a *classic* `<script src>` (NOT an ES module — modules are blocked on `file://`). Loaded **before** the inline script.
- **No runtime dependencies.** `typescript` and `eslint` are `devDependencies` only; the app itself imports nothing.
- **Strict Work/Private separation** stays a tested invariant.
- **`logic.js` is the single source of truth** for every extracted rule — no duplicate definitions left in `todos.html`.
- **User-facing "Set" = code `group`/`groupId`.** Do not rename code identifiers.
- **Package is CommonJS** (no `"type": "module"` in `package.json`) so `logic.js`'s `module.exports` and the test's `require()` work.
- **App behavior must be identical** after each task: the Work/Private toggle, sets, filters, sort, add-todo, and export/import all work exactly as before.

---

## File map

- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `logic.js`, `logic.test.js`, `.gitignore`
- Modify: `todos.html` (add one `<script src>` line; move rule functions out; update 5 call sites for the 3 signature changes)

**Final `logic.js` exports** (target end-state, built up across tasks):
`noFilters, uid, todayISO, daysUntil, fmtDue, fmtEst, isQuickWin, LONGTERM_DAYS, isLongTerm, FILTERS, passesFilters, smartScore, groupScore, sortTodos, migrate`

**Signature changes** (made pure so they don't read `ui`/`state`):
- `passesFilters(t)` → `passesFilters(t, filters)` — call site `todos.html:748`
- `sortTodos(list)` → `sortTodos(list, sortMode)` — call sites `todos.html:794, 796, 825`
- `groupScore(g)` → `groupScore(g, tasks)` — call site `todos.html:876`

**Stays in `todos.html`** (reads `ui`/`state`/DOM): `anyFilterActive` (references the now-global `FILTERS`), `currentFilter`, `currentTitle`, `inMode`, `areaById`, `projectById`, `groupById`, `groupTasks`, `groupProgress`, `seed`, `load`, `save`, `VIEWS`, `HIDE_LT`, `PRIO`, and all render code.

---

## Task 1: Dev toolbox + first extraction (`noFilters`) + green baseline

Establishes the whole pipeline end-to-end with the simplest pure function, proving dual-mode + browser loading + all three checks work before moving risky code.

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `.gitignore`, `logic.js`, `logic.test.js`
- Modify: `todos.html` (add `<script src="logic.js">`; remove `noFilters` definition)

**Interfaces:**
- Produces: `noFilters(): {high:boolean, overdue:boolean, quickwin:boolean, star:boolean}` (global in browser, exported in Node). JSDoc typedefs `Todo`, `Group`, `Area`, `Project`, `Filters`, `State`.

- [ ] **Step 1: Initialize git (skip if already a repo)**

Run:
```bash
git init
```

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore`:
```
node_modules/
.DS_Store
```

- [ ] **Step 3: Create `package.json`**

Create `package.json` (note: **no** `"type": "module"`):
```json
{
  "name": "todo-overview",
  "version": "1.0.0",
  "private": true,
  "description": "Dev toolbox for the single-file todo app. Not required to run the app.",
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "node --test",
    "check": "npm run lint && npm run typecheck && npm run test"
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Install the toolbox**

Run:
```bash
npm install
```
Expected: creates `node_modules/` and `package-lock.json`, no errors.

- [ ] **Step 5: Create `tsconfig.json`**

Create `tsconfig.json` (checks `logic.js` only — the test file needs `@types/node`, which we deliberately avoid):
```json
{
  "compilerOptions": {
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "types": [],
    "skipLibCheck": true
  },
  "include": ["logic.js"]
}
```

- [ ] **Step 6: Create `eslint.config.js`**

Create `eslint.config.js` (CommonJS flat config; declares only the globals actually used, so `no-undef` is meaningful):
```js
"use strict";
// Flat ESLint config (CommonJS — matches package.json having no "type": "module").
module.exports = [
  {
    files: ["logic.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { module: "readonly", globalThis: "readonly" },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
  {
    files: ["logic.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { require: "readonly", module: "readonly" },
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "no-undef": "error",
    },
  },
];
```

- [ ] **Step 7: Create `logic.js` skeleton with typedefs + `noFilters`**

Create `logic.js`:
```js
"use strict";
// @ts-check
//
// Pure business rules for the todo app.
// Dual-mode: loaded as a classic <script> in todos.html (functions become globals),
// and required by logic.test.js in Node (via the module.exports guard at the bottom).
// NO DOM access, NO reads of the app's `state`/`ui` — everything comes in as arguments.

/**
 * @typedef {Object} Todo
 * @property {string} id
 * @property {string} title
 * @property {string} areaId
 * @property {string|null} projectId
 * @property {number} prio          // 1 Low, 2 Medium, 3 High
 * @property {string} due           // ISO "YYYY-MM-DD" or ""
 * @property {number|null} est      // minutes
 * @property {boolean} star
 * @property {boolean} longterm
 * @property {string} notes
 * @property {boolean} done
 * @property {number} createdAt
 * @property {string|null} groupId
 */

/**
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} name
 * @property {number} prio
 * @property {string} areaId
 * @property {string|null} projectId
 * @property {string} due
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Area
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {"work"|"private"} scope
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} areaId
 * @property {string} name
 */

/**
 * @typedef {Object} Filters
 * @property {boolean} high
 * @property {boolean} overdue
 * @property {boolean} quickwin
 * @property {boolean} star
 */

/**
 * @typedef {Object} State
 * @property {string} mode
 * @property {Area[]} areas
 * @property {Project[]} projects
 * @property {Group[]} groups
 * @property {Todo[]} todos
 * @property {string[]} importedKeys
 */

/** @returns {Filters} A fresh, all-off filter set. */
function noFilters() { return { high: false, overdue: false, quickwin: false, star: false }; }

// @ts-ignore -- Node-only export; `module` is undefined in the browser.
if (typeof module !== "undefined" && module.exports) { module.exports = { noFilters }; }
```

- [ ] **Step 8: Write the failing test in `logic.test.js`**

Create `logic.test.js`:
```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("./logic.js");

test("noFilters returns all four toggles off", () => {
  assert.deepStrictEqual(L.noFilters(), {
    high: false, overdue: false, quickwin: false, star: false,
  });
});
```

- [ ] **Step 9: Run the full gate to confirm it passes**

Run:
```bash
npm run check
```
Expected: `eslint` clean, `tsc` clean, and `node --test` prints `# pass 1` / `tests 1`. Exit code 0.

- [ ] **Step 10: Wire `logic.js` into `todos.html` and remove the inline `noFilters`**

In `todos.html`, add the script tag immediately **before** the inline `<script>` (currently line 442):
```html
<!-- Pure business rules, shared with the Node test toolbox (see logic.js) -->
<script src="logic.js"></script>

<script>
```
Then **delete** the now-duplicate inline definition (currently line 597):
```js
function noFilters() { return { high: false, overdue: false, quickwin: false, star: false }; }
```
Leave every `noFilters()` call site untouched — it now resolves to the global from `logic.js`.

- [ ] **Step 11: Manually verify the app still works**

Open `todos.html` in a browser (double-click). Expected: app loads normally; toggling a filter chip and clicking **Clear** still works (this exercises `noFilters`). Open the browser console (View → Developer) and confirm **no red errors**.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js .gitignore logic.js logic.test.js todos.html
git commit -m "chore: add dev toolbox + extract noFilters into logic.js"
```

---

## Task 2: Extract date/format helpers (`todayISO`, `daysUntil`, `fmtDue`, `fmtEst`)

**Files:**
- Modify: `logic.js` (add functions + exports), `logic.test.js` (add tests), `todos.html` (remove the four definitions)

**Interfaces:**
- Consumes: nothing new.
- Produces: `todayISO(): string`, `daysUntil(iso: string): number|null`, `fmtDue(iso: string): string|null`, `fmtEst(min: number|null): string|null`.

- [ ] **Step 1: Write failing tests**

Add to `logic.test.js`:
```js
test("fmtEst formats minutes and hours, null for empty", () => {
  assert.strictEqual(L.fmtEst(5), "5m");
  assert.strictEqual(L.fmtEst(59), "59m");
  assert.strictEqual(L.fmtEst(60), "1h");
  assert.strictEqual(L.fmtEst(90), "1h 30m");
  assert.strictEqual(L.fmtEst(120), "2h");
  assert.strictEqual(L.fmtEst(null), null);
  assert.strictEqual(L.fmtEst(0), null);
});

test("daysUntil is 0 for today, signed for past/future", () => {
  const today = L.todayISO();
  assert.strictEqual(L.daysUntil(today), 0);
  assert.strictEqual(L.daysUntil(""), null);
  // Build tomorrow/yesterday from today so the test is date-independent.
  const d = new Date(today + "T00:00:00");
  const shift = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  assert.strictEqual(L.daysUntil(shift(1)), 1);
  assert.strictEqual(L.daysUntil(shift(-1)), -1);
});

test("fmtDue labels near-term dates", () => {
  const today = L.todayISO();
  const d = new Date(today + "T00:00:00");
  const shift = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  assert.strictEqual(L.fmtDue(today), "Today");
  assert.strictEqual(L.fmtDue(shift(1)), "Tomorrow");
  assert.strictEqual(L.fmtDue(shift(-1)), "Yesterday");
  assert.strictEqual(L.fmtDue(shift(-3)), "3d overdue");
  assert.strictEqual(L.fmtDue(shift(4)), "4d");
  assert.strictEqual(L.fmtDue(""), null);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test
```
Expected: FAIL — `L.fmtEst is not a function` (and the others).

- [ ] **Step 3: Add the functions to `logic.js`**

Insert **above** the `module.exports` guard (order matters: `todayISO` before `daysUntil` before `fmtDue`):
```js
/** @returns {string} Today as ISO "YYYY-MM-DD" in local time. */
function todayISO() { return new Date().toISOString().slice(0, 10); }

/** @param {string} iso @returns {number|null} Whole days from today to `iso` (null if empty). */
function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(iso + "T00:00:00");
  const b = new Date(todayISO() + "T00:00:00");
  return Math.round((a - b) / 86400000);
}

/** @param {string} iso @returns {string|null} Short human label for a due date. */
function fmtDue(iso) {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0) return d === -1 ? "Yesterday" : `${-d}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return `${d}d`;
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** @param {number|null} min @returns {string|null} e.g. "1h 30m"; null when empty. */
function fmtEst(min) {
  if (!min) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
```
Update the export line:
```js
if (typeof module !== "undefined" && module.exports) { module.exports = { noFilters, todayISO, daysUntil, fmtDue, fmtEst }; }
```

- [ ] **Step 4: Remove the four inline definitions from `todos.html`**

Delete these lines from the inline script (currently 538, 539-544, 545-553, 554-559):
```js
const todayISO = () => new Date().toISOString().slice(0, 10);
function daysUntil(iso) { /* ...body... */ }
function fmtDue(iso) { /* ...body... */ }
function fmtEst(min) { /* ...body... */ }
```
All call sites (`daysUntil` at 546/566/579/581/582/593/620/631/634/641/872/924/996/1418, `fmtDue` at 926/998/1419, `fmtEst` at 891/1005/1111, `todayISO` at 542/1502) stay unchanged — they resolve to the new globals. Note `daysUntil` inside `logic.js` (used by `fmtDue`) now calls the extracted `todayISO`; the browser copy is gone.

- [ ] **Step 5: Run the full gate**

Run:
```bash
npm run check
```
Expected: all green.

- [ ] **Step 6: Manually verify the app**

Reload `todos.html`. Expected: due-date chips (e.g. "Today", "Tomorrow", "3d overdue") and time-estimate chips (e.g. "1h 30m") render correctly. No console errors.

- [ ] **Step 7: Commit**

```bash
git add logic.js logic.test.js todos.html
git commit -m "refactor: extract date/format helpers into logic.js with tests"
```

---

## Task 3: Extract predicates (`isQuickWin`, `LONGTERM_DAYS`, `isLongTerm`)

**Files:**
- Modify: `logic.js`, `logic.test.js`, `todos.html` (remove three definitions)

**Interfaces:**
- Consumes: `daysUntil` (Task 2).
- Produces: `isQuickWin(t: Todo): boolean`, `LONGTERM_DAYS: number` (= 60), `isLongTerm(t: Todo): boolean`.

- [ ] **Step 1: Write failing tests**

Add to `logic.test.js`:
```js
const mkTodo = (over = {}) => ({
  id: "x", title: "t", areaId: "a", projectId: null, prio: 1, due: "",
  est: null, star: false, longterm: false, notes: "", done: false,
  createdAt: 0, groupId: null, ...over,
});

test("isQuickWin: active, >=Medium prio, <=30 min", () => {
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 2, est: 30 })), true);   // boundaries pass
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 3, est: 5 })), true);
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 1, est: 10 })), false);  // prio too low
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 2, est: 31 })), false);  // too long
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 2, est: null })), false); // no estimate
  assert.strictEqual(L.isQuickWin(mkTodo({ prio: 2, est: 10, done: true })), false); // done
});

test("isLongTerm: manual flag OR deadline >= 60 days out", () => {
  const today = L.todayISO();
  const d = new Date(today + "T00:00:00");
  const shift = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  assert.strictEqual(L.LONGTERM_DAYS, 60);
  assert.strictEqual(L.isLongTerm(mkTodo({ longterm: true })), true);
  assert.strictEqual(L.isLongTerm(mkTodo({ due: shift(60) })), true);   // exactly 60 -> long-term
  assert.strictEqual(L.isLongTerm(mkTodo({ due: shift(59) })), false);
  assert.strictEqual(L.isLongTerm(mkTodo({ due: "" })), false);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test
```
Expected: FAIL — `L.isQuickWin is not a function`.

- [ ] **Step 3: Add to `logic.js`**

Insert above the export guard:
```js
/** @param {Todo} t @returns {boolean} Active, >= Medium priority, and <= 30 minutes. */
const isQuickWin = (t) => !t.done && !!t.est && t.est <= 30 && t.prio >= 2;

/** Deadlines this many days out (or more) count as long-term. */
const LONGTERM_DAYS = 60;

/** @param {Todo} t @returns {boolean} Manually flagged, or a deadline >= LONGTERM_DAYS out. */
const isLongTerm = (t) => !!t.longterm || (!!t.due && Number(daysUntil(t.due)) >= LONGTERM_DAYS);
```
(`Number(daysUntil(...))` is a no-op at runtime — `t.due` is truthy so `daysUntil` returns a number — but it keeps the type-checker happy that we're comparing numbers.)
Update the export line to add `isQuickWin, LONGTERM_DAYS, isLongTerm`.

- [ ] **Step 4: Remove the three inline definitions from `todos.html`**

Delete (currently lines 563, 565, 566):
```js
const isQuickWin = t => !t.done && t.est && t.est <= 30 && t.prio >= 2;
const LONGTERM_DAYS = 60;
const isLongTerm = t => !!t.longterm || (!!t.due && daysUntil(t.due) >= LONGTERM_DAYS);
```
Keep the comment line 564 if desired. All call sites (`isQuickWin` at 580/594/623/889/1011, `isLongTerm` at 583/607/683/1012, plus `VIEWS`/`FILTERS` which reference them) resolve to the globals.

- [ ] **Step 5: Run the full gate**

Run:
```bash
npm run check
```
Expected: all green.

- [ ] **Step 6: Manually verify**

Reload `todos.html`. Expected: the **Quick Wins** view and the **⚡ Quick win** / **🌱 Long-term** chips still appear on the right todos; the **Long-term** view lists the flagged item. No console errors.

- [ ] **Step 7: Commit**

```bash
git add logic.js logic.test.js todos.html
git commit -m "refactor: extract isQuickWin/isLongTerm predicates with tests"
```

---

## Task 4: Extract scoring & sort (`smartScore`, `groupScore(g, tasks)`, `sortTodos(list, sortMode)`)

Two functions gain a parameter so they no longer read `ui`/`state`.

**Files:**
- Modify: `logic.js`, `logic.test.js`, `todos.html` (remove three definitions; update 4 call sites)

**Interfaces:**
- Consumes: `daysUntil`, `isQuickWin` (Tasks 2–3).
- Produces:
  - `smartScore(t: Todo): number`
  - `groupScore(g: Group, tasks: Todo[]): number` — `tasks` are the group's member todos (caller supplies via `groupTasks`)
  - `sortTodos(list: Todo[], sortMode: string): Todo[]` — `sortMode` ∈ `"smart"|"due"|"prio"|"est"|"created"`

- [ ] **Step 1: Write failing tests**

Add to `logic.test.js`:
```js
test("smartScore ranks overdue + high priority above a plain low task", () => {
  const today = L.todayISO();
  const d = new Date(today + "T00:00:00");
  const shift = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const overdueHigh = mkTodo({ prio: 3, due: shift(-2) });
  const plainLow = mkTodo({ prio: 1, due: "" });
  assert.ok(L.smartScore(overdueHigh) > L.smartScore(plainLow));
});

test("sortTodos honors the sort mode", () => {
  const a = mkTodo({ id: "a", prio: 1, est: 5, createdAt: 1 });
  const b = mkTodo({ id: "b", prio: 3, est: 90, createdAt: 2 });
  assert.deepStrictEqual(L.sortTodos([a, b], "prio").map((t) => t.id), ["b", "a"]);
  assert.deepStrictEqual(L.sortTodos([b, a], "est").map((t) => t.id), ["a", "b"]);
  assert.deepStrictEqual(L.sortTodos([a, b], "created").map((t) => t.id), ["b", "a"]);
  // Does not mutate the input array.
  const input = [a, b];
  L.sortTodos(input, "prio");
  assert.deepStrictEqual(input.map((t) => t.id), ["a", "b"]);
});

test("groupScore boosts a set with an overdue member", () => {
  const today = L.todayISO();
  const d = new Date(today + "T00:00:00");
  const shift = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const group = { id: "g", name: "Set", prio: 2, areaId: "a", projectId: null, due: "", createdAt: 0 };
  const noOverdue = [mkTodo({ due: shift(3) })];
  const withOverdue = [mkTodo({ due: shift(-1) })];
  assert.ok(L.groupScore(group, withOverdue) > L.groupScore(group, noOverdue));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test
```
Expected: FAIL — `L.smartScore is not a function`.

- [ ] **Step 3: Add to `logic.js`**

Insert above the export guard:
```js
/** @param {Todo} t @returns {number} Urgency + priority + quick-win + star score. */
function smartScore(t) {
  let sc = 0;
  const d = t.due ? daysUntil(t.due) : null;
  if (d !== null) { if (d < 0) sc += 100; else if (d === 0) sc += 60; else if (d <= 2) sc += 40; else if (d <= 7) sc += 20; }
  sc += t.prio * 12;
  if (isQuickWin(t)) sc += 8;
  if (t.star) sc += 15;
  return sc;
}

/**
 * @param {Group} g
 * @param {Todo[]} tasks  The group's member todos (caller supplies).
 * @returns {number} Cluster score: g's own prio/deadline, boosted if any member is overdue.
 */
function groupScore(g, tasks) {
  let sc = 0;
  const d = g.due ? daysUntil(g.due) : null;
  if (d !== null) { if (d < 0) sc += 100; else if (d === 0) sc += 60; else if (d <= 2) sc += 40; else if (d <= 7) sc += 20; }
  sc += g.prio * 12;
  if (tasks.some((t) => !t.done && t.due && Number(daysUntil(t.due)) < 0)) sc += 30;
  return sc;
}

/**
 * @param {Todo[]} list
 * @param {string} sortMode  "smart" | "due" | "prio" | "est" | "created"
 * @returns {Todo[]} A new sorted array (input not mutated).
 */
function sortTodos(list, sortMode) {
  const big = 1e9;
  const byDue = (t) => t.due ? Number(daysUntil(t.due)) : big;
  const arr = [...list];
  if (sortMode === "due") arr.sort((a, b) => byDue(a) - byDue(b));
  else if (sortMode === "prio") arr.sort((a, b) => b.prio - a.prio || byDue(a) - byDue(b));
  else if (sortMode === "est") arr.sort((a, b) => (a.est || big) - (b.est || big));
  else if (sortMode === "created") arr.sort((a, b) => b.createdAt - a.createdAt);
  else arr.sort((a, b) => smartScore(b) - smartScore(a));
  return arr;
}
```
Update the export line to add `smartScore, groupScore, sortTodos`.

- [ ] **Step 4: Remove the three inline definitions and update call sites in `todos.html`**

Delete the inline `smartScore` (618-626), `groupScore` (629-636), and `sortTodos` (638-649) definitions.
Then update the four call sites:
- Line 794: `sortTodos(list).forEach(...)` → `sortTodos(list, ui.sort).forEach(...)`
- Line 796: `groupBy(sortTodos(list)).forEach(...)` → `groupBy(sortTodos(list, ui.sort)).forEach(...)`
- Line 825: `sortTodos(tasksByGroup.get(t.groupId) || [])` → `sortTodos(tasksByGroup.get(t.groupId) || [], ui.sort)`
- Line 876: `const scoreOf = u => u.type === "todo" ? smartScore(u.todo) : groupScore(u.group);` → `const scoreOf = u => u.type === "todo" ? smartScore(u.todo) : groupScore(u.group, groupTasks(u.group.id));`

(`smartScore` call at 647 was inside the old `sortTodos` — now gone. `smartScore` global is still used at 876. `groupTasks` remains defined in `todos.html`.)

- [ ] **Step 5: Run the full gate**

Run:
```bash
npm run check
```
Expected: all green.

- [ ] **Step 6: Manually verify**

Reload `todos.html`. Expected: the **Sort** dropdown (Smart / Due / Priority / Estimate / Created) reorders the list correctly, and set clusters slot into Smart order sensibly. No console errors.

- [ ] **Step 7: Commit**

```bash
git add logic.js logic.test.js todos.html
git commit -m "refactor: extract scoring/sort (pure signatures) with tests"
```

---

## Task 5: Extract filters (`FILTERS`, `passesFilters(t, filters)`)

**Files:**
- Modify: `logic.js`, `logic.test.js`, `todos.html` (remove `FILTERS` + `passesFilters`; update 1 call site; keep `anyFilterActive`)

**Interfaces:**
- Consumes: `isQuickWin`, `daysUntil`.
- Produces:
  - `FILTERS: Array<{key:string,label:string,icon:string,test:(t:Todo)=>boolean}>`
  - `passesFilters(t: Todo, filters: Filters): boolean` — AND across every active filter.

- [ ] **Step 1: Write failing tests**

Add to `logic.test.js`:
```js
test("passesFilters ANDs active toggles; inactive filters don't restrict", () => {
  const off = L.noFilters();
  const highTask = mkTodo({ prio: 3 });
  const lowTask = mkTodo({ prio: 1 });
  assert.strictEqual(L.passesFilters(lowTask, off), true);              // nothing active -> everything passes
  assert.strictEqual(L.passesFilters(highTask, { ...off, high: true }), true);
  assert.strictEqual(L.passesFilters(lowTask, { ...off, high: true }), false);
  // AND: needs high AND star
  const highStar = mkTodo({ prio: 3, star: true });
  assert.strictEqual(L.passesFilters(highStar, { ...off, high: true, star: true }), true);
  assert.strictEqual(L.passesFilters(highTask, { ...off, high: true, star: true }), false);
});

test("FILTERS exposes the four attribute toggles", () => {
  assert.deepStrictEqual(L.FILTERS.map((f) => f.key), ["high", "overdue", "quickwin", "star"]);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test
```
Expected: FAIL — `L.passesFilters is not a function`.

- [ ] **Step 3: Add to `logic.js`**

Insert above the export guard:
```js
/**
 * Cross-project attribute filters. Each `test` decides if a todo matches that chip.
 * @type {Array<{key:string,label:string,icon:string,test:(t:Todo)=>boolean}>}
 */
const FILTERS = [
  { key: "high",     label: "High priority", icon: "▲", test: (t) => t.prio === 3 },
  { key: "overdue",  label: "Overdue",       icon: "!", test: (t) => !t.done && !!t.due && Number(daysUntil(t.due)) < 0 },
  { key: "quickwin", label: "Quick wins",    icon: "⚡", test: (t) => isQuickWin(t) },
  { key: "star",     label: "Focus",         icon: "★", test: (t) => t.star },
];

/**
 * @param {Todo} t
 * @param {Filters} filters  The active toggle set (e.g. ui.filters).
 * @returns {boolean} True unless some active filter rejects `t` (AND logic).
 */
function passesFilters(t, filters) { return FILTERS.every((f) => !filters[f.key] || f.test(t)); }
```
Update the export line to add `FILTERS, passesFilters`.

- [ ] **Step 4: Update `todos.html`**

Delete the inline `FILTERS` array (591-596) and the inline `passesFilters` (599). **Keep** `anyFilterActive` (598) — it references the now-global `FILTERS`. Then update the one `passesFilters` call site:
- Line 748: `.filter(passesFilters)` → `.filter((t) => passesFilters(t, ui.filters))`

(`FILTERS` is still referenced by `anyFilterActive` at 598 and `renderFilterBar` at 662 — both resolve to the global. `noFilters` shape is unchanged.)

- [ ] **Step 5: Run the full gate**

Run:
```bash
npm run check
```
Expected: all green.

- [ ] **Step 6: Manually verify**

Reload `todos.html`. Expected: the filter bar chips (**High priority · Overdue · Quick wins · ★ Focus**) each narrow the list, combining with AND; **Clear** resets. No console errors.

- [ ] **Step 7: Commit**

```bash
git add logic.js logic.test.js todos.html
git commit -m "refactor: extract FILTERS/passesFilters (pure) with tests"
```

---

## Task 6: Extract `uid` and `migrate` (the crown-jewel test)

**Files:**
- Modify: `logic.js`, `logic.test.js`, `todos.html` (remove `uid` + `migrate`)

**Interfaces:**
- Consumes: nothing new (`migrate` uses `uid`).
- Produces: `uid(): string`, `migrate(s: State): State` (mutates and returns `s`; idempotent).

- [ ] **Step 1: Write failing tests**

Add to `logic.test.js`:
```js
test("migrate adds missing defaults", () => {
  const s = { areas: [{ id: "a", name: "Büro" }], todos: [{ id: "t", title: "x", areaId: "a" }] };
  const out = L.migrate(s);
  assert.strictEqual(out.mode, "work");
  assert.strictEqual(out.areas[0].scope, "work");        // "Büro" -> work by name heuristic
  assert.strictEqual(out.todos[0].longterm, false);
  assert.strictEqual(out.todos[0].groupId, null);
  assert.deepStrictEqual(out.importedKeys, []);
  assert.deepStrictEqual(out.groups, []);
});

test("migrate is idempotent (running twice == once)", () => {
  const base = { areas: [{ id: "a", name: "Home" }], todos: [{ id: "t", title: "x", areaId: "a" }] };
  const once = L.migrate(JSON.parse(JSON.stringify(base)));
  const twice = L.migrate(L.migrate(JSON.parse(JSON.stringify(base))));
  assert.deepStrictEqual(twice, once);
});

test("migrate converts subtasks into a set losslessly", () => {
  const s = {
    areas: [{ id: "a", name: "Home", scope: "private" }],
    todos: [{
      id: "t", title: "Change tires", areaId: "a", projectId: "p", prio: 3, due: "2026-01-01",
      createdAt: 111, subtasks: [{ title: "Make appointment", done: false }, { title: "Bring car", done: true }],
    }],
  };
  const out = L.migrate(s);
  assert.strictEqual(out.groups.length, 1);
  const g = out.groups[0];
  assert.strictEqual(g.name, "Change tires");
  assert.strictEqual(g.areaId, "a");
  assert.strictEqual(g.projectId, "p");
  // Original todo joined its group; two subtasks became standalone member todos.
  const members = out.todos.filter((t) => t.groupId === g.id);
  assert.strictEqual(members.length, 3);
  assert.ok(members.some((t) => t.title === "Make appointment" && t.done === false));
  assert.ok(members.some((t) => t.title === "Bring car" && t.done === true));
  // subtasks field is gone everywhere.
  assert.ok(out.todos.every((t) => t.subtasks === undefined));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test
```
Expected: FAIL — `L.migrate is not a function`.

- [ ] **Step 3: Add `uid` and `migrate` to `logic.js`**

Insert above the export guard (put `uid` before `migrate`):
```js
/** @returns {string} A short unique-ish id. */
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

/**
 * Bring older saved data up to date; idempotent. Adds scope/mode/defaults and runs the
 * one-time lossless subtask -> set(group) conversion.
 * @param {any} s  Parsed state (possibly from an old version).
 * @returns {any} The same object, upgraded.
 */
function migrate(s) {
  if (!s.mode) s.mode = "work";
  (s.areas || []).forEach((a) => {
    if (!a.scope) a.scope = /work|job|office|arbeit|b[üu]ro/i.test(a.name) ? "work" : "private";
  });
  (s.todos || []).forEach((t) => {
    if (t.longterm === undefined) t.longterm = false;
  });
  if (!Array.isArray(s.importedKeys)) s.importedKeys = [];
  if (!Array.isArray(s.groups)) s.groups = [];
  (s.todos || []).forEach((t) => { if (t.groupId === undefined) t.groupId = null; });
  const newTasks = [];
  (s.todos || []).forEach((t) => {
    if (Array.isArray(t.subtasks) && t.subtasks.length && !t.groupId) {
      const g = { id: uid(), name: t.title, prio: t.prio || 1,
        areaId: t.areaId, projectId: t.projectId || null,
        due: t.due || "", createdAt: t.createdAt || Date.now() };
      s.groups.push(g);
      t.groupId = g.id;
      t.subtasks.forEach((st) => newTasks.push({
        id: uid(), title: st.title, areaId: g.areaId, projectId: g.projectId,
        prio: 1, due: "", est: null, star: false, longterm: false, notes: "",
        done: !!st.done, createdAt: g.createdAt, groupId: g.id }));
    }
  });
  s.todos.push(...newTasks);
  s.todos.forEach((t) => { delete t.subtasks; });
  return s;
}
```
Update the export line to add `uid, migrate`.

- [ ] **Step 4: Remove the inline `uid` and `migrate` from `todos.html`**

Delete the inline `migrate` (466-499) and `uid` (502). All call sites stay: `migrate` at 460 (`load`) and 1513 (import); `uid` at 485/491/505-529/1167/1192/1217/1361/1486/1530/1601. They resolve to the globals in `logic.js`.

- [ ] **Step 5: Run the full gate**

Run:
```bash
npm run check
```
Expected: all green (now ~9 tests passing).

- [ ] **Step 6: Manually verify (with a real data check)**

Reload `todos.html`. Expected: your existing saved todos still load unchanged (migrate runs on load). Then test import safety: use **Export** to download a backup, then **Import** that same file — it should load without error and the list looks identical. No console errors.

- [ ] **Step 7: Commit**

```bash
git add logic.js logic.test.js todos.html
git commit -m "refactor: extract uid/migrate into logic.js with idempotency + subtask-conversion tests"
```

---

## Task 7: Final verification + docs note

**Files:**
- Modify: `CLAUDE.md` (short note about the toolbox); no code changes.

- [ ] **Step 1: Run the full gate one last time**

Run:
```bash
npm run check
```
Expected: `eslint` clean, `tsc` clean, all tests pass. Exit code 0.

- [ ] **Step 2: Confirm no rule function is defined twice**

Run:
```bash
grep -nE "function (migrate|uid|daysUntil|fmtDue|fmtEst|smartScore|groupScore|sortTodos|passesFilters|noFilters|todayISO)\b|const (isQuickWin|isLongTerm|LONGTERM_DAYS|FILTERS)\b" todos.html
```
Expected: **no output** (every rule now lives only in `logic.js`).

- [ ] **Step 3: Full manual smoke test of the app**

Open `todos.html` (double-click). Verify each still works, with no console errors:
- Work/Private toggle re-scopes the whole app and re-tints the accent.
- Views: All active, Focus Today, Quick Wins, Upcoming, Overdue, Long-term, Completed.
- Sort dropdown and Arrange-by dropdown.
- Filter bar (High / Overdue / Quick wins / Focus) + Clear.
- Add a todo; open a set cluster; edit a chip (priority/deadline/estimate).
- Export a backup, then Import it back.

- [ ] **Step 4: Add a short note to `CLAUDE.md`**

Under "Architecture notes", add:
```markdown
- **Dev safety net (Tier 1):** the pure business rules live in `logic.js` (a classic
  `<script src>` the browser loads before the inline script; also `require`-able in Node
  via a `module.exports` guard). `npm run check` runs ESLint + `tsc --noEmit` (JSDoc
  check-JS, no build) + `node --test` (`logic.test.js`) as one green gate — run it before
  declaring a change done. Render/UI JS and CSS are **not** yet extracted (Tiers 2 & 3).
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note the logic.js safety net and npm run check gate"
```

---

## Self-review notes

- **Spec coverage:** toolbox (Task 1) ✓; testing via `node --test` (all tasks) ✓; typing via `tsc` checkJs + typedefs (Task 1, applied throughout) ✓; linting via ESLint (Task 1) ✓; extract-only-pure-functions with the `anyFilterActive`/`HIDE_LT` exceptions handled ✓; dual-mode `file://` load ✓; Work/Private invariant tested (migrate scope + isQuickWin/isLongTerm) ✓; `npm run check` green gate ✓; single-source-of-truth verified (Task 7 Step 2) ✓; Node prerequisite noted ✓; out-of-scope Tiers 2/3 untouched ✓.
- **Signature-change call sites** all enumerated with exact line numbers; `groupTasks`/`ui.sort`/`ui.filters` remain in `todos.html`.
- **Type-checker pragmatics:** `tsconfig` includes only `logic.js` (avoids needing `@types/node` for the test file); `Number(daysUntil(...))` casts guard the strict-off comparisons; `@ts-ignore` covers the Node-only export line.
- **Note on line numbers:** they reflect the file *before* edits. After Task 1 adds a `<script>` line and removes `noFilters`, later line numbers shift by a few — locate by function name, not absolute line.
