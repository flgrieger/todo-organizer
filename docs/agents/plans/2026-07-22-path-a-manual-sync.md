---
date: 2026-07-22T13:31:05+00:00
git_commit: ""
branch: ""
topic: "Path A — manual iPhone↔Mac sync via iCloud Drive / AirDrop (safeguards + how-to)"
tags: [plan, sync, export-import, migrate, docs]
status: ready
---

# PLAN: Path A — safe manual sync (iCloud Drive / AirDrop)

Make the app's existing **Export / Import backup** flow safe and pleasant to use as a
manual iPhone↔Mac sync channel, and document that workflow in plain language for the owner.

This implements **Path A** from `docs/agents/research/2026-07-22-phone-access-and-sync.md`
("Good enough": manual file via iCloud Drive or AirDrop). The Path A *workflow itself needs
no code* — the owner already exports a JSON file on one device and imports it on the other.
What this plan builds is the **safety net around the one real hazard** the research names:
the whole-blob, last-write-wins import that can silently erase the other device's edits.

Out of scope (explicitly): hosting the app online (Path B) and any automatic cloud sync
(Path C). No backend, no accounts, no build step. The app stays a single dependency-free
`todos.html`.

## Acceptance Criteria

- Every **real data edit** stamps the data with a "last changed" time (`state.updatedAt`).
  Merely opening the app, switching Work/Private mode, sorting, filtering, changing the
  view, or exporting does **not** change that stamp.
- Importing a backup whose stamp is **older** than the device's current data shows a loud,
  dated warning — but still lets the owner proceed (so an old backup can be restored on
  purpose).
- Importing a backup with **no** stamp (an older export made before this feature) shows a
  clear "no timestamp — this file may be older than your current data" confirm.
- Importing a **newer or equal** backup shows a plain confirm (no false alarm).
- Every import confirm shows a **data summary**: todo counts + last-changed dates for the
  current data vs. the incoming file.
- Exports are named `todos-backup-YYYY-MM-DD-HHMM.json` (local device time) so multiple
  same-day backups don't collide or overwrite each other in an iCloud folder.
- The sidebar shows a small **"Last changed …"** freshness line under the Data buttons, so
  the owner can judge how fresh this device is before syncing.
- `NOTES.md` gains a plain-language **iPhone↔Mac manual-sync how-to**: the iCloud Drive and
  AirDrop steps, the "edit one device at a time, let it finish syncing" rule, keeping
  timestamped backups, and what the new in-app safety features do.
- The `state` shape change (`updatedAt`) is handled idempotently by `migrate()` and
  documented in `CLAUDE.md`.
- The app remains a single dependency-free file that works offline.

## Technical Key Decisions and Tradeoffs

1. **The timestamp bumps on *content change*, not on every `save()`.**
   - Why: `save()` runs on every `render()` — including opening the app, toggling mode, and
     changing sort/filter/view. If `updatedAt` bumped on every save, simply opening the
     iPhone would make its data look "newer" than a genuine 9:00 Mac backup, and the
     stale-import guard would cry wolf on a legitimate restore.
   - Impact: `save()` compares a **content signature** of the real data
     (`areas`, `projects`, `groups`, `todos`, `importedKeys`) against the last-saved
     signature; only when they differ does it set `state.updatedAt = Date.now()`. `mode`
     and all `ui` view state are excluded from the signature.

2. **Compare the *raw* incoming `updatedAt` (before `migrate()` touches it), and re-baseline
   the content signature right after import.**
   - Why: `importData()` calls `migrate(parsed)`, and `migrate()` will default a missing
     `updatedAt`. We must read the file's own stamp *before* that so a stamp-less old file
     is still detected as "unknown". After swapping `state`, the immediate `render()→save()`
     must not overwrite the imported file's stamp with `Date.now()`.
   - Impact: capture `const incoming = parsed.updatedAt` before `migrate()`; after
     `state = migrate(parsed)`, reset the module-level `lastSig` to the new content so the
     next `save()` sees "no change" and preserves the imported `updatedAt`.

3. **Warn-but-allow on older imports; never hard-block.**
   - Why: the owner must always be able to restore an older backup on purpose. A blocked
     import with no escape hatch would be a worse failure than an accidental overwrite.
   - Impact: the older-file branch uses a strongly-worded, dated `confirm()` that returns
     control to the owner.

4. **Keep the native `confirm()` dialog (multi-line message) — no custom modal.**
   - Why: preserves the single-file, dependency-free, minimal spirit. A multi-line
     `confirm()` string is enough to carry the warning + data summary.
   - Impact: the message is built as a `\n`-joined string; no new DOM/CSS for a modal.

## Current State

The whole app persists to one JSON blob in `localStorage`. The Path A pieces already exist:

```
  load()        todos.html:457   raw → migrate(JSON.parse) → state   (per device, not shared)
  migrate(s)    todos.html:466   idempotent upgrader; runs on load AND import
  save()        todos.html:500   localStorage.setItem(STORE_KEY, JSON.stringify(state))
  render()      todos.html:652   renderNav + renderFilterBar + renderList + save()

  exportData()  todos.html:1498  Blob(JSON.stringify(state)) → download
                                  filename: "todos-backup-" + todayISO() + ".json"
  importData()  todos.html:1506  FileReader → JSON.parse → confirm(one generic line)
                                  → state = migrate(data) → reset ui → render()
```

The hazard (last-write-wins whole-blob replace), unguarded today:

```
   Mac  edit 9:00 ──export──► todos-backup-2026-07-22.json
   iPhone edit 10:00 (unrelated todos) …
   iPhone imports the 9:00 file  ──►  the 10:00 edits are GONE. No warning.
```

`save()` is called from `render()`, so it fires constantly — this is exactly why the
timestamp cannot live inside a naive `save()`.

The sidebar "Data" group is static HTML (`todos.html:370-376`) and is **not** rewritten by
`renderNav()` (which only rebuilds `#viewNav` and `#areaNav`), so a new element added there
persists across renders and can be updated directly.

## Desired End State

```
  save()  ── content changed? ──► yes: state.updatedAt = Date.now()
                                  no : keep existing updatedAt   (open/mode/sort/filter = no bump)

  Export ──► todos-backup-2026-07-22-1435.json      (date + local HHMM)

  Sidebar › Data:
     📥 Check Notes
     ⬇ Export backup
     ⬆ Import backup
     Last changed 2h ago            ◄── new freshness line

  Import a file ──► confirm() shows, e.g.:

     ⚠️ This backup is OLDER than the data on this device.
     Importing will REPLACE your newer data with this file.

     This device:  42 todos · last changed today 10:00
     Backup file:  40 todos · last changed today 09:00

     Import anyway and replace current todos?           [Cancel] [OK]
```

`NOTES.md` gains an owner-facing "Getting your todos on your phone" section describing the
iCloud Drive / AirDrop workflow, the one golden rule, and these safety features.

## Abstractions and Code Reuse

Reuses: `migrate()` (extend to default `updatedAt`), `save()` (add the content-signature
bump), the existing `confirm()`-based import gate, `todayISO()`/date helpers, and the
sidebar Data nav-group.

New small helpers (all local to the `<script>`):
- `contentSig(s)` — stable JSON signature of the real data (excludes `mode` + `updatedAt`).
- `nowStampFilename()` — `YYYY-MM-DD-HHMM` in local time for the export filename.
- `fmtRelative(ms)` — "just now / 5m ago / 2h ago / 3d ago / <date>" for the freshness line.
- `fmtStamp(ms)` — short absolute date+time for the import summary; handles unknown (0).

- `todos.html`
  - `migrate(s)` — default `s.updatedAt` when missing (to `0` = unknown).
  - `seed()` — set `updatedAt: Date.now()` on fresh data.
  - `save()` — content-signature comparison; bump `updatedAt` only on real change.
  - module scope — add `let lastSig = contentSig(state);` right after `state = load()`.
  - `exportData()` — timestamped filename via `nowStampFilename()`.
  - `importData(file)` — capture raw incoming stamp; branch older/unknown/normal; build
    multi-line confirm with data summary; re-baseline `lastSig` after swap.
  - sidebar Data group markup — add `<div id="lastChanged" class="last-changed"></div>`.
  - `render()` (or `renderNav()`) — call `updateFreshness()` to refresh the line.
  - `<style>` — one small `.last-changed` rule.
- `CLAUDE.md` — document `updatedAt` in the state shape + the `migrate()` default.
- `NOTES.md` — new owner-facing manual-sync how-to section.

## Logging & Observability

No logging changes. This is a local, offline, single-user app; the observable surface is
the import `confirm()` dialog and the sidebar freshness line described above.

## Implementation

### Phase 1: Safety core — timestamp + stale-import guard  [x]

Dependencies: None

Add a content-change timestamp and turn the single generic import confirm into a
branching, dated warning with a data summary. This is the phase that actually prevents
silent data loss.

**Tasks**:
- [x] Add `contentSig()` and the `lastSig` baseline. After `let state = load();`
  (`todos.html:454`), add a signature helper and initialise the baseline:
  ```js
  // Signature of the REAL data only (view prefs like mode/sort/filter are excluded), so
  // updatedAt bumps on genuine edits — not on merely opening the app or changing the view.
  function contentSig(s) {
    return JSON.stringify({ a: s.areas, p: s.projects, g: s.groups, t: s.todos, k: s.importedKeys });
  }
  let lastSig = contentSig(state);
  ```
- [x] In `seed()` (`todos.html:514` return object) add `updatedAt: Date.now(),` so brand-new
  data starts with a known stamp.
- [x] In `migrate(s)` (**now lives in `logic.js`**, not `todos.html:466` — the safety-net
  refactor moved it) default a missing stamp to `0` (= unknown), so
  stamp-less old backups stay detectable as "unknown" rather than being silently stamped:
  ```js
  if (typeof s.updatedAt !== "number") s.updatedAt = 0;
  ```
- [x] Rewrite `save()` (`todos.html:500`) to bump only on real change:
  ```js
  function save() {
    const sig = contentSig(state);
    if (sig !== lastSig) { state.updatedAt = Date.now(); lastSig = sig; }
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  ```
- [x] Add `fmtStamp(ms)` near the date helpers (`todos.html:538`): returns a short
  `"today 10:00"` / `"Jul 21 14:35"` style string, and `"unknown"` when `ms` is falsy/`0`.
- [x] Rewrite `importData(file)` (`todos.html:1506`) to capture the raw stamp, branch, and
  re-baseline:
  ```js
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.areas || !data.todos) throw new Error("bad file");
        const incoming = typeof data.updatedAt === "number" ? data.updatedAt : 0;  // RAW, pre-migrate
        const current  = state.updatedAt || 0;
        const summary =
          `\n\nThis device:  ${state.todos.length} todos · last changed ${fmtStamp(current)}` +
          `\nBackup file:  ${data.todos.length} todos · last changed ${fmtStamp(incoming)}`;
        let msg;
        if (incoming && current && incoming < current) {
          msg = "⚠️ This backup is OLDER than the data on this device.\n" +
                "Importing will REPLACE your newer data with this file." + summary +
                "\n\nImport anyway and replace current todos?";
        } else if (!incoming) {
          msg = "This backup has no timestamp, so it may be older than your current data." +
                summary + "\n\nThis replaces your current todos. Continue?";
        } else {
          msg = "This replaces your current todos with the backup." + summary + "\n\nContinue?";
        }
        if (!confirm(msg)) return;
        state = migrate(data);
        lastSig = contentSig(state);   // preserve the imported stamp; next save() sees no change
        ui = { view: "all", areaId: null, projectId: null, sort: ui.sort, group: ui.group,
               openId: null, openGroupId: null, filters: noFilters(), mode: state.mode || "work" };
        render();
      } catch (e) { alert("Could not read that file. Make sure it's a backup exported from this app."); }
    };
    reader.readAsText(file);
  }
  ```
- [x] Update `CLAUDE.md` Architecture notes: add `updatedAt` (a number, ms) to the documented
  `state` shape, and note that `migrate()` defaults it to `0` (unknown) and that `save()`
  bumps it only when the real data changes.
- [x] (added) `logic.test.js` — new test covering `migrate()`'s `updatedAt` default (0 when
  missing, preserved when present), keeping the pure-logic change under the green gate.

**Automated Verification**:
- [x] JS syntax valid — `npm run check` green on the owner's Mac (16/16 tests):
  `sed -n '/^<script>/,/^<\/script>/p' todos.html | sed '1d;$d' > /tmp/app.js && node --check /tmp/app.js && rm /tmp/app.js`
  — also run the full gate: `npm run check`
- [x] New symbols present:
  `grep -q "contentSig" todos.html && grep -q "updatedAt" todos.html && grep -q "OLDER than the data" todos.html`
- [x] `CLAUDE.md` mentions the new field: `grep -q "updatedAt" CLAUDE.md`

**Manual Verification**:
- [x] Open `todos.html`, edit a todo, then Export. Open the file's JSON and confirm
  `updatedAt` is a recent timestamp.
- [x] Reload the app **without** editing (just open, switch mode, change sort/filter), Export
  again, and confirm `updatedAt` is unchanged from the previous export (no false bump).
- [x] Export file **A**. Edit a todo (this bumps the stamp) and Export file **B**. Import
  **A** (older): the dialog shows the ⚠️ OLDER warning with both dates and lets you proceed.
  Import **B** (newer): plain confirm, no warning.
- [x] Import a hand-edited backup with `updatedAt` removed: the "no timestamp — may be older"
  confirm appears.

### Phase 2: Freshness UX + owner how-to  [x]

Dependencies: Phase 1

Round out the user-facing workflow: timestamped export filenames so same-day backups don't
collide, a sidebar "Last changed …" line so the owner can gauge freshness before syncing,
and the plain-language sync guide that ties it all together for a non-developer.

**Tasks**:
- [x] Add `nowStampFilename()` near the date helpers: returns `YYYY-MM-DD-HHMM` in **local**
  time (zero-padded hours/minutes).
- [x] Update `exportData()` (`todos.html:1502`):
  `a.download = "todos-backup-" + nowStampFilename() + ".json";`
- [x] Add `fmtRelative(ms)` near the date helpers: `"just now"` (< 1 min), `"Nm ago"`,
  `"Nh ago"`, `"Nd ago"` (up to ~6 days), else a short absolute date; `"—"` when `ms` is `0`.
- [x] Add the freshness element to the sidebar Data group (`todos.html:370-376`), after the
  Import button/file input:
  ```html
  <div id="lastChanged" class="last-changed"></div>
  ```
- [x] Add a small style rule in `<style>` (near the sidebar rules):
  ```css
  .last-changed { font-size: 11px; color: var(--ink-faint); padding: 8px 8px 0; }
  ```
- [x] Add `updateFreshness()` and call it from `render()` (`todos.html:652`) **after
  `save()`** — `save()` runs last in `render()` and is what bumps `state.updatedAt`, so
  calling it earlier would show the pre-edit value (off by one render):
  ```js
  function render() {
    renderNav();
    renderFilterBar();
    renderList();
    save();
    updateFreshness();   // after save(): reads the just-bumped state.updatedAt
  }
  function updateFreshness() {
    const elm = $("#lastChanged");
    if (elm) elm.textContent = state.updatedAt ? "Last changed " + fmtRelative(state.updatedAt) : "";
  }
  ```
- [x] Add a **"Getting your todos on your phone (manual sync)"** section to `NOTES.md`, in the
  same plain-language style as the existing "Importing todos from Apple Notes" section.
  Cover:
  - The workflow: Export on device 1 → move the file → Import on device 2. Two ways to move
    it: **iCloud Drive/Files** (Export saves into an iCloud folder; Import browses to it) and
    **AirDrop** (drag the exported `.json` from Mac Finder onto the iPhone — no internet/
    account needed).
  - The **golden rule**: edit on **one device at a time**, and let it finish syncing before
    switching. This single habit prevents almost all data loss.
  - Keep **timestamped backups** (the export filename now includes date + time) so an older
    file can rescue you.
  - What the app now does for you: the **older-file warning** on import (with both dates),
    the **data summary** in the import dialog, and the **"Last changed …"** line in the
    sidebar.
  - A one-line note that this is the "good enough" manual path; true automatic phone↔Mac
    sync is a separate, later step (Path C in the research doc), and the JSON export is the
    bridge to it.

**Automated Verification**:
- [x] JS syntax still valid — `npm run check` green on the owner's Mac:
  `sed -n '/^<script>/,/^<\/script>/p' todos.html | sed '1d;$d' > /tmp/app.js && node --check /tmp/app.js && rm /tmp/app.js`
- [x] New pieces present:
  `grep -q "nowStampFilename" todos.html && grep -q "lastChanged" todos.html && grep -q "fmtRelative" todos.html`
- [x] `NOTES.md` covers the workflow: `grep -qi "AirDrop" NOTES.md && grep -qi "one device at a time" NOTES.md`

**Manual Verification**:
- [x] Click **Export backup**: the downloaded file is named
  `todos-backup-YYYY-MM-DD-HHMM.json` with the current local date and time.
- [x] The sidebar shows **"Last changed …"** under the Data buttons; edit a todo and confirm
  the line updates to "just now"; reload and confirm it still reflects the last real edit
  (not the reload).
- [x] Read the new `NOTES.md` section as the owner would: the iCloud/AirDrop steps and the
  "edit one device at a time" rule are clear without jargon.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- **2026-07-23 — pre-existing timezone bug surfaced by `npm run check` on the owner's Mac
  (CEST/UTC+2).** After the feature edits, `npm run check` was green on lint + typecheck +
  the new `updatedAt` migrate test, but 3 **pre-existing** date tests failed
  (`daysUntil` / `fmtDue` / `isLongTerm`), all off-by-one. Root cause was **not** this
  feature: the test helper `shiftFromToday()` in `logic.test.js` serialized a locally-shifted
  date via `toISOString()` (UTC), which rolls the date back a day in any timezone ahead of
  UTC — so the suite passed in UTC/CI but failed on a German-timezone Mac. Fixed by formatting
  the date from **local** components (`getFullYear`/`getMonth`/`getDate`), matching how the app
  reads dates (`daysUntil` parses `iso + "T00:00:00"` as local). No production code changed.
- **Related latent production issue — FIXED (owner approved 2026-07-23):** `todayISO()` in
  `logic.js` used `new Date().toISOString().slice(0,10)` = the **UTC** date. In a positive-offset
  timezone, between local midnight and the UTC rollover (e.g. 00:00–02:00 CEST) it returned
  *yesterday*, so "Today/Tomorrow/overdue" day counts could be off near midnight. Changed to
  build from **local** date parts (matching how `daysUntil` parses `iso + "T00:00:00"`), and
  added a `logic.test.js` test pinning `todayISO()` to the local date. Not part of Path A, but
  fixed alongside since the same timezone class of bug surfaced the failing tests.

## References

- Research: `docs/agents/research/2026-07-22-phone-access-and-sync.md` — Path A section and
  the "overwrite trap" + "last modified" safeguard suggestion.
- `todos.html:457` `load()`, `:466` `migrate()`, `:500` `save()`, `:1498` `exportData()`,
  `:1506` `importData()`, `:370-376` sidebar Data group.
- `CLAUDE.md` — Architecture notes (state shape, `migrate()`), Roadmap ("JSON export carries
  data across" = Path A).
- `NOTES.md` — owner-facing plain-language notes; existing "Importing todos from Apple Notes"
  section is the style model for the new sync how-to.
