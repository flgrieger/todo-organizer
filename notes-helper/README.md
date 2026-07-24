# Notes Helper — capture meeting todos from Apple Notes

This is a small, **optional** program that lets you jot todos into Apple Notes during
a meeting and have them show up in your todo app (`todos.html`).

You type lines that start with `TODO:` into a note, and this helper hands those lines
to the app. It is **read-only** — it never changes or deletes anything in your notes.

If you don't run this, the app works exactly as it always has. This is a pure add-on.

## How it works (in plain terms)

1. You keep a folder in Apple Notes called **Meetings**.
2. In any note there, write normal text, and put todos on their own lines:

   ```
   Kickoff notes…
   TODO: Book the venue
   TODO: Email Sam the budget
   Decision: we launch in Q4
   ```

3. You run this helper on your Mac. It reads that folder and offers up the `TODO:`
   lines (only those — everything else is ignored).
4. You open `todos.html`. It notices the helper, and shows a small banner:
   "📥 2 new todos from Notes — Add all / Dismiss". Click **Add all** and they land in
   a **Work → Inbox** list, ready for you to file into the right place.

The same line is never added twice, even if you re-open the app or delete a todo.

## Start it — double-click, then use your browser

**Double-click `Start Notes Helper.command`** in this folder. It starts the helper and
opens a small **control panel in your web browser** with:

- a green "Running" light and the address it's serving,
- the Apple Notes folder to scan, which you can change and **Save**,
- a live list of the `TODO:` lines it currently finds, with a **Refresh** button,
- a **"Use demo data"** checkbox to try it with fake sample data (no Apple Notes needed),
- a **Stop helper** button to turn it off.

Once it's running, open `todos.html` and click **Add all** when the banner appears. When
you're done, click **Stop helper** in the browser (or close the Terminal window that
opened behind it).

The first time you use it with real notes, macOS asks permission to "control Notes" —
click **OK**. (That's macOS protecting your notes; the helper only ever reads them.)

> Nothing to install — it uses the Python and browser that come with your Mac. If
> double-clicking shows a security warning the first time, right-click the file →
> **Open** → **Open**.

## Start it — the plain way (Terminal)

If you prefer the command line:

```
cd path/to/this/folder
python3 notes_helper.py            # real notes (opens the browser panel too)
python3 notes_helper.py --demo     # fake sample data
python3 notes_helper.py --no-open  # don't auto-open the browser
```

Leave that Terminal window open while you use the app; press **Ctrl-C** to stop.

## Change which folder it reads

By default it reads the folder named **Meetings**. The easiest way to change it is right
in the browser panel: type a new name in the folder box and click **Save**.

(You can also make it permanent by opening `notes_helper.py` in any text editor and
changing `NOTES_FOLDER = "Meetings"` near the top.)

Whatever folder you choose always maps to **Work** in the app, keeping your Work / Private
separation intact.

## For the curious (developers)

- `Start Notes Helper.command` — a one-line launcher; double-clicking it runs the helper.
- `notes_helper.py` — the whole helper, using only the Python standard library. It serves a
  browser control panel at `/` (see `PANEL_HTML`), the todo JSON at `/todos`, and accepts
  `POST /config` (change folder / demo) and `POST /quit` (stop) from that panel.
  - `extract_todos()` / `html_to_lines()` are pure functions (no Apple Notes needed).
  - `read_notes()` runs an AppleScript via `osascript` (macOS only).
  - It binds to `127.0.0.1` only (not reachable from the network) and sends an
    `Access-Control-Allow-Origin` header so the `file://` app is allowed to fetch `/todos`.
- `test_notes_helper.py` — unit tests for the parsing. Run:

  ```
  cd notes-helper && python3 -m unittest test_notes_helper
  ```
