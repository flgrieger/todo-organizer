# Safety Net: Linting, Typing & Testing for the Business Rules

**Date:** 2026-07-22
**Status:** Approved design — ready for implementation plan
**Scope:** Tier 1 only (business-rule extraction + dev toolbox). Tiers 2 & 3 deferred.

## Goal

Add a **durable, automatic safety net** around the todo app so future changes — by
the owner or by an AI agent — can't silently break the app's core rules. The net has
three checks: **linting** (clean code), **typing** (pieces fit), **testing** (behaves
correctly), unified behind one command that acts as a "green gate."

This is an *ongoing safety net*, not a one-time learning exercise: the checks must keep
protecting the app going forward, and are primarily meant to be run **by the AI agent
as a gate before it hands the owner a change** (the "backpressure gate" concept).

## Non-negotiable project constraints (preserved)

- The app still **ships as plain files with no build step** and opens by
  **double-clicking `todos.html`** (works on the `file://` protocol).
- **No framework, no backend, no bundler.** The dev toolbox is a *dev-only add-on*
  (like `notes-helper/`), not a runtime dependency of the app.
- The strict **Work/Private separation** remains a first-class, tested invariant.

## Why a refactor comes first

Type-checking (`tsc`) and clean testing require the JavaScript to live in a real `.js`
file — the tools **cannot** read JS trapped inside the HTML's `<script>` tag. So a small
extraction is the necessary prep, not optional polish.

Because *moving code is itself a chance to break things*, the sequence is deliberate:
1. Extract the **pure rule functions** (mechanical, low-risk — they never touch the DOM).
2. Get **tests green** around them.
3. Only *then* consider further refactoring (Tiers 2/3), now protected by the net.

## Architecture

### New file layout (all plain, no build)

```
todos.html        # unchanged UI + render code; loads logic.js via one <script> line
logic.js          # extracted pure rule functions (dual-mode: browser global + Node-importable)
logic.test.js     # tests for the rules in logic.js
package.json      # dev toolbox: scripts + 2 dev dependencies (typescript, eslint)
tsconfig.json     # type-check plain JS via JSDoc (checkJs + noEmit — no build output)
eslint.config.js  # small, quiet rule set
```

### What moves into `logic.js`

Only **pure functions that do not touch the page** (no `document`, no `render()`), plus
the constants they depend on:

- Functions: `migrate`, `daysUntil`, `fmtDue`, `fmtEst`, `noFilters`, `anyFilterActive`,
  `passesFilters`, `smartScore`, `groupScore`, `sortTodos`, `isQuickWin`, `isLongTerm`.
- Constants they need: `LONGTERM_DAYS`, `FILTERS`, `HIDE_LT` (and any other pure
  constants these functions reference).

Note: `anyFilterActive`/`passesFilters` read `ui.filters`; the extracted versions must
take their inputs as **parameters** (e.g. `passesFilters(todo, filters)`) so they are
pure and testable, with `todos.html` passing `ui.filters` at the call site. Any function
found to depend on DOM or on module-level mutable app state stays in `todos.html`; the
final extracted list is confirmed during implementation.

`todos.html` keeps calling these functions exactly as before (they remain available as
globals — see dual-mode).

### The dual-mode trick (loads on `file://` AND is testable)

`logic.js` is a **classic script** (not an ES module — ES modules are blocked on
`file://`). It defines its functions/constants as normal declarations (so they attach to
the global scope when loaded in the browser via `<script src="logic.js"></script>`), and
ends with:

```js
// Export for Node-based tests; harmless/ignored in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { migrate, daysUntil, /* ...all extracted names... */ };
}
```

In the browser, `module` is undefined, so the block is skipped and the functions are
plain globals. In Node's test file, `require('./logic.js')` returns the exports. Same
file, both worlds, no build.

`todos.html` loads `logic.js` **before** its own inline `<script>`, so the globals exist
when the inline code runs.

## The three checks

### Testing — Node's built-in runner (`node --test`), zero extra packages

`logic.test.js` uses `node:test` + `node:assert`. Cover the rules whose silent breakage
would hurt most:

- **Work/Private separation** invariants that live in the pure layer (e.g. a set/group is
  wholly work or wholly private via inherited `areaId`; migrate preserves scope).
- **Quick Win** threshold: `isQuickWin` true only when `priority >= 2` AND `minutes <= 30`
  (boundary cases at 30 min and Medium priority).
- **Long-term** threshold: `isLongTerm` true when `longterm === true` OR deadline is
  `>= LONGTERM_DAYS` (60) out; boundary at exactly 60 days.
- **Filter AND-logic**: `passesFilters` narrows only when a filter is active and every
  active filter passes.
- **Smart sort**: `smartScore` / `sortTodos` ordering for a few representative todos.
- **`migrate()`**: (a) **idempotent** — running twice equals running once; (b) the
  **subtask → set(group) conversion** is lossless (title + `done` preserved, `subtasks`
  removed, group created with correct `areaId`/`projectId`); (c) adds missing defaults
  (`scope`, `mode`, `longterm:false`, `importedKeys:[]`, `groups:[]`, nullable `groupId`).

### Typing — `typescript` in "check plain JS" mode (no conversion, no build)

- `logic.js` starts with `// @ts-check`.
- Add JSDoc `@typedef`s for the core shapes: `Todo`, `Group` (the code name for a Set),
  `Area`, `Project`, `State`, and `Filters`.
- `tsconfig.json`: `checkJs: true`, `noEmit: true`, `allowJs: true`, target the two `.js`
  files. No `.ts` files, no emitted output — types are checked, code stays plain JS.

### Linting — `eslint`, minimal & quiet

- Flat config (`eslint.config.js`) covering `logic.js` and `logic.test.js`.
- Small rule set aimed at real bugs, not style nagging: `no-unused-vars`, `eqeqeq`
  (`==` vs `===`), `no-undef`. Configure browser globals for `logic.js` and Node globals
  for the test file so `no-undef` doesn't false-positive.

## The green gate

`package.json` scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "node --test",
    "check": "npm run lint && npm run typecheck && npm run test"
  }
}
```

`npm run check` is the **single green gate** — the backpressure gate the agent (or the
owner) must pass before declaring a change done. Runs in sequence; first failure stops
and reports.

## Prerequisites

- **Node.js must be installed** on the owner's Mac (one-time). This is the only new
  install; it powers the dev toolbox but is **not** required to *use* the app (the app
  still just opens in a browser). The implementation plan will include a plain-language
  install note.

## Success criteria

1. `npm install` then `npm run check` passes **green** (lint + type + test all clean).
2. Opening `todos.html` by double-click still works and behaves **identically** to before
   the extraction — the Work/Private toggle, sets/groups, filters, sorting, and Notes
   import all unchanged.
3. `logic.js` is the single source of truth for the extracted rules (no duplicated
   definitions left behind in `todos.html`).

## Explicitly out of scope (this round)

- **Tier 2:** extracting the render/UI JavaScript into `app.js` (deferred; do it later,
  protected by the tests from this round).
- **Tier 3:** splitting CSS into `style.css` (pure tidiness — no lint/type/test value).
- CSS or HTML linters/checkers.
- Continuous Integration (the project isn't a git repo; the gate is the local
  `npm run check`). Can be revisited if the project moves to git/hosting (Phase 2 sync).

## Follow-up (documented, not now)

- Once green, Tier 2 (extract remaining JS) becomes safe and would let typing + linting
  cover the whole app, not just the rules.
- A Claude Code hook could later run `npm run check` automatically so the gate fires
  without anyone remembering to.
