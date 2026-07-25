---
date: 2026-07-25
topic: Automatic cross-device sync (iPhone ↔ Mac) via a tiny Cloudflare store
status: approved-design
supersedes-research: docs/agents/research/2026-07-22-phone-access-and-sync.md (Path C)
---

# Design: Automatic sync between iPhone and Mac

## Problem

The app runs on both the owner's Mac and iPhone (hosted on GitHub Pages), but moving
data between them is **manual**: Export a JSON file on one device, Import it on the other.
The owner finds this cumbersome and — more importantly — is **afraid of forgetting** to
export/import when switching devices, which leaves the two copies out of sync and messy to
reconcile.

The owner's own middle idea ("pre-define an iCloud folder so export is one button press")
is **not achievable on iPhone**: iOS Safari has no File System Access API, so a web app
can never remember or write to a folder automatically. Every export stays a manual
"save to…". That option is therefore off the table.

**Chosen direction:** proper **automatic sync** (this is the roadmap's "Phase 2"). Edit on
either device; it appears on the other within seconds. No export, no import, nothing to
forget.

## Decision summary

- **Store:** a small **Cloudflare Worker + KV** (free tier, no credit card, no bill risk),
  chosen over Supabase (more setup, idle-pause) and over reusing GitHub (would expose a
  GitHub token in a public page).
- **Hosting stays** on GitHub Pages exactly as-is. The Worker is a separate endpoint the
  app calls with `fetch()`.
- **Local-first is preserved.** `localStorage` remains the on-device cache so the app still
  opens instantly and works fully offline. The cloud is synced on top, not instead.
- **Never silently overwrite.** A version guard turns the one dangerous case (offline edit
  vs. a newer cloud) into a single clear question, never a silent loss.
- **Purely additive.** With no Sync settings filled in, the app behaves exactly as today.
  Export/Import stays as backup + escape hatch. Still one dependency-free `todos.html`.

## Architecture

### Components

1. **`todos.html` (client)** — unchanged in spirit. Gains a thin **sync layer** that wraps
   the existing `load()`/`save()` and a small **Sync settings panel**.
2. **Cloudflare Worker (`sync-worker/worker.js`)** — ~30 lines. A tiny HTTP endpoint with
   three responsibilities:
   - `GET /state` → returns `{ version, updatedAt, state }` (or an empty marker if none).
   - `PUT /state` → accepts `{ expectedVersion, updatedAt, state }`; writes **only if**
     `expectedVersion` matches the stored version (optimistic concurrency). On mismatch it
     returns `409 Conflict` with the current `{ version, updatedAt, state }`.
   - Auth: every request must carry `Authorization: Bearer <secret>`; otherwise `401`.
   - CORS: allow the GitHub Pages origin (and `*` is acceptable given the bearer secret).
3. **Cloudflare KV namespace** — stores two keys: the JSON blob and a monotonically
   increasing integer `version`. (The whole `state` is one value, matching today's
   single-blob model — no per-todo records to merge.)

### Data shape stored in KV

```
version   : integer, bumped on every successful PUT
state     : the exact `state` object the app already persists (areas/projects/groups/
            todos/importedKeys/mode/updatedAt)
```

`state.updatedAt` (already the app's "last real change" stamp) is carried for human-readable
"newer/older" messaging; `version` is the machine-truth used for the guard.

### Client sync layer (behavior)

- **On open:** `GET /state`. If cloud `version` is newer than the last version this device
  saw, adopt the cloud `state` (run `migrate()` on it, then `render()`), and remember the
  version. If the device has never synced, adopt whatever the cloud has; if the cloud is
  empty, push the local state up as version 1.
- **On change:** the existing `save()` still writes localStorage immediately (instant, works
  offline). It also schedules a **debounced** (~1s) `PUT /state` carrying the last-seen
  `expectedVersion`.
- **Poll / refocus:** every few seconds, and on `visibilitychange`/`focus`, `GET /state`;
  adopt if newer (and no local unsaved edit is mid-flight).
- **Status pill** in the header reflects sync state:
  `Synced ✓` · `Saving…` · `Offline` · `⚠ needs attention`.

### The conflict guarantee (never silently lose data)

The only risky window is: this device edits (often while **offline**) while the other device
advances the cloud version.

- A `PUT` sends `expectedVersion`. If the Worker's stored version moved ahead, it returns
  `409` with the current cloud state instead of overwriting.
- The client then shows a **non-destructive banner**, never an auto-pick:
  > "Your other device has newer changes. **[Use the newer version]** or **[Keep mine
  > instead]**?"
  - **Use newer** → adopt cloud state (the local unsynced edits are dropped; the banner
    notes this before the choice, and Export/Import remains as a manual rescue).
  - **Keep mine** → re-`PUT` with the now-current `expectedVersion` (force), overwriting the
    cloud deliberately.
- Offline edits queue locally (they're already in localStorage); the next successful online
  `GET`/`PUT` runs them through the same guard.

This keeps the app's whole-blob model (no CRDT/merge complexity) while making the failure
mode a **single explicit choice**, not a silent overwrite.

### Setup & privacy

One-time, delivered as click-by-click steps:

1. Free Cloudflare account (no card).
2. Create a Worker, paste the provided `worker.js`, bind a KV namespace. Get the Worker URL.
3. Generate one long secret key (provided).
4. In the app's new **Sync panel**, paste **Worker URL + secret**, **once per device**.
   Stored in `localStorage` (per device), never in the synced `state` blob.

Privacy posture: the app URL is public but inert without the secret; the secret lives only
on the owner's devices and is sent only to the owner's own Worker as a bearer header. This is
the standard "good enough for a personal todo list" posture documented in the prior research.
Work/Private separation is untouched — the entire state syncs as one unit; nothing crosses
modes.

## What stays the same

- Single dependency-free `todos.html`, opens by double-click, **works fully offline**.
- **Export/Import** remains as backup and escape hatch.
- No build step, no framework in the app. (The Worker is a separate ~30-line file, deployed
  once via Cloudflare's dashboard — not part of the app's runtime dependencies.)
- If the Sync panel is left empty, behavior is **identical to today**.

## Testing strategy

- **Pure logic in `logic.js`** (unit-tested via the existing `npm run check` / `node --test`
  gate): the version/conflict decision as pure functions, e.g.
  - `shouldAdoptRemote(localSeenVersion, remoteVersion)` → boolean
  - `resolveSync({ localVersion, remoteVersion, hasLocalPendingEdit })` → one of
    `adopt-remote` | `push-local` | `conflict` | `noop`
  - These take explicit args (no `ui`/`state` reads), matching the existing pure-function
    pattern (`passesFilters`, `sortTodos`, `groupScore`).
- **Worker**: a small local test / `curl` sequence proving: first PUT creates version 1;
  a stale `expectedVersion` PUT returns 409 with current state; a matching PUT bumps version;
  missing/wrong bearer returns 401.
- **Two-browser manual checklist**: edit in A → appears in B within seconds; go offline in B,
  edit, come back → syncs; force a conflict (edit both offline) → banner appears and both
  choices behave correctly; empty-Sync-panel path → app works exactly as today, fully
  offline.
- All changes ship via **branch → PR → green CI → merge**, so `main` (the live iPhone app)
  never breaks.

## Risks & mitigations

- **Bigger change than usual** — it touches the app's `load()`/`save()` heart and adds a
  first-ever server component. Mitigated by keeping the sync layer additive and thin, gating
  everything behind the Sync panel, and keeping Export/Import as a fallback.
- **Clock skew / bad wall-clock ordering** — avoided by using the KV **`version` integer**,
  not timestamps, as the source of truth for the guard. `updatedAt` is used only for
  human-readable messaging.
- **Secret in a public app** — accepted for personal data; documented; a key-hiding Worker
  already server-side means the KV itself is never directly reachable without the bearer.
- **Cloudflare free-tier limits** — a solo todo app will never approach them; no bill risk
  without a credit card on file.

## Out of scope (YAGNI)

- True live push/websockets (polling every few seconds is enough for one person).
- Per-todo merging / CRDTs (whole-blob model is retained deliberately).
- Multi-user accounts, login screens, sharing.
- Migrating hosting off GitHub Pages.
