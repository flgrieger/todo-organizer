"use strict";
// @ts-check
//
// Pure business rules for the todo app.
// Dual-mode: loaded as a classic <script> in todos.html (functions become globals),
// and required by logic.test.js in Node (via the module.exports guard at the bottom).
// NO DOM access, NO reads of the app's `state`/`ui` — everything comes in as arguments.

/**
 * @typedef {Object} ImageAttachment
 * @property {string} id
 * @property {string} data          // "data:image/jpeg;base64,…" (downscaled)
 * @property {number} addedAt
 */

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
 * @property {ImageAttachment[]} [images]
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
 * @property {number} updatedAt      // ms epoch of the last real data change; 0 = unknown
 * @property {Area[]} areas
 * @property {Project[]} projects
 * @property {Group[]} groups
 * @property {Todo[]} todos
 * @property {string[]} importedKeys
 */

/** @returns {Filters} A fresh, all-off filter set. */
function noFilters() { return { high: false, overdue: false, quickwin: false, star: false }; }

/**
 * @returns {string} Today as ISO "YYYY-MM-DD" in LOCAL time.
 * Built from local date parts, NOT toISOString() (which is UTC and, in a timezone ahead
 * of UTC like CEST, returns *yesterday* between local midnight and the UTC rollover —
 * throwing every "Today/Tomorrow/overdue" calc off by a day late at night). This matches
 * how daysUntil() reads dates: it parses `iso + "T00:00:00"` as local midnight.
 */
function todayISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @param {string} iso @returns {number|null} Whole days from today to `iso` (null if empty). */
function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(iso + "T00:00:00");
  const b = new Date(todayISO() + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / 86400000);
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

/** @param {Todo} t @returns {boolean} Active, >= Medium priority, and <= 30 minutes. */
const isQuickWin = (t) => !t.done && !!t.est && t.est <= 30 && t.prio >= 2;

/** Deadlines this many days out (or more) count as long-term. */
const LONGTERM_DAYS = 60;

/** @param {Todo} t @returns {boolean} Manually flagged, or a deadline >= LONGTERM_DAYS out. */
const isLongTerm = (t) => !!t.longterm || (!!t.due && Number(daysUntil(t.due)) >= LONGTERM_DAYS);

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
 * @param {Group} g
 * @param {Todo[]} tasks  The group's member todos (caller supplies).
 * @returns {boolean} True iff the set has >= 1 task and every task is done. Empty set = false.
 */
function isGroupComplete(g, tasks) { return tasks.length > 0 && tasks.every((t) => t.done); }

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

/** @returns {string} A short unique-ish id. */
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

/**
 * @param {number} w @param {number} h @param {number} max
 * @returns {{w:number,h:number}} Scaled to fit `max` on the longest edge; never upscaled.
 */
function fitDimensions(w, h, max) {
  const longest = Math.max(w, h);
  if (longest <= max) return { w: Math.round(w), h: Math.round(h) };
  const k = max / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Decide what a pull should do, given the server's current `rev`, the `rev` we last synced to,
 * and whether this device has unpushed local edits. The heart of pull-time sync behaviour —
 * pure so it can be unit-tested without any network. Never overwrites on its own: a genuine
 * two-sided divergence returns "conflict" for the app to resolve with a banner.
 *
 * @param {number} serverRev      The `rev` a fresh GET returned (0 = the store is empty).
 * @param {number} lastServerRev  The `rev` this device last synced to (0 = never).
 * @param {boolean} localDirty    True iff local data changed since the last successful sync.
 * @returns {"seed"|"adopt"|"conflict"|"push"|"idle"}
 *   - "seed":     the store is empty — push our local data to start it off.
 *   - "adopt":    the other device moved ahead and we have no local edits — take the server copy.
 *   - "conflict": the other device moved ahead AND we have local edits — ask which to keep.
 *   - "push":     the server is where we left it and we have local edits — push them.
 *   - "idle":     nothing changed on either side — already in sync.
 */
function classifyPull(serverRev, lastServerRev, localDirty) {
  if (serverRev === 0) return "seed";
  if (serverRev > lastServerRev) return localDirty ? "conflict" : "adopt";
  return localDirty ? "push" : "idle";
}

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
  // Default a missing sync stamp to 0 (= unknown), so stamp-less old backups stay
  // detectable as "unknown" on import rather than being silently stamped as fresh.
  if (typeof s.updatedAt !== "number") s.updatedAt = 0;
  (s.todos || []).forEach((t) => { if (t.groupId === undefined) t.groupId = null; });
  (s.todos || []).forEach((t) => { if (!Array.isArray(t.images)) t.images = []; });
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
        done: !!st.done, createdAt: g.createdAt, groupId: g.id, images: [] }));
    }
  });
  s.todos.push(...newTasks);
  s.todos.forEach((t) => { delete t.subtasks; });
  return s;
}

// @ts-ignore -- Node-only export; `module` is undefined in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    noFilters, uid, fitDimensions, todayISO, daysUntil, fmtDue, fmtEst,
    isQuickWin, LONGTERM_DAYS, isLongTerm, FILTERS, passesFilters,
    smartScore, groupScore, isGroupComplete, sortTodos, migrate, classifyPull,
  };
}
