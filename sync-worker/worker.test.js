"use strict";
// node --test coverage for the Worker's pure concurrency logic (`applyPut`) — no Cloudflare
// runtime needed. Discovered automatically by `node --test` (part of `npm run check`).
const test = require("node:test");
const assert = require("node:assert");
const { applyPut, safeEqual } = require("./worker.js");

test("applyPut seeds from an empty store (baseRev 0 accepted, rev becomes 1)", () => {
  const r = applyPut(null, { baseRev: 0, data: { hello: "world" } });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.next, { rev: 1, data: { hello: "world" } });
});

test("applyPut accepts a write based on the current rev and bumps it", () => {
  const current = { rev: 4, data: { n: 1 } };
  const r = applyPut(current, { baseRev: 4, data: { n: 2 } });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.next, { rev: 5, data: { n: 2 } });
});

test("applyPut rejects a stale write (409) and returns the current server copy", () => {
  const current = { rev: 5, data: { n: 2 } };
  const r = applyPut(current, { baseRev: 4, data: { n: 99 } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.rev, 5);
  assert.deepStrictEqual(r.data, { n: 2 });
});

test("applyPut rejects a non-zero baseRev against an empty store", () => {
  const r = applyPut(null, { baseRev: 3, data: { n: 1 } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.rev, 0);
  assert.strictEqual(r.data, null);
});

test("applyPut rejects a missing/garbage body without throwing", () => {
  const current = { rev: 2, data: { n: 1 } };
  const r = applyPut(current, null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.rev, 2);
});

test("safeEqual compares by value and rejects length/None mismatches", () => {
  assert.strictEqual(safeEqual("abc", "abc"), true);
  assert.strictEqual(safeEqual("abc", "abd"), false);
  assert.strictEqual(safeEqual("abc", "abcd"), false);
  assert.strictEqual(safeEqual("abc", ""), false);
  assert.strictEqual(safeEqual(undefined, "abc"), false);
});
