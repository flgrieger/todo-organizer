# Design system — todos.html

The visual language for the todo app. **Source of truth: the `:root` CSS block at the top of
`todos.html`.** This file documents it so the agent (and anyone else) applies it consistently
without re-deriving it. If you change a token here, change it in `todos.html` too — and vice
versa. When they disagree, `todos.html` wins.

## Direction

Wise-inspired: **clean, minimal, light theme**. One bright green used **for fills only**;
all text/ink is a deep forest green. Calm, lots of whitespace, soft shadows, rounded corners.

## Mode accent (Work / Private)

The big Work/Private toggle re-tints the **page background** only — the green accent stays the
same in both modes. Keep this subtle; the mode is signalled by a cool vs. warm background, not a
different accent colour.

| Mode | `--bg` | Feel |
|------|--------|------|
| Work | `#f2f6f5` | cool |
| Private | `#f7f5f0` | warm |

## Core tokens (from `:root`)

| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#f5f7f4` | app background (base; overridden per mode above) |
| `--panel` | `#ffffff` | cards, panels |
| `--ink` | `#163300` | forest green — headings & body text |
| `--ink-soft` | `#5a6b52` | muted green-grey — secondary text |
| `--ink-faint` | `#93a08b` | faint text, placeholders |
| `--line` | `#e8ebe4` | hairline borders |
| `--line-strong` | `#d7ddd0` | stronger borders |
| `--accent` | `#9fe870` | **Wise bright green — fills only, never text** |
| `--accent-hover` | `#8edb5c` | accent hover |
| `--accent-ink` | `#163300` | text/icon colour that reads as "brand" on accent |
| `--accent-soft` | `#eafada` | pale green tint for active/selected states |
| `--forest` | `#163300` | strong brand green (focus borders) |
| `--green` | `#2f6b1e` | readable positive-green **text** |
| `--amber` | `#8a6a00` | warning text |
| `--red` | `#b3261e` | danger/overdue text |
| `--radius` / `--radius-sm` | `14px` / `10px` | corner rounding |
| `--shadow` | `0 1px 2px rgba(22,51,0,.05), 0 10px 30px rgba(22,51,0,.07)` | soft green-tinted shadow |
| `--ring` | `0 0 0 3px rgba(159,232,112,.55)` | soft green focus glow |
| `--sans` | system UI stack (`-apple-system, …`) | typeface — **no web fonts** |

## Semantic colour rules

Attribute chips reuse a fixed palette — keep these consistent:

- **Priority:** High = red (`--red` on `#fdeceb`), Med = amber (`--amber` on `#fbf1d3`),
  Low = green (`--green` on `#eaf6df`).
- **Deadline:** overdue = red tint, due-soon = amber tint.
- **Quick win** chip = brighter green; **Long-term** chip = soft green.
- **Area colours** (`AREA_COLORS` in JS) are a separate categorical set of 8 distinct hues —
  used only as small per-area dots, not for text.

## Sync status pill

The optional cross-device sync layer surfaces a small **status pill** in the header (`.sync-pill`,
right of the title, before the "⋯"). It's the owner's at-a-glance trust signal and is **hidden
until sync is configured** on the device. A leading coloured dot (`.sync-dot`) carries the state;
the text label sits beside it (and collapses to just the dot under the 720px breakpoint).

| State | Class | Look | Meaning |
|-------|-------|------|---------|
| Synced | `.is-synced` | `--accent-soft` bg, `--accent` border, `--green` dot | in sync |
| Saving | `.is-saving` | default pill, `--amber` dot | a push is in flight |
| Offline | `.is-offline` | faint (`--ink-faint`) | network unreachable; edits kept locally |
| Needs attention | `.is-attention` | red (`#fdeceb` bg, `--red` border + dot) | a conflict needs a choice |

Rules: reuse the existing tokens (no new colours) — the pill's palette maps onto the same
green/amber/red semantics as the attribute chips. Clicking the pill opens the **Sync setup modal**
(`.modal` — a centered card with its own scrim `#syncScrim`; URL + key fields, Test connection,
Save & connect / Disconnect).

**Conflict banner** (`.sync-banner`, `#syncBanner`). When a real conflict is detected (this device
and the cloud both changed), a red-tinted banner — same layout family as the Notes `.imp-banner`,
red instead of green — appears under the toolbar. It shows a short plain-language summary
(`.sb-sum`: this device vs the cloud — todo counts + when each last changed, via `fmtStamp`) and a
`.sb-actions` row with exactly two buttons: **Use the newer version** (primary/`.btn.primary` — adopt
the cloud copy) and **Keep mine** (plain `.btn` — push this device's copy so it wins). It is a
required decision, so — unlike the modal — it does **not** dismiss on Escape/scrim; it clears only
when a side is chosen (or on disconnect). Nothing is overwritten until one button is clicked.

## Responsive / mobile

Single breakpoint: **`max-width: 720px`** (phone / small tablet). Above it, the desktop
two-column layout with the sidebar is unchanged. Below it:

- **Sidebar is hidden**; navigation moves to two touch surfaces that `renderNav()` fills from the
  *same* data as the sidebar (so they never drift):
  - **Views chip strip** (`.view-chips` / `.view-chip`) under the title — horizontally scrollable
    pills, active state = `--accent-soft` on `--accent` (mirrors `.fb-chip`).
  - **"⋯" bottom sheet** (`.nav-sheet`, slides up via `translateY`, own scrim `#navScrim`,
    `18px 18px 0 0` top radius, `max-height: 82vh`) holding **Areas** (each with its ⋮ menu) and
    the **Data** actions + "last changed" line.
- **⋮ row menu** (`.row-menu`) on every area/project row — visible on **both** desktop and mobile
  (faint `opacity: .55`, full on hover; always-visible + enlarged on touch). Opens Rename / Move /
  Delete in the shared `#pop` popover. This replaced the old hover-only "⇄" and right-click rename.
- **Tap targets** grow to ~44px on mobile via **padding, not font size** (checkbox, card chips,
  nav rows, toolbar controls, filter chips).
- **Form inputs render at `16px`** on mobile (quick-add, `.pop`, `.field`) so iOS Safari doesn't
  auto-zoom the page on focus. Desktop density is unchanged.
- **`100dvh`** (with a `100vh` fallback line before it) on `.app` and `.drawer` so mobile browser
  chrome can't crop content. The detail drawer goes **full-width** under the breakpoint.
- **Header collapses to a slim sticky bar + scroll-away chrome.** Under the breakpoint `.main`
  becomes the scroll container (desktop: only `.list-wrap` scrolls) and the toolbar dissolves
  (`display: contents`) so its regrouped rows become direct children of `.main`. Only the
  **`.stickybar`** — a wrapper holding the **view-chips strip + the quick-add row** — stays pinned
  (`position: sticky; top: 0`) with a solid `--panel` background and a `--line` hairline; the
  **topbar** (mode toggle · title · ⋯), the **Sort/Arrange row** (`.tb-arrange`), and the
  **"Show only" filter bar** scroll away and return at the top. The sticky wrapper must be a
  **direct child of the scroll container** (`.main`), which the `display: contents` toolbar
  guarantees — a sticky element unsticks once its own parent scrolls off. Top paddings are tighter
  than desktop so the at-top chrome is shorter.
- **🗂 New set sits inline** to the right of the quick-add input (`.tb-add` wrapper), **icon-only**
  on mobile (the "New set" text is a `.newset-label` span hidden under the breakpoint — same trick
  as the sync pill's `.sync-label`).
- **The "Show only" filter bar is a single-line horizontal scroll** on mobile
  (`flex-wrap: nowrap; overflow-x: auto`; label/chips/Clear are `flex: none`), instead of wrapping.
- **One DOM, two layouts.** The toolbar rows (`.stickybar`, `.tb-add`, `.tb-arrange`) are
  `display: contents` on desktop, so the toolbar collapses back to **one flat flex row**
  `quick-add | Sort | Arrange | New set` (order restored with flex `order`) — desktop is visually
  unchanged. They become real rows only under the breakpoint.

## Photo attachments (todo drawer)

A **Photos** section sits under Notes in the todo drawer, rendering `todo.images` (downscaled
JPEG data-URLs) as a small thumbnail grid.

- **`.photos`** — a `flex-wrap` grid (8px gap).
- **`.photo-thumb`** — a fixed `72px` box (`84px` on mobile), `object-fit: cover`, `--line`
  border, `--radius-sm`. Holds the image (`cursor: zoom-in`) and an absolutely-positioned
  **`.rm`** remove ✕ (dark circle top-right, `--red` on hover).
- **`.photo-add`** — a **full-width dashed** (`--line-strong`) bar on its own row under the
  thumbnails, in `--ink-faint`; the picker trigger (a `<label>` wrapping a hidden file input) and
  the visible drop hint. **`.photo-add.drag`** is the drag-over state (`--accent` border on
  `--accent-soft`). Attach paths: file/camera picker (all devices), drag-and-drop and paste
  (desktop) — all funnel through one `addImagesToTodo()`. The **entire open todo drawer** is the
  drop target (drag handlers on the persistent `#drawer`, gated on `ui.openId` + `dataTransfer`
  carrying `Files`), so dragging a file anywhere onto the side sheet reacts immediately and
  highlights `.photo-add`; only files are intercepted, so dragging text within Notes is untouched.
- **`.img-lightbox`** — a built-on-demand full-screen overlay (`z-index: 70`, dark scrim) centering
  the image at `max 90%`, with an **`.il-close`** ✕ top-right. Closes on ✕, backdrop click, or Esc
  (Esc dismisses the lightbox first, leaving the drawer open). Uses design tokens only.

Images are **compressed** (≤1024px longest edge, JPEG ~0.70) before storage and **deleted when the
todo is marked done**, so inline storage / sync payloads stay small. A list card shows a
non-editable **`📎 N`** chip when a todo has photos.

## Do / Don't

- **Do** use `--accent` (`#9fe870`) only as a background/fill; put `--accent-ink` text on it.
- **Do** keep text in the forest-green family (`--ink`, `--ink-soft`) — not pure black/grey.
- **Don't** introduce new accent colours per mode; mode = background tint only.
- **Don't** add web fonts or heavy shadows; stay light and system-native.
- **Don't** hard-code hex values in new markup — use the CSS variables above.
