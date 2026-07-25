"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("./logic.js");

const mkTodo = (over = {}) => ({
  id: "x", title: "t", areaId: "a", projectId: null, prio: 1, due: "",
  est: null, star: false, longterm: false, notes: "", done: false,
  createdAt: 0, groupId: null, ...over,
});

// Build a date N days from today so tests are date-independent.
// Format from LOCAL components (not toISOString(), which converts to UTC and would shift
// the date a day in any timezone ahead of UTC, e.g. CEST) — matching how the app reads
// dates: daysUntil() parses `iso + "T00:00:00"` as local midnight.
const shiftFromToday = (n) => {
  const d = new Date(L.todayISO() + "T00:00:00");
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

test("noFilters returns all four toggles off", () => {
  assert.deepStrictEqual(L.noFilters(), {
    high: false, overdue: false, quickwin: false, star: false,
  });
});

test("fmtEst formats minutes and hours, null for empty", () => {
  assert.strictEqual(L.fmtEst(5), "5m");
  assert.strictEqual(L.fmtEst(59), "59m");
  assert.strictEqual(L.fmtEst(60), "1h");
  assert.strictEqual(L.fmtEst(90), "1h 30m");
  assert.strictEqual(L.fmtEst(120), "2h");
  assert.strictEqual(L.fmtEst(null), null);
  assert.strictEqual(L.fmtEst(0), null);
});

test("todayISO returns the LOCAL date (not UTC), matching daysUntil's parsing", () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  const expectedLocal = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  assert.strictEqual(L.todayISO(), expectedLocal);
  assert.strictEqual(L.daysUntil(L.todayISO()), 0);   // today is always 0 days from today
});

test("daysUntil is 0 for today, signed for past/future", () => {
  const today = L.todayISO();
  assert.strictEqual(L.daysUntil(today), 0);
  assert.strictEqual(L.daysUntil(""), null);
  assert.strictEqual(L.daysUntil(shiftFromToday(1)), 1);
  assert.strictEqual(L.daysUntil(shiftFromToday(-1)), -1);
});

test("fmtDue labels near-term dates", () => {
  assert.strictEqual(L.fmtDue(L.todayISO()), "Today");
  assert.strictEqual(L.fmtDue(shiftFromToday(1)), "Tomorrow");
  assert.strictEqual(L.fmtDue(shiftFromToday(-1)), "Yesterday");
  assert.strictEqual(L.fmtDue(shiftFromToday(-3)), "3d overdue");
  assert.strictEqual(L.fmtDue(shiftFromToday(4)), "4d");
  assert.strictEqual(L.fmtDue(""), null);
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
  assert.strictEqual(L.LONGTERM_DAYS, 60);
  assert.strictEqual(L.isLongTerm(mkTodo({ longterm: true })), true);
  assert.strictEqual(L.isLongTerm(mkTodo({ due: shiftFromToday(60) })), true);   // exactly 60 -> long-term
  assert.strictEqual(L.isLongTerm(mkTodo({ due: shiftFromToday(59) })), false);
  assert.strictEqual(L.isLongTerm(mkTodo({ due: "" })), false);
});

test("smartScore ranks overdue + high priority above a plain low task", () => {
  const overdueHigh = mkTodo({ prio: 3, due: shiftFromToday(-2) });
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
  const group = { id: "g", name: "Set", prio: 2, areaId: "a", projectId: null, due: "", createdAt: 0 };
  const noOverdue = [mkTodo({ due: shiftFromToday(3) })];
  const withOverdue = [mkTodo({ due: shiftFromToday(-1) })];
  assert.ok(L.groupScore(group, withOverdue) > L.groupScore(group, noOverdue));
});

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

test("migrate defaults a missing updatedAt to 0 (unknown), preserves an existing one", () => {
  const missing = L.migrate({ areas: [{ id: "a", name: "Home" }], todos: [] });
  assert.strictEqual(missing.updatedAt, 0);            // stamp-less old backup stays detectable as "unknown"
  const stamped = L.migrate({ updatedAt: 1700000000000, areas: [{ id: "a", name: "Home" }], todos: [] });
  assert.strictEqual(stamped.updatedAt, 1700000000000); // a real file stamp is left untouched
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
