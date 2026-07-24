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

## Do / Don't

- **Do** use `--accent` (`#9fe870`) only as a background/fill; put `--accent-ink` text on it.
- **Do** keep text in the forest-green family (`--ink`, `--ink-soft`) — not pure black/grey.
- **Don't** introduce new accent colours per mode; mode = background tint only.
- **Don't** add web fonts or heavy shadows; stay light and system-native.
- **Don't** hard-code hex values in new markup — use the CSS variables above.
