---
date: 2026-08-06T11:43:50+00:00
git_commit: fea8ec355ce473b78faef2a0f23c248f457b892c
branch: main
topic: "Attach JPG/PNG images to todo notes"
tags: [plan, todos-html, drawer, migrate, logic-js, sync]
status: ready
---

# PLAN: Attach JPG/PNG images to todo notes

Let the owner attach pictures (JPG/PNG) to a todo — via file/camera picker, drag-and-drop,
and paste — so a receipt, screenshot or whiteboard photo can live next to the todo's notes.
Images are shrunk on attach, stored inline with the todo (so they sync to all devices and ride
along in JSON backups), viewable full-size, and **deleted automatically when the todo is marked
done** so storage stays naturally bounded.

The app stays a single dependency-free `todos.html` (plus the dev-only `logic.js` safety net).
No new storage backend, no build step, no libraries.

## Acceptance Criteria

- The todo detail drawer has a **Photos** section under Notes.
- JPG/PNG images can be attached three ways: **file/camera picker** (all devices),
  **drag-and-drop** (desktop), and **paste** (desktop, while the drawer is open).
- Non-JPG/PNG files are rejected with a friendly message; nothing else changes.
- Each attached image is **downscaled to ≤1024px on its longest edge and re-encoded as
  JPEG ~70%** before storage (an already-smaller image is not upscaled).
- Images are stored **on the todo inside `state`** (as data-URL strings), so they persist in
  `localStorage`, **sync** through the existing Cloudflare Worker, and are included in
  **JSON export/import** — with no new storage mechanism.
- Thumbnails render in the drawer; each has a **remove (✕)** control. Tapping a thumbnail opens
  a **full-size overlay** that closes via ✕, Esc, or clicking the backdrop.
- A todo card in the list shows a **📎 indicator with count** when it has photos.
- Marking a todo **done immediately and permanently deletes its photos** — no confirmation;
  un-ticking does **not** restore them; the Completed view shows these todos with no photos.
- If browser storage fills up while attaching, the app shows a **friendly message, keeps the
  todo's existing data, and does not crash `render()` or sync**.
- **Sets/groups are untouched** (todos only).
- `migrate()` defaults `images: []` on todos loaded from older data/backups; `npm run check`
  stays green.

## Technical Key Decisions and Tradeoffs

1. **Store images inline in `state` as compressed data-URL strings** (new `todo.images` array).
   - Why: keeps the existing sync + export/import + `localStorage` model intact with zero new
     infrastructure — true to the single-file app. Everything still "travels together".
   - Impact: images are part of `contentSig()` / every `save()` / every sync PUT and every
     backup. Kept small by compression **and** delete-on-done, so this stays cheap in practice.

2. **Downscale to ≤1024px longest edge, JPEG quality ~0.70, via an offscreen `<canvas>`.**
   - Why: the owner chose the "lighter" tier (~60–150 KB per photo). Smaller files → more active
     photos fit, and sync payloads stay small.
   - Impact: PNGs are re-encoded to JPEG (acceptable for receipts/screenshots; transparency is
     flattened onto white). Needs a canvas-based `downscaleImage()` plus a **pure**
     `fitDimensions()` helper in `logic.js` that is unit-tested.

3. **Delete a todo's images immediately + silently when it is marked done.**
   - Why: the owner's rule; keeps total storage naturally bounded so no hard per-todo cap is
     needed.
   - Impact: `toggleDone()` clears `t.images` when completing. Un-ticking cannot restore them.

4. **All three attach methods; view via lightbox + a 📎 card chip.**
   - Why: picker is essential (and the only mobile path); drag-drop + paste are desktop
     conveniences (screenshots); thumbnails alone are too small to read, so tap-to-enlarge.
   - Impact: one shared `addImagesToTodo(t, files)` entry point feeds all three methods.

5. **Guard `localStorage` writes against `QuotaExceededError`.**
   - Why: images are the first thing that can realistically fill the ~5 MB iPhone quota; today
     `save()` calls `setItem` unguarded and would throw into `render()`.
   - Impact: `save()` wraps the write in try/catch and reports success/failure; the attach path
     rolls back the just-added image and shows a friendly message. Mirrors the existing
     "never throw into render()" pattern used by `checkNotes()` / the sync layer.

## Current State

A todo carries a plain-text `notes` string, edited in the detail drawer via a `<textarea>`
(`renderTodoDrawer()`, `todos.html:1665`–`1753`; the Notes field at `todos.html:1730`). There is
no attachment concept.

Data flow (all three sinks receive the whole `state`):

```
   state.todos[]  ──save()──────────▶ localStorage "todo_overview_v1"   (~5 MB on iPhone)
     └─ notes                          contentSig() = JSON.stringify(a/p/g/t/k)  (todos.html:695)
     └─ (images? — new)  ──scheduleSync()──▶ Cloudflare KV { rev, data:state }   (whole state)
                          ──exportData()───▶ todos-backup-*.json                 (whole state)
```

Relevant symbols:
- `migrate(s)` — `logic.js:221`; defaults new fields on load (idempotent). Exported + tested.
- `todoCard(t, opts)` — `todos.html:1295`; builds the list card + its `.t-meta` chips.
- `renderTodoDrawer()` — `todos.html:1665`; builds the drawer body HTML + wires field handlers.
- `toggleDone(t)` — `todos.html:1504`; flips done + handles set-celebration.
- `save()` — `todos.html:711`; bumps `updatedAt` on real change, writes `localStorage`, triggers
  debounced sync. Calls `localStorage.setItem` **unguarded** (`todos.html:719`).
- `closeDrawer()` — `todos.html:1650`; and the global Esc handler at `todos.html:2371`.
- Todo literals are created in `addTodo` (`:1536`), `addTaskToGroup` (`:1525`), the group
  drawer add (`:1888`), and `importTodos` (`:2019`) — none set `images` today.

## Desired End State

```
 ┌─ Todo drawer ───────────────────────────┐
 │ … Title / Area / Project / Set / …       │
 │ Notes                                    │
 │ ┌──────────────────────────────────────┐│
 │ │ Buy the 3/4" washer …                 ││
 │ └──────────────────────────────────────┘│
 │ Photos                                   │
 │ ┌──────┐ ┌──────┐  ┌───────────────────┐│
 │ │[img]✕│ │[img]✕│  │  + Add photos     ││  ← click: picker · drop here · paste
 │ └──────┘ └──────┘  └───────────────────┘│
 │ Created 06 Aug 2026                      │
 └──────────────────────────────────────────┘
      tap thumbnail → full-size overlay (✕ / Esc / backdrop closes)

 List card:  [○] Fix the sink   [Home] │ [Low] [⏱ 2d] [📎 2]
                                                       └ new indicator chip
```

`todo.images` is an array of `{ id, data, addedAt }`, where `data` is a
`data:image/jpeg;base64,…` string produced by the downscaler. It is emptied by `toggleDone()`
on completion, defaulted by `migrate()`, and flows unchanged through save/sync/export.

## Abstractions and Code Reuse

- Reuse the existing drawer render + wire pattern, the `.chip` family for the card indicator, the
  `.scrim`/overlay pattern (like `#scrim`) for the lightbox, and the "never throw into render()"
  resilience pattern for quota handling.
- Reuse `uid()` (`logic.js:191`) for image ids.
- New pure helper `fitDimensions()` in `logic.js` (testable); new DOM helper `downscaleImage()`
  and one shared `addImagesToTodo()` in `todos.html`.

File tree:

- `logic.js`
  - `fitDimensions(w, h, max)` - **new** pure helper: scaled `{w,h}` preserving aspect ratio,
    never upscaling. JSDoc-typed + exported.
  - `Todo` typedef - add optional `images` property + a new `ImageAttachment` typedef.
  - `migrate(s)` - default `images: []` on every todo (and on the subtask→set converted tasks).
- `todos.html`
  - CSS - `.photos`, `.photo-thumb`, `.photo-thumb .rm`, `.photo-add` (dashed drop zone),
    `.photo-add.drag` (drag-over), `.img-lightbox` overlay; mobile tap-target tweaks.
  - `downscaleImage(file)` - **new**: File → Promise<dataURL> via `<img>` + `<canvas>`,
    using `fitDimensions()`; JPEG `toDataURL("image/jpeg", 0.7)`.
  - `addImagesToTodo(t, files)` - **new** shared entry: filter to JPG/PNG, downscale each, push,
    guarded-save with rollback, re-render drawer + list.
  - `renderTodoDrawer()` - add the Photos section markup + wire picker/remove/thumbnail-open.
  - `openImageLightbox(dataUrl)` / lightbox close - **new**.
  - `todoCard(t, opts)` - add the `📎 N` indicator chip when `t.images.length`.
  - `toggleDone(t)` - clear `t.images` when completing.
  - `save()` - wrap `localStorage.setItem` in try/catch; return boolean success.
  - global Esc handler - also close the lightbox; paste handler (Phase 2).
- `logic.test.js`
  - tests for `fitDimensions()` and `migrate()` defaulting `images`.
- `CLAUDE.md`, `docs/design-system.md` - document the new field + Photos UI.

## Logging & Observability

Match the app's existing `console.debug` breadcrumbs (as sync/notes do). On a quota failure:
`console.debug("images: storage full — rolled back attachment")` plus a user-facing `alert()`.
No other observability changes.

## Implementation

### Phase 1: Attach → shrink → store → view → auto-cleanup (picker path)

Dependencies: None.

Delivers the entire feature through the file/camera picker: data model, compression, the drawer
Photos section, thumbnails + remove, the full-size lightbox, delete-on-done, the card indicator,
and graceful storage-full handling.

**Tasks**:
- [x] `logic.js`: add the `ImageAttachment` typedef and an optional `images` property to the
  `Todo` typedef:
  ```js
  /** @typedef {Object} ImageAttachment
   *  @property {string} id
   *  @property {string} data   // "data:image/jpeg;base64,…" (downscaled)
   *  @property {number} addedAt */
  // Todo: @property {ImageAttachment[]} [images]
  ```
- [x] `logic.js`: add and export the pure `fitDimensions()`:
  ```js
  /** @param {number} w @param {number} h @param {number} max
   *  @returns {{w:number,h:number}} Scaled to fit `max` on the longest edge; never upscaled. */
  function fitDimensions(w, h, max) {
    const longest = Math.max(w, h);
    if (longest <= max) return { w: Math.round(w), h: Math.round(h) };
    const k = max / longest;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  ```
  Add `fitDimensions` to the `module.exports` list (`logic.js:256`).
- [x] `logic.js` `migrate()`: default `images` on every todo (covers old data + backups), e.g. in
  the existing per-todo loop add `if (!Array.isArray(t.images)) t.images = [];`, and add
  `images: []` to the subtask→set converted-task literal (`logic.js:243`) so it's consistent.
- [x] `todos.html`: add `IMG_MAX_EDGE = 1024` and `IMG_QUALITY = 0.7` constants, and
  `downscaleImage(file)` returning a Promise<dataURL> that loads the file into an `<img>`, sizes a
  `<canvas>` via `fitDimensions(img.naturalWidth, img.naturalHeight, IMG_MAX_EDGE)`, draws, and
  returns `canvas.toDataURL("image/jpeg", IMG_QUALITY)`. Reject on load error.
- [x] `todos.html` `save()`: wrap the `localStorage.setItem` write in try/catch; on
  `QuotaExceededError` return `false` (and `console.debug`) instead of throwing; return `true`
  on success. Callers that ignore the return keep working unchanged.
- [x] `todos.html`: add `addImagesToTodo(t, files)` — the single shared entry:
  filter `files` to `type === "image/jpeg" || type === "image/png"` (alert + skip others),
  `await downscaleImage()` each, push `{ id: uid(), data, addedAt: Date.now() }` to `t.images`;
  after each push call `save()` and, if it returns `false` (quota), pop the image back off and
  `alert("Storage is full — that photo couldn't be saved. Mark some done todos complete to free space.")`,
  then stop. Finish with `renderDrawer(); render();`.
- [x] `todos.html` `renderTodoDrawer()`: add a **Photos** field after Notes (before the Created
  line, `todos.html:1734`) rendering `t.images` as `.photo-thumb` items (each with an `✕` remove
  button) plus a `.photo-add` control containing a hidden
  `<input type="file" accept="image/png,image/jpeg" multiple>` and the "＋ Add photos" label.
  Wire: the add control opens the file input; the input's `onchange` calls
  `addImagesToTodo(t, e.target.files)` then clears its value; each `✕` removes that image by id
  and calls `save(); renderDrawer(); render();`; each thumbnail's click calls
  `openImageLightbox(img.data)`.
- [x] `todos.html`: add `openImageLightbox(dataUrl)` that builds/reveals a full-screen
  `.img-lightbox` overlay (image + ✕), closing on ✕, backdrop click, and Esc. Extend the global
  Esc handler (`todos.html:2371`) to close it.
- [x] `todos.html` `todoCard()`: when `t.images && t.images.length`, append a non-editable
  `📎 <n>` chip to `.t-meta` (title `"n photo(s)"`).
- [x] `todos.html` `toggleDone(t)`: when completing (`t.done` becomes true), set `t.images = []`
  (before/after the set-celebration logic; order doesn't matter).
- [x] `todos.html` CSS: add `.photos` (flex-wrap grid), `.photo-thumb` (fixed ~72px box,
  `object-fit: cover`, rounded, `--line` border) with an absolutely-positioned `.rm` ✕ button,
  `.photo-add` (dashed `--line-strong` drop zone, `--ink-faint` text) + `.photo-add.drag` hover
  state (reserved for Phase 2), and `.img-lightbox` (fixed inset, dark scrim, centered
  `max-width/height: 90%` image, ✕ top-right). Use design tokens only; add ~44px tap sizing under
  the `max-width: 720px` breakpoint.
- [x] `logic.test.js`: add `fitDimensions` tests (landscape, portrait, square, already-smaller =
  no upscale, exact-max boundary) and a `migrate` test asserting a todo lacking `images` gets
  `images: []` and an existing array is preserved.
- [x] `CLAUDE.md`: document `todo.images` in the todo shape + the `migrate()` default, the drawer
  Photos section, and the delete-on-done rule.
- [x] `docs/design-system.md`: document the Photos thumbnails / drop zone / lightbox styling.

**Automated Verification**:
- [x] `npm run check` passes (ESLint + `tsc --noEmit` JSDoc + `node --test`).
- [x] New `fitDimensions` tests pass (including the no-upscale and boundary cases).
- [x] New `migrate` test passes (todo without `images` → `[]`; existing array preserved).

**Manual Verification**:
- [ ] Open a todo, click **＋ Add photos**, pick a JPG and a PNG → both appear as thumbnails;
  re-opening the drawer still shows them (persisted).
- [ ] Picking a non-image file shows the friendly rejection and attaches nothing.
- [ ] Tap a thumbnail → full-size overlay opens; ✕, backdrop click, and Esc each close it.
- [ ] Click a thumbnail's ✕ → that image is removed and stays removed after reopening.
- [ ] The list card shows `📎 N` matching the attached count.
- [ ] Mark the todo done → its photos are gone (drawer + no `📎` chip); un-tick → they do **not**
  come back; the Completed view shows it with no photos.
- [ ] Export a backup, clear the browser store, re-import → photos come back with the todos.
- [ ] (If sync is configured) attach on one device → the photo appears on the other after sync.

### Phase 2: Drag-and-drop + paste (desktop)

Dependencies: Phase 1.

Layer the two desktop attach conveniences onto the shared `addImagesToTodo()` path.

**Tasks**:
- [x] `todos.html`: make the drawer a drop target for files. **(Changed from the plan: instead of
  wiring `.photo-add` per render, the whole open todo drawer (`#drawer`) is the drop target —
  handlers attached once on the persistent element.)** `dragenter`/`dragover` (preventDefault,
  `dropEffect="copy"`, highlight `.photo-add`), `dragleave` (clear only when leaving the drawer),
  `drop` (preventDefault, clear, `addImagesToTodo(currentTodo(), e.dataTransfer.files)`). Only
  intercepts when `dataTransfer.types` includes `"Files"` and a todo drawer is open (`ui.openId`).
- [x] `todos.html`: add a document-level `paste` handler, active only while the todo drawer is
  open (`ui.openId` set), that collects image items from `e.clipboardData.items`
  (`getAsFile()`), and routes them through `addImagesToTodo(currentTodo(), files)`. Guard so it
  never interferes with pasting into the Title/Notes text inputs (ignore when the paste carries no
  image items).
- [x] `todos.html`: made the `.photo-add` drop zone **full-width** (own row under the thumbnails,
  `min-height` bar) per owner feedback, so the side sheet reads as "drop here".
- [x] `CLAUDE.md` / `docs/design-system.md`: note drag-drop + paste as the desktop attach paths
  and the `.photo-add.drag` state.

**Automated Verification**:
- [x] `npm run check` stays green.

**Manual Verification**:
- [ ] With a todo drawer open on desktop, drag a JPG/PNG from Finder onto the drop zone → it
  attaches (and the zone highlights while dragging).
- [ ] Copy a screenshot, then paste (Cmd+V) with the drawer open → it attaches.
- [ ] Pasting text into the Title/Notes fields still works normally and attaches nothing.

## Implementation Notes

- 2026-08-06: Owner confirmed re-encoding PNGs to JPEG is fine — transparent-PNG backgrounds
  flattening onto white is acceptable (no special-casing needed).
- 2026-08-06 (Phase 2 feedback): Owner found a tiny per-tile drop target unresponsive ("takes a
  long time to recognize I'm dragging in; the window doesn't react") and asked for a bigger drop
  area. Resolution: (1) the **entire open todo drawer** is the drop target — `dragenter`/`dragover`
  handlers on the persistent `#drawer` element `preventDefault` immediately, so the browser shows
  the copy cursor and highlights the zone the instant a file enters the side sheet; (2) the
  `.photo-add` zone is now a **full-width bar** on its own row. This supersedes the plan's original
  "wire `.photo-add` per render" approach.

During implementation, document user feedback, problems, and decisions here.

## References

- `todos.html` — `renderTodoDrawer()` (:1665), `todoCard()` (:1295), `toggleDone()` (:1504),
  `save()` (:711), `contentSig()` (:695), global Esc handler (:2371).
- `logic.js` — `migrate()` (:221), `uid()` (:191), exports (:256).
- `docs/design-system.md` — tokens + drawer/scrim patterns.
- `CLAUDE.md` — architecture notes (state shape, migrate, sync, single-file constraint).
