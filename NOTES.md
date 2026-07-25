# Project notes

Plain-language notes about this todo app, kept alongside the app so they travel with
your backups. (Claude also keeps its own auto-loaded copy of these facts separately.)

## What this is

A personal todo-organization web app — one self-contained file, `todos.html`. No build
step, no server, no accounts. Open it in a browser to use; edit the file to develop it.

The core idea is a **Work / Private** toggle at the top that re-scopes the whole app.
Work items never show in Private mode and vice versa — that separation is intentional
and should stay strict.

## Visual design — Wise-inspired (chosen 2026-07-22)

The look follows the **Wise (fintech) design system**:

- **Bright green `#9FE870`** is used only as a *fill* — never as text (it's too light to
  read on white). It fills the active mode-toggle pill, the "Mark done" button, completed
  check-circles, and progress bars.
- **Forest green `#163300`** is the main text/heading color and the "brand" color.
- Off-white backgrounds, generous rounding (pill buttons, 14px cards), soft green focus
  rings.
- **Both modes share the same green.** You tell Work from Private by the toggle's label
  (💼 / 🏠) and a subtle background warmth — cool for Work, warm for Private. There is no
  separate accent color per mode.
- Red / amber / green are still used to flag overdue, due-soon, priority, and quick-wins —
  those carry meaning, so they stay.

### Deliberate trade-off

The app stays a **single file with no dependencies and works offline**. Because of that,
it uses your device's built-in system font rather than Wise's custom web font (loading a
web font would need an internet connection). This can be revisited if you ever want the
exact Wise typeface and are okay with that trade-off.

## Importing todos from Apple Notes (optional, added 2026-07-22)

You can capture todos during meetings by typing them into Apple Notes, then pull them
into the app with one click. This is **optional** — if you don't set it up, nothing
changes.

- **The convention:** in an Apple Notes folder called **Meetings**, write any lines that
  start with `TODO:` — e.g. `TODO: Book the venue`. Only those lines are imported (the
  `TODO:` prefix is stripped); everything else in the note is ignored.
- **How it reaches the app:** a small optional program in `notes-helper/` runs on your Mac
  and reads that folder **read-only** (it never changes your notes). The easiest way to run
  it is to **double-click `Start Notes Helper.command`**, which starts the helper and opens a
  **control panel in your web browser** — there you set the folder to scan, see the todos it
  found, and stop it again. The app checks for the helper when you open `todos.html` (and via
  a **Check Notes** button in the sidebar). If the helper isn't running, the app just carries
  on as normal.
- **What happens on import:** the app shows a banner ("N new todos from Notes") with a
  preview. You choose where they go: **💼 Add to Work** (the default) or **🏠 Add to
  Private** — since you capture both kinds of todos in Notes. They land in an **Inbox** area
  on that side (created automatically), each noting which note it came from, and you file
  them from there. Nothing is added until you pick a side, so the Work/Private split is never
  crossed by accident.
- **No duplicates:** a line is never imported twice, even after you re-open the app or
  delete an imported todo (the app remembers what it has already seen in `importedKeys`).
- **Setup / details:** see `notes-helper/README.md` (how to start/stop it, the `--demo`
  flag to try it with sample data, and how to change the folder name).

## Getting your todos on your phone (manual sync, added 2026-07-23)

Your Mac and your iPhone each keep their **own separate copy** of your todos — there's no
automatic sync yet. To carry your todos between them, you move a backup file across by
hand. It's a few taps, but it's free, needs no account, and keeps the app a single file.

**The workflow — export on one device, import on the other:**

1. On the device you just edited, click **⬇ Export backup** in the sidebar. This downloads a
   file named like `todos-backup-2026-07-23-1435.json` (the date **and time** are in the
   name, so multiple backups in a day never overwrite each other).
2. **Move the file to the other device**, either way:
   - **iCloud Drive / Files** — save the export into an iCloud folder; on the other device,
     click **⬆ Import backup** and browse to that folder to pick it up. (On iPhone you can
     set where Safari saves downloads under Settings → Safari → Downloads.)
   - **AirDrop** — the no-internet, no-account way: drag the exported `.json` from your Mac's
     Finder straight onto your iPhone. Great when the two devices are next to each other.
3. On the other device, click **⬆ Import backup** and choose that file.

**The one golden rule — the single habit that prevents almost all data loss:**

> **Edit on one device at a time, and let it finish syncing before you switch.**

Your todos are stored as *one* file. When you import, the whole file **replaces** what's on
that device — so if you edited both devices since the last sync, importing will wipe out the
edits you made on the receiving side (even to unrelated todos). Editing one side at a time
sidesteps this entirely.

**What the app now does to protect you:**

- **Older-file warning.** If you try to import a backup that's **older** than the data already
  on that device, the app shows a loud ⚠️ warning with **both dates** before doing anything —
  but still lets you go ahead (so you can deliberately restore an old backup if you want).
- **Data summary in the import dialog.** Every import first shows a little summary — how many
  todos and the "last changed" time for *this device* vs. the *backup file* — so you can
  sanity-check before replacing anything.
- **"Last changed …" line in the sidebar** (under the Data buttons) tells you how fresh this
  device is (e.g. "2h ago"), so you can judge which device is newer before you sync. Just
  opening the app, switching Work/Private, or sorting does **not** change it — only real edits
  do.
- **Keep your timestamped backups.** Because each export is stamped with date + time, an older
  file can always rescue you if a sync goes wrong.

**Is this the final answer?** It's the **"good enough" manual path** — free, no accounts, and
the app stays one offline file. True *automatic* phone↔Mac sync (edit on your phone, see it on
your Mac seconds later) is a separate, later step that would need putting the app online plus a
small cloud store (see the research doc's "Path C"). The JSON export you're using here is the
bridge to that future — your data comes along either way.

## Using it on your phone (added 2026-07-25)

On a narrow phone screen the app rearranges so everything the Mac can do is still within reach —
just laid out for a thumb:

- **Switch views** with the row of **chips under the title** (All active · Focus Today · Quick
  Wins · Upcoming · Overdue · Long-term · Completed). Swipe the row sideways to reach them all;
  tap one to switch.
- **Everything else lives behind the “⋯” button** at the top-right. Tap it and a panel slides up
  from the bottom with your **Areas & projects** (tap one to jump there, or add a new one) and the
  **Data** actions — **Check Notes**, **Export backup**, **Import backup**, and the “last changed”
  line. Tap anything, tap outside the panel, or press back to close it.
- On a Mac (wide screen) nothing changes — the sidebar is still there exactly as before.
