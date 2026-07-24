---
date: 2026-07-22T13:00:34+00:00
git_commit: ""
branch: ""
topic: "Accessing todos on iPhone (read + write) synced with Mac"
tags: [research, sync, ios, icloud, hosting, pwa, localstorage, backend]
status: complete
---

# Research: Accessing your todos on your iPhone (read + write) and keeping them in sync with your Mac

## Research Question
> "Let's research how I can access my todos on my phone (read and write) and be synchronised with Mac."

Scoped with you: **iPhone + Mac**, prefer **dead-simple** and **free/no-accounts** but **open to iCloud** (a cloud file service you already have), and **undecided between "good enough" and "near-instant"** — so this covers the full spectrum.

> Note: this is a *research* document. It maps what your app does today and what the realistic options are, with sources. It does **not** change any code. When you want to actually build one of these, that's a separate planning step.

---

## Summary

### How your app stores data today (the starting point)

Your whole app is the single file `todos.html`. Everything you type lives in your **browser's `localStorage`** under one key, `todo_overview_v1`, as a single JSON object (`todos.html:446`, `todos.html:459`, `todos.html:500`). The important fact:

> **`localStorage` is private to one browser on one device.** Your Mac's Safari and your iPhone's Safari each have a *completely separate* copy. Nothing is shared between them today — there is no sync at all.

The only existing bridge between devices is **manual backup**: an **Export backup** button downloads your data as a `.json` file (`todos.html:1452`), and **Import backup** reads such a file back in (`todos.html:1460`). There is also the optional Apple Notes helper, but that's a *Mac-only* one-way import from Notes — not phone sync (`todos.html:1498`, `notes-helper/`).

So "get my todos on my phone, editable, synced with my Mac" is not a setting to flip — it requires adding *something* (either a file you shuffle around, or a place on the internet the app talks to). The rest of this document is the honest menu of those "somethings."

### The two hard walls on iPhone (why the obvious idea doesn't work)

Before the options, two facts that eliminate the most intuitive approach ("just put `todos.html` in iCloud Drive and open it on both devices"):

1. **iPhone won't run a local HTML file.** Recent iOS no longer lets Safari open a local `.html` file and run its JavaScript — you only get a read-only "Quick Look" preview, which won't run your app. And `localStorage` on a `file://` page is officially "undefined"/unreliable, and all local files would share one storage bucket anyway. ([Apple Community](https://discussions.apple.com/thread/256102223), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage))
2. **A web app can't reach into iCloud Drive by itself.** Safari doesn't support the browser "File System Access" API, so your app can never *automatically* read/write a file in iCloud Drive. iCloud also has **no web API** for third-party apps — Apple only exposes iCloud files through native-app pickers, not to web pages. ([fsjs.dev](https://fsjs.dev/understanding-file-system-access-api/), [Apple document picker](https://developer.apple.com/library/prerelease/ios/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/Introduction/Introduction.html))

**Consequence:** to *run* the app on your iPhone at all, it needs to be on the web (a normal `https://` link), OR you accept a manual file-shuffling workflow. That fork defines the three realistic paths below.

### The three realistic paths (at a glance)

```
                        Your goal: iPhone read/write, synced with Mac
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                   ▼
  PATH A  "Good enough"           PATH B  Host it + browser          PATH C  Host it + a tiny
  Manual file via iCloud/AirDrop  storage per device                 sync backend  (near-instant)
        │                                 │                                   │
  Export → Save to iCloud         Put todos.html online (free),       Put todos.html online, and it
  Drive (or AirDrop) →            "Add to Home Screen" on both.       talks to a small cloud store
  Import on other device.         Each device keeps its OWN data;     over the internet. Edit on
                                  still move data with Export/Import. phone → appears on Mac in seconds.
        │                                 │                                   │
  ✅ zero new code                 ✅ real app on your phone           ✅ actually automatic sync
  ✅ no accounts (iCloud/AirDrop)  ✅ storage survives longer          ✅ stays ~a single file (fetch)
  ✅ stays one local file          ⚠️ needs 1-time hosting step        ⚠️ needs 1-time hosting + setup
  ⚠️ fully manual, several taps    ⚠️ still NOT auto-sync              ⚠️ a little code + an account
  ⚠️ overwrite risk (see below)    ⚠️ browser storage can be evicted   💲 $0 on free tier
```

**Plain-language bottom line:** There is **no free, zero-setup, automatic-sync, still-just-a-local-file** option — that combination doesn't exist on iPhone today. You trade one of those things away:
- Want **zero setup & no accounts**? → Path A, but sync is manual (and can overwrite).
- Want **real automatic sync**? → Path C, which needs a one-time "put it online + wire up a store" step (still free, still basically one file).
- Path B is a **half-step**: your app becomes a real, installable phone app, but data still moves by hand.

---

## Detailed Findings

### Path A — "Good enough": manual file via iCloud Drive or AirDrop

**The idea:** keep using the Export/Import buttons you already have. Your phone and Mac each run the app; to sync, you export a JSON file on one device, hand it to the other, and import it.

**Does this actually work on iPhone? Yes:**
- Safari on iPhone can save a downloaded file into iCloud Drive/Files (Settings → Safari → Downloads lets you choose the location), and the Import file-picker can browse iCloud Drive to pick it back up. ([Apple Support](https://support.apple.com/en-us/102440), [MacRumors](https://www.macrumors.com/how-to/change-where-safari-files-download-in-ios/))
- **AirDrop** is the best *no-cloud, no-account* variant: drag the exported `.json` from your Mac's Finder onto your iPhone; it's free, encrypted, needs no internet, and file size is a non-issue for a todo list. ([Apple Support](https://support.apple.com/guide/mac-help/use-airdrop-to-send-items-to-nearby-devices-mh35868/mac))
- Universal Clipboard (copy/paste the data as text) and QR codes also work but are fiddly — QR maxes out around ~3,000 bytes, so only for a tiny list. ([QR size limits](https://www.the-qrcode-generator.com/blog/qr-code-data-size))

**The honest downside — the "overwrite" trap (applies to Path A *and* Path B):**
Your data is *one* JSON blob. If you edit on your Mac at 9am and on your phone at 10am and then sync, whichever file you import *last wins* and **silently erases the other's changes** — even changes to unrelated todos, because the whole object is replaced. iCloud can also quietly create duplicate "conflicted copy" files. ([conflict overview](https://www.digitalcitizen.life/cloud-sync-conflicts-explained-why-files-duplicate-or-overwrite-themselves/), [iCloud sync issues](https://www.webpronews.com/apples-icloud-drive-has-a-sync-problem-and-dropbox-solved-it-years-ago/))

**Simple rules that make it safe (no fancy tech needed):**
- **Edit on one device at a time, and let it finish syncing before switching.** This single rule prevents almost all data loss. ([Scriptation](https://help.scriptation.com/en/article/how-do-i-avoid-conflicted-copies-with-multiple-devices-of-my-own-16eyo20/))
- Keep **timestamped exports** (e.g. `todos-2026-07-22-0900.json`) so an older backup can rescue you.
- *(Optional future tweak to your app:* store a "last modified" time inside the data and warn on import if the incoming file is **older** than what's loaded — a one-guard safeguard against the most common footgun.)

**Verdict:** The winner if "dead-simple, free, no accounts, stays one file" matters most. Costs you nothing and needs no new code. The price is discipline: it's manual, several taps per sync, and you must avoid editing both devices at once.

### Path B — Host the app online, keep storage per-device (a half-step)

**The idea:** put your single `todos.html` on the free web so your iPhone can open it like any website and **"Add to Home Screen"** (it then looks and launches like a real app). Data still lives in each device's browser storage; you'd still use Export/Import to move data across.

**Why you'd bother — it fixes a storage reliability problem:**
- iOS Safari **deletes a website's storage after 7 days of not visiting it** (the "Intelligent Tracking Prevention" rule) — the exact failure mode for an occasionally-opened todo app. ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), [Search Engine Land](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519))
- **Apps "Added to Home Screen" are exempt** from that 7-day wipe — the biggest reason to host + install rather than use a raw local file. (Even then, storage can be evicted under extreme disk pressure/months of disuse, so keep JSON backups.) ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), [MagicBell 2026 guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide))

**Free hosting options (any gives an `https://` link + free SSL, required for "Add to Home Screen"):**
- **Cloudflare Pages** — free, unlimited bandwidth; common default in 2026.
- **Netlify** — has a literal **drag-and-drop deploy** (drop the file on their site), the least-technical onboarding.
- **GitHub Pages** — simplest if you're comfortable with a GitHub repo. ([hosting comparison](https://jp-my-blog.vercel.app/blog/github-pages-vs-netlify-cloudflare-pages-and-vercel-the-only-free-static-site-host-comparison-that-matters))

**Verdict:** Makes your app a real, installable iPhone app and fixes the 7-day-wipe risk — but it is **still not sync**. Each device keeps separate data; you keep moving it by hand (Path A). Best thought of as a stepping stone that pairs naturally with Path C.

### Path C — Host the app + a tiny cloud store (real, near-instant sync)

**The idea:** same hosting as Path B, but your app also talks to a small storage service on the internet. On open it **loads** your data from there; on change it **saves** back. Do that on both devices and they stay in sync automatically. This is exactly the roadmap's **"Phase 2"** in your `CLAUDE.md`.

**How little the app has to change:** today it does `localStorage.getItem/setItem` on one JSON object. The minimal version swaps those two calls for a `GET` (load) and a `PUT`/`POST` (save) over the internet — the data shape stays identical. With the right backend it's plain `fetch()` calls plus a secret key, **no build step, no framework — still essentially one file.**

**"Near-instant" without complicated tech:** for *one person using one device at a time*, the app can simply re-check the cloud every few seconds (and when you switch back to the app). That feels instant and keeps the code simple. True live "push" sync (websockets) only matters if two devices edit at the very same moment — unlikely for you.

**Backend options a non-developer could realistically use (all have free tiers):**

| Option | Real-time? | Setup effort | Notes / catches |
|---|---|---|---|
| **Cloudflare (Pages + a small "Worker" + KV store)** | Poll (feels instant) | One-time ~30 lines of code | **Recommended.** Host *and* store in one free account; app uses plain `fetch()` + a key, no SDK. No surprise bills. ([Workers/KV](https://agentdeals.dev/vendor/cloudflare-workers)) |
| **Supabase** (a hosted database) | ✅ true live push | Medium (add a `<script>`, set a security rule) | Genuine realtime + proper DB. Catches: free projects **auto-pause after ~1 week idle** (need a click to wake), no free backups. ([free tier](https://www.iloveblogs.blog/post/supabase-free-tier-limits-2026), [key safety](https://supabase.com/docs/guides/database/secure-data)) |
| **Simple JSON store** (e.g. JSONBin) | Poll only | Lowest (just `fetch()` + key) | Easiest to wire, but JSONBin's free tier is a **one-time 10,000 requests** (doesn't refill) — poor for daily long-term use. ([limits](https://jsonbin.io/support)) |
| **Firebase** (Google) | ✅ true live push | Higher (SDK + console) | **Not recommended:** paid plan has **no spending cap** — a runaway loop can create a large bill. ([cost risk](https://www.budgetforge.dev/tools/firebase-pricing-2026)) |
| **PocketBase** (self-hosted) | ✅ | High (rent + run a server) | **Not recommended** for a non-dev: you'd maintain your own Linux server. ([self-host burden](https://github.com/pocketbase/pocketbase)) |

**Do you need a login?** No. For one person you can use a single secret key baked into the app instead of a login screen. **Security caveat:** anyone who "view-source"s a public web page can read that key, so:
- On Supabase this is *fine* **only if** you turn on its "Row Level Security" rules (every reported breach came from that being **off**). Never ship its secret/service key. ([Supabase security](https://www.stingrai.io/blog/supabase-powerful-but-one-misconfiguration-away-from-disaster))
- On Cloudflare/JSONBin, use a long, unguessable ID + key and don't post the app's URL publicly. It's "good enough for a personal todo list," not for sensitive data. A tiny Cloudflare Worker can hide the key server-side if that ever matters.

**Cost:** effectively **$0** for a solo todo app on any of these free tiers; you'd essentially never hit the limits. Paid tiers (if ever needed) are ~$5/mo Cloudflare Workers, $25/mo Supabase Pro. ([Cloudflare](https://agentdeals.dev/vendor/cloudflare-workers), [Supabase Pro](https://uibakery.io/blog/supabase-pricing))

**Verdict:** The only path that delivers *actual* automatic sync. Best-value combo for you: **Cloudflare Pages (host) + a small Cloudflare Worker with KV (store)** — one free account, no SDK, no surprise bills, keeps the single-file spirit, near-instant via a few-second refresh. Choose **Supabase** instead only if you specifically want true live push and don't mind the idle-pause quirk.

### Sidebar: what about Dropbox / Google Drive as the store?

If you ever want in-app auto-sync but prefer a file service over a database, **Dropbox and Google Drive both have web APIs** a browser app can use (with plain `fetch()` + a token) to read/write one file — Google even has a hidden per-app folder for this. The cost is added complexity: an app registration, tokens that expire, and CORS handling — a real step away from "one dependency-free file." **iCloud is not an option here** — it has no such web API at all, so any in-app auto-sync to a *file service* would have to be Dropbox or Google, not iCloud. ([Dropbox JS](https://www.dropbox.com/developers/documentation/javascript), [Google appData](https://developers.google.com/workspace/drive/api/guides/appdata))

---

## Code References
- `todos.html:446` — `STORE_KEY = "todo_overview_v1"`: the single localStorage key holding all data.
- `todos.html:457-461` — `load()`: reads + migrates state from localStorage (per-device, not shared).
- `todos.html:500` — `save()`: writes the whole `state` object back to localStorage. **This is the one line Path C would change** (write to the cloud instead of / in addition to localStorage).
- `todos.html:1452-1458` — `exportData()`: builds a JSON Blob and downloads it (the file Path A moves around).
- `todos.html:1460-1472` — `importData(file)`: reads a chosen JSON file back in via `FileReader` (the "receive" half of Path A).
- `todos.html:1498` / `NOTES_HELPER_URL` (`todos.html:451`) — optional, Mac-only, one-way Notes import; **not** phone sync.
- `notes-helper/notes_helper.py` — the localhost Python helper; runs only on the Mac, irrelevant to phone access.
- `CLAUDE.md` (Roadmap section) — documents "Phase 2: cross-device sync (would need a small backend + hosting)" = **Path C** above; and "JSON export carries data across" = **Path A**.

## Architecture Documentation (current state, for reference)
- **Single source of truth:** one `state` object persisted as one JSON string in `localStorage` (`todos.html:446`, `500`). This is why any file-based sync is whole-blob / last-write-wins — there are no per-todo records to merge.
- **No network dependency by design:** the app is offline-first and dependency-free; the only outbound call today is the optional localhost Notes fetch, which fails silently if absent (`todos.html:1498-1503`).
- **Migration hook already exists:** `migrate(state)` runs on every load/import and is idempotent (`CLAUDE.md` Architecture notes). Any future sync layer would reuse this to keep old and new data compatible.
- **Export/Import is the documented migration path** to a future synced version (`CLAUDE.md` Roadmap) — i.e. the app was already designed expecting Path A/C to come later.

## How the paths map to your stated preferences
- **"Free & no accounts" + "keep it dead simple"** → **Path A** (iCloud Drive folder or AirDrop). Zero code, zero accounts beyond iCloud, stays one file. Trade-off: manual, and the overwrite rule to remember.
- **"Use a cloud file service" (iCloud)** → note the honest limit: iCloud is great as a *manual folder* (Path A) but offers **nothing automatic** to a web app. Automatic sync can't be built on iCloud; it needs Path C's store.
- **"Research both good-enough and near-instant"** → good-enough = Path A; near-instant = Path C (Cloudflare recommended). Path B is the shared stepping-stone (get it onto your phone as a real app first).

## Open Questions (for when you decide to build, not now)
- **Would you accept a one-time "put it on the web" step?** It's the gate to both a real phone app (Path B) and true sync (Path C). If "no, must stay a local file," Path A is the ceiling.
- **How often would you edit on *both* devices between syncs?** If "rarely," Path A's last-write-wins is genuinely fine. If "often," that's the strongest argument for Path C.
- **Is any of your todo data sensitive?** Affects how careful the Path C key handling needs to be (public key + security rules vs. a key-hiding Worker).
- **Do you actually need live push, or is "current within a few seconds" enough?** The latter (Cloudflare + polling) is simpler and cheaper than true realtime (Supabase/Firebase).
