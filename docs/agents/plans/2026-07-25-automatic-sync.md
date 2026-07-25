---
date: 2026-07-25T12:41:44+00:00
git_commit: f467469d1851eaa58087f9b89fd18d3b3b4c0549
branch: docs/auto-sync-spec
topic: "Automatic cross-device sync (iPhone ↔ Mac) via a tiny Cloudflare store"
tags: [plan, sync, cloudflare, worker, kv, offline-first, localStorage]
status: ready
---

# PLAN: Automatic cross-device sync via a tiny Cloudflare store

Replace the cumbersome manual Export/Import round-trip with **automatic** sync between the
owner's iPhone and Mac. The app keeps saving locally (offline-first, instant open) and, on
top of that, loads from and saves to a small free cloud store. Edit on either device and it
appears on the other within a few seconds — nothing to press, nothing to forget.

This is the roadmap's **"Phase 2: cross-device sync"** (see `CLAUDE.md`), chosen as **Path C**
in the prior research (`docs/agents/research/2026-07-22-phone-access-and-sync.md`). The design
below was brainstormed and approved with the owner (a non-developer): Cloudflare Worker + KV,
optimistic-concurrency so it can **never silently overwrite**, a visible status pill, and a
one-time per-device setup.

## Acceptance Criteria

- Editing on one device appears on the other **automatically within a few seconds**, with no
  manual Export/Import step.
- The app still **opens instantly and works fully offline**; sync is purely **additive** —
  if the Sync panel is never filled in, the app behaves **exactly as it does today**.
- Sync **never silently overwrites** data: a genuine conflict (e.g. an offline edit while the
  other device moved ahead) surfaces a banner to choose **"Use the newer version"** or
  **"Keep mine"** — no data is lost without a clear question.
- A visible **status pill** in the header shows **Synced ✓ / Saving… / Offline / ⚠ needs
  attention** so the owner can trust it at a glance.
- **One-time per-device setup**: paste the Worker URL + a secret key once (once on Mac, once on
  iPhone); it is remembered locally on that device.
- Data is protected by the secret key: the app URL is public but useless without the key, and
  the key only ever travels to the owner's **own** Worker.
- The app stays a **single dependency-free `todos.html`** that opens by double-click; the Worker
  is a **separate, optional** file. The strict **Work/Private separation is untouched**.
- `npm run check` stays green; all work lands via **branch → PR → green CI → merge**.

## Technical Key Decisions and Tradeoffs

1. **Store = Cloudflare Worker + KV** (vs Supabase / JSONBin / Firebase).
   - Why: free with no credit card and no surprise-bill risk, no SDK (plain `fetch()`), keeps
     the single-file spirit; owner approved a free Cloudflare account.
   - Impact: we ship a ~40-line Worker (`sync-worker/worker.js`) and a KV namespace; the Worker
     enforces auth + concurrency.

2. **Optimistic concurrency via a monotonic `rev` + `baseRev` on write** (vs last-write-wins by
   wall-clock, vs CRDT/field-merge).
   - Why: the app's data is one whole-blob `state`, so there are no per-record merges; a version
     guard makes **silent overwrite impossible** and is tiny to implement.
   - Impact: a write that isn't based on the current server `rev` is **rejected (HTTP 409)** and
     the app shows the conflict banner instead of clobbering. Clock skew is irrelevant.

3. **Whole-blob sync** — keep syncing the single `state` JSON (vs splitting into per-todo records).
   - Why: preserves the app's single-source-of-truth model and the existing `migrate()` path;
     smallest, safest change.
   - Impact: a conflict is resolved all-or-nothing (pick a whole side). Acceptable for one user
     who edits one device at a time.

4. **Poll every ~5s + on focus/`online`** (vs websockets / true push).
   - Why: one person, one device at a time — polling *feels* instant and keeps the code trivial
     and dependency-free.
   - Impact: up to a few seconds of latency; no realtime infra.

5. **Config (URL + key) in `localStorage` per device; sync purely additive** (vs baking the URL/key
   into the committed file).
   - Why: keeps the **public** GitHub Pages repo free of secrets, and keeps the file behaving
     identically when unconfigured.
   - Impact: a one-time paste per device via a small **Sync panel**.

6. **`localStorage` stays the local source of truth; the cloud syncs on top** (offline-first)
   (vs cloud-only).
   - Why: offline-first + instant open are core values.
   - Impact: the sync layer wraps `save()` / boot, **never blocks the UI**, and degrades to an
     "Offline" pill on any network failure — exactly like the optional Notes helper does today.

7. **Auth = a single bearer secret compared in the Worker** (vs per-user login / row-level rules).
   - Why: one person; simplest possible.
   - Impact: protect the data by not publicising the URL and using a long unguessable key; the
     key lives only on the owner's devices.

## Current State

The whole app is one file, `todos.html`. All data lives in **one `localStorage` key**,
`todo_overview_v1`, as a single JSON `state` object. There is **no network sync** — the only
bridge between devices is the manual Export/Import of a JSON file, plus the optional Mac-only
Notes helper.

```
  iPhone Safari                         Mac Safari
  ┌──────────────┐                      ┌──────────────┐
  │ localStorage │   ✂ no link today ✂  │ localStorage │
  │ todo_over..1 │                      │ todo_over..1 │
  └──────┬───────┘                      └──────┬───────┘
         │  Export ⬇  → file → ⬆ Import (manual, whole-blob, last-wins)
         └──────────────────────────────────────┘
```

Relevant code (all in `todos.html`):

- `STORE_KEY = "todo_overview_v1"` (`todos.html:554`) — the single local key.
- `load()` (`todos.html:572`) — reads + `migrate()`s state from localStorage.
- `save()` (`todos.html:583`) — writes the whole `state`; bumps `state.updatedAt` **only when**
  `contentSig(state)` changes (`todos.html:567`, `:585`). **This is the hook point for pushing to
  the cloud.**
- `render()` (`todos.html:697`) — `renderNav()` + `renderFilterBar()` + `renderList()` + `save()`.
- Topbar markup (`todos.html:466-478`) — `.spacer` then `#navToggle` "⋯"; the **status pill**
  slots in here.
- `renderData(...boxes)` (`todos.html:814`) — builds Check Notes / Export / Import + the
  `.last-changed` line per instance (sidebar + mobile sheet); the **"Sync…"** entry slots in here.
- `exportData()` / `importData(file)` (`todos.html:1762`, `:1770`) — kept as-is (backup + escape
  hatch); `importData` already models the "older backup" guard and `migrate()`-on-import we mirror.
- `checkNotes()` (`todos.html:1822`) — the template for a **silent-on-failure** `fetch()`; our
  sync calls follow the same try/catch-and-carry-on shape.
- Boot: `render()` then `checkNotes()` (`todos.html:1930-1932`) — where the initial cloud pull +
  polling get wired.

Pure rules live in `logic.js` (globals in the browser, `require`-able in Node) and are covered by
`logic.test.js` behind `npm run check`. `migrate(state)` (`logic.js:199`) is idempotent and already
defaults a missing `updatedAt` to `0`.

## Desired End State

```
  iPhone (GitHub Pages app)            Mac (GitHub Pages app)
  ┌──────────────┐                      ┌──────────────┐
  │ localStorage │  offline-first cache │ localStorage │
  └──────┬───────┘                      └──────┬───────┘
         │  GET (pull) / PUT (push, baseRev-guarded)
         ▼                                     ▼
              ┌───────────────────────────────┐
              │  Cloudflare Worker  (bearer)  │
              │  KV: { rev, data:<state> }    │
              └───────────────────────────────┘
   pill: Synced ✓ / Saving… / Offline / ⚠   • conflict → choose Use newer / Keep mine
```

- The Worker stores an envelope `{ rev:<int>, data:<state> }` in KV under one key.
- `GET /todos` → `{ rev, data }` (or `{ rev: 0, data: null }` when empty).
- `PUT /todos` body `{ baseRev, data }` → if `baseRev === currentRev`: store, `rev++`,
  `200 { ok:true, rev }`; else `409 { ok:false, rev, data }` (the newer server copy).
- Both require `Authorization: Bearer <key>`; `OPTIONS` handled for CORS.
- The client keeps `localStorage` as the local source of truth and layers sync on top: pull on
  boot / focus / poll, debounced push after real edits, and conflict → banner.

## Abstractions and Code Reuse

Reuse: `contentSig(state)` for "is there an unsynced local edit?" (dirty = `sig !== syncedSig`),
`migrate()` before adopting any remote data (as `importData` already does), the silent-`fetch`
pattern from `checkNotes()`, the per-instance render pattern in `renderData()`, and the
banner/scrim/modal patterns already in the DOM.

New abstractions:

- `sync-worker/`
  - `worker.js` — Cloudflare Worker: routing, bearer auth, CORS, and a **pure** `applyPut(current, body)`
    helper (exported behind a `module.exports` guard so Node can unit-test the accept/409 logic
    without the Cloudflare runtime).
  - `worker.test.js` — `node --test` over `applyPut` (accept when `baseRev===rev`; 409 otherwise;
    seed when empty).
  - `README.md` — click-by-click Cloudflare setup (account → Worker → KV binding → secret → deploy →
    URL) + a `curl` round-trip test.
- `logic.js`
  - `classifyPull(serverRev, lastServerRev, localDirty)` — **pure** decision function returning
    `"seed" | "adopt" | "conflict" | "push" | "idle"`. The heart of pull-time behaviour; unit-tested.
- `logic.test.js`
  - table tests for `classifyPull`.
- `todos.html` (new "Sync" section of the inline script)
  - Config: `todo_sync_cfg_v1 = { url, key }`; runtime `todo_sync_state_v1 = { serverRev, syncedSig }`.
  - `syncEnabled()`, `loadSyncCfg()` / `saveSyncCfg()`, `setSyncStatus()`.
  - `pullRemote()`, `pushRemote()` (debounced `scheduleSync()`), `adoptRemote(data, rev)`,
    `keepMineOverwrite(rev)`; `startSyncLoop()` (interval + `visibilitychange`/`focus`/`online`).
  - UI: `#syncPill` (topbar), `renderData` "Sync…" entry, `#syncModal` (+ `#syncScrim`),
    `#syncBanner` (conflict chooser).
- `CLAUDE.md` — Architecture notes (sync layer, new localStorage keys, Worker) + Roadmap (Phase 2 →
  in progress/done).
- `docs/design-system.md` — tokens/rules for the status pill + conflict banner.

## Logging & Observability

The **status pill is the primary user-facing observability**. Behind it, `console.debug` traces
each sync event (silent to the user, like the Notes helper):

```
sync: pull rev=7 (adopt)          sync: push baseRev=7 -> ok rev=8
sync: push baseRev=7 -> 409 (conflict, server rev=9)
sync: offline (fetch failed) — keeping local edits, will retry
```

No secrets are logged (never the key). Network failures are caught and shown only as the
"Offline" pill — they must never throw into `render()`.

## Implementation

### Phase 1: The cloud store (Cloudflare Worker + KV)

Dependencies: None.

Stand up the tiny store the client will talk to, plus its setup docs, so it can be verified in
isolation (by `curl`) before any client code exists.

**Tasks**:
- [x] Create `sync-worker/worker.js` implementing:
  - [x] `OPTIONS` → CORS preflight (allow the configured origin, `GET, PUT, OPTIONS`, the
        `Authorization`/`Content-Type` headers).
  - [x] Bearer check: constant-time compare of the `Authorization: Bearer …` token to the
        `SYNC_KEY` secret; `401` on mismatch/missing.
  - [x] `GET /todos` → read KV key `blob`; return `{ rev, data }` or `{ rev: 0, data: null }`.
  - [x] `PUT /todos` → parse `{ baseRev, data }`, apply the pure `applyPut(current, body)`, write
        KV on accept, return `200 { ok:true, rev }` or `409 { ok:false, rev, data }`.
  - [x] Pure `applyPut(current, body)` (accept iff `body.baseRev === current.rev`; empty store's
        `rev` is `0`; on accept return `{ rev: current.rev + 1, data: body.data }`) exported via a
        `module.exports` guard.
  ```js
  // shape only
  function applyPut(current, body) {
    const rev = current ? current.rev : 0;
    if (body.baseRev !== rev) return { ok: false, rev, data: current ? current.data : null };
    return { ok: true, next: { rev: rev + 1, data: body.data } };
  }
  ```
- [x] Create `sync-worker/worker.test.js` (`node --test`) covering `applyPut`: seed from empty,
      accept on matching `baseRev`, reject (409) on stale `baseRev`.
- [x] Wire `sync-worker/worker.test.js` into the `npm run check` test run (or a sibling `node --test`
      glob) so it runs in CI. (`node --test` auto-discovers `sync-worker/worker.test.js`; added
      ESLint config blocks for the worker files so lint stays green.)
- [x] Create `sync-worker/README.md`: exact Cloudflare steps (free account → create Worker → create
      + bind a KV namespace as `SYNC_KV` → set `SYNC_KEY` secret → set `ALLOW_ORIGIN` → deploy → copy
      the `*.workers.dev` URL) and a `curl` GET/PUT/GET round-trip to self-test.

**Automated Verification**:
- [x] `node --test` passes for `sync-worker/worker.test.js` (applyPut accept/409/seed).
- [x] `npm run check` is green (lint + type-check + tests, worker test included).

**Manual Verification**:
- [ ] Following `sync-worker/README.md`, a `curl` PUT with `baseRev:0` stores data and returns
      `rev:1`; a second PUT with a stale `baseRev` returns `409`; GET returns the stored blob.
      *(Requires the owner to deploy the Worker to their own Cloudflare account — see below.)*

### Phase 2: Client sync engine + setup panel + status pill (happy path)

Dependencies: Phase 1.

Make sync actually work for the normal case: connect a device, load on open, save on change, pull
newer from the other device — with a visible status pill. (Conflict handling is Phase 3.)

**Tasks**:
- [x] Add pure `classifyPull(serverRev, lastServerRev, localDirty)` to `logic.js`
      (`serverRev===0 → "seed"`; `serverRev>lastServerRev → localDirty ? "conflict" : "adopt"`;
      else `localDirty ? "push" : "idle"`) and export it.
- [x] Add `classifyPull` table tests to `logic.test.js` (all five outcomes).
- [x] Add a **Sync** section to `todos.html`'s inline script:
  - [x] `todo_sync_cfg_v1` load/save (`{ url, key }`) and `todo_sync_state_v1`
        (`{ serverRev, syncedSig }`); `syncEnabled()` = config present.
  - [x] `dirty()` = `contentSig(state) !== syncedSig`.
  - [x] `pullRemote()` — `GET`, then switch on `classifyPull(...)`: `seed`/`push` → `pushRemote()`;
        `adopt` → `adoptRemote(data, rev)` (`migrate()` → replace `state` → `reconcileUiAfterStateSwap`
        (gentler than `importData`'s full reset — keeps the current view when it still exists) →
        persist `serverRev`/`syncedSig` → `render()`); `idle` → set pill Synced;
        `conflict` → Phase-2 stub `onSyncConflict()` (pill ⚠, **no overwrite**), replaced in Phase 3.
  - [x] `pushRemote()` — `PUT { baseRev: serverRev, data: state }`; on `200` update
        `serverRev`/`syncedSig`, pill Synced; on network error pill Offline (keep edits); (`409`
        handled in Phase 3).
  - [x] `scheduleSync()` — debounce (~1s) a `pushRemote()`; called from `save()` **only when the
        content signature changed** (reuse the existing `sig !== lastSig` branch).
  - [x] `startSyncLoop()` — `setInterval(pullRemote, ~5000)` (only while the tab is visible) +
        `visibilitychange`/`focus`/`online` → `pullRemote()`; started at boot only when `syncEnabled()`.
- [x] Hook `scheduleSync()` into `save()` (guarded by `syncEnabled()`), and call the boot pull +
      `startSyncLoop()` next to the existing `checkNotes()` at the end of the script.
- [x] Add `#syncPill` to the topbar (before `#navToggle`); `setSyncStatus(state)` toggles
      Synced ✓ / Saving… / Offline; hidden when sync is not configured. Clicking it opens the Sync
      modal.
- [x] Add a **"Sync…"** entry in `renderData(...)` (sidebar + mobile sheet, per-instance handlers
      like the other Data actions) that opens the Sync modal.
- [x] Add `#syncModal` (+ `#syncScrim`): fields for Worker URL + secret key, **Save & connect**,
      **Disconnect**, and a **Test connection** button that does a `GET` and reports OK/failed.
- [x] Add design-system tokens/rules for the status pill; document it in
      `docs/design-system.md` and note the sync layer + new localStorage keys in `CLAUDE.md`.

**Automated Verification**:
- [x] `logic.test.js` covers all five `classifyPull` outcomes and passes.
- [x] `npm run check` is green.
- [x] *(Extra)* A jsdom runtime smoke test boots the real `todos.html` against a mock Worker (using
      the real `applyPut`) and confirms: boots clean + pill hidden unconfigured; connect → **seed** →
      Synced (rev 1); other device ahead → **adopt** (rev 2); local edit + server ahead → conflict
      **holds without overwriting** (pill ⚠). Debug traces match the plan's spec exactly.

**Manual Verification**:
- [ ] With the Worker from Phase 1: open the app in browser A, enter URL + key in the Sync panel →
      pill shows **Synced ✓**; add a todo → pill flicks **Saving…** then **Synced ✓**.
- [ ] Open browser B (fresh profile), enter the same URL + key → B loads A's data within seconds.
- [ ] Add/edit in A; within ~5s (or on focusing B) it appears in B, and vice-versa — no manual step.
- [ ] Turn off the network → pill shows **Offline**, the app stays fully usable; restore network →
      it returns to **Synced ✓** and the edit propagates.
- [ ] Leaving the Sync panel empty → the app behaves exactly as before (no pill, no network calls).

### Phase 3: Conflict safety (never silently overwrite) + offline robustness

Dependencies: Phase 2.

Deliver the anti-"mess" guarantee: a real conflict asks the owner instead of guessing, and offline
edits reconcile safely on reconnect.

**Tasks**:
- [x] `pushRemote()` — handle `409 { rev, data }`: set pill **⚠ needs attention** and open the
      conflict banner with the server's newer copy (do **not** overwrite).
- [x] `pullRemote()` — replace the Phase-2 TODO: on `classifyPull(...) === "conflict"` (server moved
      ahead **and** local is dirty) open the conflict banner (do **not** adopt or overwrite). Added a
      `if (syncConflict) return;` guard so an on-screen conflict isn't re-pulled over while deciding.
- [x] Add `#syncBanner` (reuse the `.imp-banner` styling family) showing a short summary
      (this device vs cloud: todo counts + last-changed times, via `fmtStamp`) and two buttons:
  - [x] **Use the newer version** → `adoptRemote(serverData, serverRev)` (migrate + replace + reset
        `ui` + persist + `render`), pill Synced.
  - [x] **Keep mine** → `keepMineOverwrite(serverRev)`: `PUT { baseRev: serverRev, data: state }`
        (based on the server's current `rev`, so it now wins), then persist `serverRev`/`syncedSig`,
        pill Synced.
- [x] Offline robustness: on the `online` event and on each poll, if `dirty()` and status was
      Offline, retry `pushRemote()` (via the pull's `"push"` verdict, which re-enters the same
      409/conflict path if the other device moved on).
- [x] Ensure every sync `fetch` is wrapped so a failure only sets **Offline** and never throws into
      `render()` (mirror `checkNotes()`), and that `Escape` / scrim close the modal (the banner is a
      required choice and intentionally persists, like `.imp-banner`).
- [x] Add design-system rules for the conflict banner; finalize `CLAUDE.md` (Architecture notes:
      the concurrency model, new localStorage keys, `classifyPull`; Roadmap: Phase 2 done) and add a
      short "Setting up sync" note pointing at `sync-worker/README.md`.

**Automated Verification**:
- [x] `npm run check` is green.
- [x] *(Extra)* The jsdom runtime harness drives the whole conflict lifecycle: banner shown with
      **Use the newer version** / **Keep mine**; Keep mine → our copy wins (rev 4, other device's edit
      dropped); a fresh conflict → Use the newer version → adopt cloud (rev 5), local un-pushed edit
      replaced; offline edit → pill Offline + edit kept → reconnect → pushed to cloud → Synced.

**Manual Verification**:
- [ ] Force a conflict: load A and B (both connected & in sync); take B **offline**; edit in B;
      edit **something different** in A (A pushes, server `rev` advances); bring B **online** →
      B shows the conflict banner (not a silent overwrite).
- [ ] From the banner, **Use the newer version** → B adopts A's copy and returns to Synced ✓.
- [ ] Re-run the conflict, choose **Keep mine** → B's copy wins; A pulls it within seconds.
- [ ] Throughout, no edit is ever lost without the banner appearing first.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- **Status: ready.** Reviewed and approved by the owner on 2026-07-25 (phase scoping, the ~5s poll
  interval, and Sync-panel/conflict-banner wording all confirmed). Cleared for implementation.
- **Implemented 2026-07-25** on branch `feat/auto-sync`. All three phases' code + automated
  verification are done and green (`npm run check`: lint + type-check + 24 `logic`/`worker` tests).
  What was built:
  - **Worker** (`sync-worker/worker.js` + `worker.test.js` + `README.md`): service-worker format with
    a `module.exports` guard (mirrors `logic.js`) so the pure `applyPut` is Node-tested; bearer auth
    (constant-time compare), CORS, `GET/PUT /todos`. Chose service-worker format over ES-module so
    the same file is both a live Worker and a `require()`-able test target, per the plan's guard.
  - **Client** (`todos.html` Sync section) + pure `classifyPull` in `logic.js`: status pill, setup
    modal, debounced push hooked into `save()`, ~5s visible-only poll + focus/online wake, adopt with
    a gentler-than-import `reconcileUiAfterStateSwap`, and the conflict banner.
  - **Docs**: `CLAUDE.md` (Architecture + Roadmap), `docs/design-system.md` (pill + banner).
  - **Extra safety net beyond the plan:** a jsdom runtime harness (kept in the throwaway
    `/home/sandbox/jsdom-check`, *not* committed) boots the real `todos.html` against a mock Worker
    using the real `applyPut` and asserts the whole lifecycle end-to-end — all green.
- **Deviations from the plan (minor):** (1) Worker is service-worker format (not ES-module) to keep
  the `module.exports` test guard the plan asked for. (2) The conflict banner intentionally does *not*
  close on Escape/scrim — it's a required choice (consistent with the non-dismissable `.imp-banner`);
  the setup *modal* does close on both. (3) Offline-retry is handled by the existing pull `"push"`
  verdict rather than a separate retry path (same effect, less code).
- **Remaining = owner-side manual verification only** (needs a real Cloudflare deploy + two devices):
  Phase 1 `curl` round-trip (per `sync-worker/README.md`), Phase 2 two-browser sync, Phase 3 forced
  conflict. See each phase's Manual Verification checklist.

## References

- Design/brainstorm: approved in-session (Cloudflare Worker + KV, optimistic concurrency, status
  pill, conflict chooser, per-device setup).
- Prior research: `docs/agents/research/2026-07-22-phone-access-and-sync.md` (Path C recommendation,
  Cloudflare vs Supabase/JSONBin/Firebase, iOS storage/API constraints, key-safety notes).
- `CLAUDE.md` — Roadmap "Phase 2: cross-device sync"; Architecture notes (`state`, `save()`,
  `updatedAt`, `migrate()`, `contentSig`); safety-net / `npm run check` gate; git workflow.
- Code: `todos.html:554` (`STORE_KEY`), `:567` (`contentSig`), `:583` (`save`), `:697` (`render`),
  `:466-478` (topbar), `:814` (`renderData`), `:1762`/`:1770` (export/import), `:1822`
  (`checkNotes` silent-fetch pattern), `:1930-1932` (boot).
- `logic.js:199` (`migrate`), `:567`-style `contentSig` reuse; `logic.test.js` (test harness).
