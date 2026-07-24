#!/usr/bin/env python3
"""notes_helper.py — a tiny, optional local bridge from Apple Notes to the todo app.

It runs on your Mac, reads a chosen Apple Notes folder READ-ONLY, pulls out the
lines that start with "TODO:", and serves them as JSON at http://localhost:8787/todos
so the todos.html app (opened as a file) can pick them up.

Nothing here ever changes your notes. If this program is not running, the app just
behaves exactly as it always has.

Run it:      python3 notes_helper.py   (also opens a control panel in your browser)
Try it:      python3 notes_helper.py --demo   (canned data, no Apple Notes needed)
Stop it:     press Ctrl-C, or click "Stop helper" in the browser panel

The browser panel (served at http://localhost:8787/) lets you change the folder, flip
on demo data, see the todos it finds, and stop the helper — no Terminal needed.
"""

import html
import json
import re
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

# ------------------------- Config (edit these) -------------------------
NOTES_FOLDER = "Meetings"   # the Apple Notes folder to scan
PORT = 8787                 # the app expects this exact port
TODO_PREFIX = "TODO:"       # only lines starting with this become todos

# Markers used to smuggle multiple notes/fields back through osascript's single
# text output. They are unlikely to appear in real note text.
NOTE_SEP = "<<<NOTE>>>"
FIELD_SEP = "<<<FIELD>>>"

# AppleScript: walk every account's folders, and for folders whose name matches
# the one we were given, emit each note's id, title and (HTML) body, separated by
# the markers above. Read-only — it only reads properties, never sets them.
APPLESCRIPT = '''
on run argv
    set targetFolder to item 1 of argv
    set out to ""
    tell application "Notes"
        repeat with acct in accounts
            repeat with fld in folders of acct
                if (name of fld as string) is targetFolder then
                    repeat with n in notes of fld
                        set out to out & "<<<NOTE>>>" & (id of n as string) & "<<<FIELD>>>" & (name of n as string) & "<<<FIELD>>>" & (body of n as string)
                    end repeat
                end if
            end repeat
        end repeat
    end tell
    return out
end run
'''

# Canned data for --demo so the app can be exercised on any machine.
DEMO_TODOS = [
    {"noteId": "demo-1", "noteTitle": "Kickoff meeting",
     "text": "Book the venue for the offsite"},
    {"noteId": "demo-1", "noteTitle": "Kickoff meeting",
     "text": "Email Sam the budget numbers"},
    {"noteId": "demo-2", "noteTitle": "1:1 with Alex",
     "text": "Draft the Q4 hiring plan"},
]


def html_to_lines(html_body):
    """Turn an Apple Notes HTML body into a list of trimmed plain-text lines.

    Block-level ends (</div>, </p>, </li>, </h1>..</h6>) and <br> become line
    breaks; every other tag is dropped; HTML entities are decoded.
    """
    if not html_body:
        return []
    text = html_body
    # Turn block ends and line breaks into newlines.
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(div|p|li|h[1-6])>", "\n", text)
    # Drop every remaining tag.
    text = re.sub(r"<[^>]+>", "", text)
    # Decode entities (&amp; -> &, &nbsp; -> \xa0, etc.).
    text = html.unescape(text)
    # Normalise non-breaking spaces so trimming works as expected.
    text = text.replace("\xa0", " ")
    lines = [ln.strip() for ln in text.split("\n")]
    return [ln for ln in lines if ln]


def extract_todos(raw):
    """Pure parser: osascript output -> [{noteId, noteTitle, text}, ...].

    Splits on the NOTE/FIELD markers, converts each body to lines, and keeps only
    the lines that start with TODO_PREFIX (case-insensitive), with the prefix
    stripped and surrounding whitespace trimmed. Empty results are dropped.
    """
    todos = []
    if not raw:
        return todos
    prefix_lower = TODO_PREFIX.lower()
    for block in raw.split(NOTE_SEP):
        if not block.strip():
            continue
        parts = block.split(FIELD_SEP)
        if len(parts) < 3:
            continue
        note_id = parts[0].strip()
        note_title = parts[1].strip()
        body = FIELD_SEP.join(parts[2:])  # body is everything after the 2nd marker
        for line in html_to_lines(body):
            if line.lower().startswith(prefix_lower):
                text = line[len(TODO_PREFIX):].strip()
                if text:
                    todos.append({"noteId": note_id, "noteTitle": note_title, "text": text})
    return todos


def read_notes(folder):
    """Run the AppleScript and parse the result. macOS-only (needs `osascript`)."""
    proc = subprocess.run(
        ["osascript", "-", folder],
        input=APPLESCRIPT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "osascript failed").strip())
    return extract_todos(proc.stdout)


DEMO = False       # flipped on by the --demo flag / the browser panel
_server = None     # set in main(); used by the panel's "Stop helper" button


# The browser control panel. Plain HTML/CSS/JS, styled to match the todo app (Wise
# green). It talks to this same server: GET /todos to list, POST /config to change
# the folder or demo flag, POST /quit to stop the helper.
PANEL_HTML = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Notes → Todo Helper</title>
<style>
  :root { --ink:#163300; --soft:#5a6b52; --faint:#93a08b; --line:#e8ebe4;
    --line2:#d7ddd0; --accent:#9fe870; --accent2:#8edb5c; --soft-bg:#eafada; --bg:#f2f6f5; }
  * { box-sizing: border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--ink); margin:0; padding:28px; line-height:1.45; }
  .card { max-width:560px; margin:0 auto; background:#fff; border:1px solid var(--line);
    border-radius:16px; box-shadow:0 1px 2px rgba(22,51,0,.05),0 10px 30px rgba(22,51,0,.07); padding:22px 24px; }
  h1 { font-size:19px; margin:0 0 2px; letter-spacing:-.3px; }
  .status { display:flex; align-items:center; gap:8px; margin:10px 0 4px; font-weight:700; }
  .dot { width:11px; height:11px; border-radius:50%; background:var(--accent); }
  .url { color:var(--soft); font-size:12.5px; margin-bottom:16px; }
  label.fld { display:block; font-size:12px; font-weight:600; color:var(--faint);
    text-transform:uppercase; letter-spacing:.04em; margin:16px 0 6px; }
  .row { display:flex; gap:8px; }
  input[type=text] { flex:1; border:1px solid var(--line2); border-radius:9px; padding:9px 11px; font-size:14px; outline:none; }
  input[type=text]:focus { border-color:var(--ink); box-shadow:0 0 0 3px rgba(159,232,112,.55); }
  input:disabled { background:#f4f5f2; color:var(--faint); }
  .check { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13.5px; color:var(--soft); }
  .btn { border:1px solid var(--line2); background:#fff; color:var(--soft); border-radius:10px;
    padding:9px 15px; font-size:13.5px; font-family:inherit; cursor:pointer; }
  .btn:hover { border-color:var(--ink); color:var(--ink); }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:var(--ink); font-weight:700; }
  .btn.primary:hover { background:var(--accent2); border-color:var(--accent2); color:var(--ink); }
  .btn.danger { color:#b3261e; }
  .btn.danger:hover { border-color:#b3261e; background:#fdeceb; }
  .todos { margin:8px 0 0; padding:0; list-style:none; border:1px solid var(--line);
    border-radius:12px; min-height:80px; max-height:260px; overflow:auto; }
  .todos li { padding:9px 13px; border-bottom:1px solid var(--line); font-size:14px; }
  .todos li:last-child { border-bottom:none; }
  .todos li .src { color:var(--faint); font-size:12px; }
  .muted { color:var(--faint); font-style:italic; }
  .foot { margin-top:18px; display:flex; align-items:center; gap:10px; }
  .hint { color:var(--soft); font-size:12.5px; margin-top:14px; }
</style></head>
<body>
  <div class="card">
    <h1>Notes → Todo Helper</h1>
    <div class="status" id="status"><span class="dot"></span> <span id="statusText">Running</span></div>
    <div class="url">Serving the todo app at http://localhost:__PORT__/todos</div>

    <label class="fld">Apple Notes folder to scan</label>
    <div class="row">
      <input type="text" id="folder" value="__FOLDER__" />
      <button class="btn primary" id="saveBtn">Save</button>
    </div>
    <div class="check">
      <input type="checkbox" id="demo" __DEMO_CHECKED__ />
      <label for="demo">Use demo data (no Apple Notes needed)</label>
    </div>

    <label class="fld">Todos found <span id="count" class="muted"></span></label>
    <ul class="todos" id="todos"><li class="muted">Loading…</li></ul>
    <div style="margin-top:8px"><button class="btn" id="refreshBtn">Refresh</button></div>

    <div class="hint">Keep this helper running while you use the todo app. Open
      <b>todos.html</b>, and click <b>Add all</b> when the import banner appears.</div>

    <div class="foot">
      <button class="btn danger" id="quitBtn">Stop helper</button>
      <span class="muted" id="quitMsg"></span>
    </div>
  </div>

<script>
const $ = s => document.querySelector(s);
async function loadTodos() {
  const ul = $("#todos");
  ul.innerHTML = '<li class="muted">Reading…</li>';
  try {
    const r = await fetch("/todos");
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    const todos = data.todos || [];
    $("#count").textContent = todos.length ? "· " + todos.length : "";
    if (!todos.length) { ul.innerHTML = '<li class="muted">No TODO: lines found in this folder yet.</li>'; return; }
    ul.innerHTML = "";
    todos.forEach(t => {
      const li = document.createElement("li");
      li.textContent = t.text;
      if (t.noteTitle) { const s = document.createElement("span"); s.className = "src"; s.textContent = "  · from: " + t.noteTitle; li.appendChild(s); }
      ul.appendChild(li);
    });
  } catch (e) {
    $("#count").textContent = "";
    ul.innerHTML = '<li class="muted">Couldn\'t read Notes: ' + e.message + '</li>';
  }
}
async function saveConfig() {
  await fetch("/config", { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ folder: $("#folder").value, demo: $("#demo").checked }) });
  $("#folder").disabled = $("#demo").checked;
  loadTodos();
}
$("#saveBtn").onclick = saveConfig;
$("#demo").onchange = saveConfig;
$("#refreshBtn").onclick = loadTodos;
$("#quitBtn").onclick = async () => {
  await fetch("/quit", { method:"POST" });
  $("#status").innerHTML = '<span class="dot" style="background:#8a8f88"></span> <span>Stopped</span>';
  $("#quitMsg").textContent = "Helper stopped — you can close this tab.";
  document.querySelectorAll("button,input").forEach(b => b.disabled = true);
};
$("#folder").disabled = $("#demo").checked;
loadTodos();
</script>
</body></html>
"""


def control_panel_html():
    return (PANEL_HTML
            .replace("__PORT__", str(PORT))
            .replace("__FOLDER__", html.escape(NOTES_FOLDER, quote=True))
            .replace("__DEMO_CHECKED__", "checked" if DEMO else ""))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, code, text):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            self._send_html(200, control_panel_html())
            return
        if path != "/todos":
            self._send(404, {"error": "not found"})
            return
        try:
            todos = DEMO_TODOS if DEMO else read_notes(NOTES_FOLDER)
            sys.stderr.write("notes-helper: GET /todos -> %d todos\n" % len(todos))
            self._send(200, {"folder": NOTES_FOLDER, "todos": todos})
        except Exception as e:  # noqa: BLE001 — surface any failure to the client + log
            sys.stderr.write("notes-helper: GET /todos -> ERROR: %s\n" % e)
            self._send(500, {"error": str(e)})

    def do_POST(self):
        global NOTES_FOLDER, DEMO
        path = self.path.split("?")[0]
        if path == "/config":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or "{}")
            except Exception:  # noqa: BLE001
                body = {}
            folder = str(body.get("folder", "")).strip()
            if folder:
                NOTES_FOLDER = folder
            DEMO = bool(body.get("demo", DEMO))
            sys.stderr.write("notes-helper: config -> folder '%s', demo=%s\n" % (NOTES_FOLDER, DEMO))
            self._send(200, {"ok": True, "folder": NOTES_FOLDER, "demo": DEMO})
        elif path == "/quit":
            sys.stderr.write("notes-helper: stop requested from the browser panel.\n")
            self._send(200, {"ok": True})
            # shutdown() must run off the serving thread, or it deadlocks.
            if _server is not None:
                threading.Thread(target=_server.shutdown, daemon=True).start()
        else:
            self._send(404, {"error": "not found"})

    def log_message(self, *args):
        pass  # we do our own compact logging above


def main():
    global DEMO, _server
    DEMO = "--demo" in sys.argv[1:]
    mode = " (demo data)" if DEMO else " folder '%s'" % NOTES_FOLDER
    sys.stderr.write(
        "notes-helper: scanning Apple Notes%s, serving http://localhost:%d/\n"
        % (mode, PORT)
    )
    sys.stderr.write("notes-helper: control panel opening in your browser. Ctrl-C to stop.\n")
    _server = HTTPServer(("127.0.0.1", PORT), Handler)
    # Pop the control panel open in the default browser shortly after we start serving.
    if "--no-open" not in sys.argv[1:]:
        threading.Timer(0.7, lambda: webbrowser.open("http://localhost:%d/" % PORT)).start()
    try:
        _server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        sys.stderr.write("\nnotes-helper: stopped.\n")
        _server.server_close()


if __name__ == "__main__":
    main()
