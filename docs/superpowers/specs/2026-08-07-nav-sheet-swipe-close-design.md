# Swipe-down to close the mobile bottom sheet

## Problem

On mobile (≤720px), the "⋯" button opens a bottom sheet (`#navSheet`) holding
Areas + Data actions. It has a visual drag handle (`.nav-sheet-handle`) that
*looks* draggable, but the only ways to dismiss it are tapping the scrim or
tapping a menu item. There is no swipe-down gesture, which is the gesture users
instinctively try on a bottom sheet.

## Goal

Let the user close the sheet by swiping it down, with a native "follow-finger"
feel: the sheet tracks the finger while dragging, then either closes (if dragged
far enough or flicked) or springs back up.

## Scope

- Mobile only. The sheet only renders under the 720px breakpoint; desktop is
  untouched (the touch handlers no-op harmlessly since the sheet is never open).
- Single file, vanilla JS touch events. No dependencies, no new storage.
- All existing close paths keep working unchanged: scrim tap, menu-item tap,
  `closeNavSheet()`, and the global "close everything" path.

## Behaviour

**Where the drag starts.** A downward drag begins when the touch starts on:
- the drag **handle** (`.nav-sheet-handle`), always; or
- **anywhere on the sheet** *while its scrollable body (`.nav-sheet-body`) is
  scrolled to the top* (`scrollTop <= 0`). This lets the user fling the whole
  sheet down without fighting the scroll of a long Areas list. If the body is
  scrolled down, a touch there scrolls the list as normal and does not drag.

**During the drag.** Only downward movement counts (`dy > 0`). While dragging,
the sheet's `transform` is set to `translateY(<dy>px)` directly (inline style)
and its CSS transition is suppressed so it tracks the finger 1:1. Upward drags
are clamped to 0 (the sheet never lifts above its open position).

**On release.** The sheet closes if **either**:
- it was dragged past a distance threshold (~⅓ of the sheet height, capped at a
  sensible px value), **or**
- it was a quick flick (drag velocity beyond a small threshold, downward).

Otherwise it springs back to fully open. Either way the inline `transform` is
cleared and the CSS transition restored, so:
- close → normal `closeNavSheet()` (removes `.open`, CSS animates it out);
- spring back → removing the inline transform lets `.nav-sheet.open`'s
  `translateY(0)` re-apply with the transition.

## Implementation sketch

New `initNavSheetSwipe()` wired once at startup (near the existing
`#navToggle` / `#navScrim` listeners). It attaches `touchstart` / `touchmove` /
`touchend` to `#navSheet`. State (start Y, last Y, dragging flag, whether the
gesture is eligible) lives in closure vars. A tiny helper decides eligibility on
`touchstart` (handle target OR body scrollTop at top). `touchmove` updates the
inline transform for downward movement; `touchend` decides close-vs-spring and
resets styles.

`closeNavSheet()` is extended to also clear any leftover inline transform +
transition override, so a programmatic close during a drag can't leave the sheet
in a half-dragged style.

## Testing

- **Logic:** the gesture is DOM/touch-driven, not pure business logic, so there
  is little to add to `logic.js`/`logic.test.js`. If a threshold decision is
  worth isolating (e.g. `shouldCloseSheet(dy, velocity, height)` returning a
  bool), extract it as a pure helper into `logic.js` with unit tests. Otherwise
  keep it inline.
- **Manual:** on a phone (or responsive emulation with touch), open the sheet
  and verify: small drag springs back; big drag closes; flick closes; dragging a
  scrolled-down list scrolls instead of closing; scrim/menu-tap still close.
- `npm run check` stays green (lint + type-check + existing tests).

## Non-goals

- No swipe-to-close on the detail drawer (`#drawer`) — this change is scoped to
  the nav bottom sheet only.
- No haptics, no rubber-banding past the top.
