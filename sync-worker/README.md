# Sync Worker — automatic iPhone ↔ Mac sync

This tiny [Cloudflare Worker](https://workers.cloudflare.com/) is the optional cloud store that
lets the todo app sync automatically between your devices. The app stays offline-first: it always
works from the copy saved on each device, and this Worker just carries your data between them.

**You only set this up once.** It's free (no credit card), and nothing here is required to use the
app — if you never set it up, `todos.html` behaves exactly as before.

It stores **one thing**: a single JSON blob of your todos, plus a version number (`rev`) so two
devices can never silently overwrite each other.

---

## What you'll end up with

- A Worker URL like `https://todo-sync.<your-name>.workers.dev`
- A secret key (a long random password) that only lives on your own devices

You paste those two into the app's **Sync…** panel on each device. Done.

---

## Setup (about 10 minutes, all in the browser)

### 1. Make a free Cloudflare account
Go to <https://dash.cloudflare.com/sign-up> and sign up. No credit card needed for Workers' free
tier.

### 2. Create the Worker
1. In the dashboard sidebar, open **Workers & Pages**.
2. Click **Create application** → **Create Worker**.
3. Name it something like `todo-sync` (this becomes part of your URL) and click **Deploy**.
4. Click **Edit code**. Delete whatever sample code is shown, then paste the **entire contents of
   [`worker.js`](./worker.js)** from this folder. Click **Deploy** (top right).

### 3. Create the KV store (where your todos live)
1. Back in **Workers & Pages**, open **KV** in the sidebar.
2. Click **Create a namespace**, name it `todo-sync-kv`, and create it.
3. Go back to your Worker → **Settings** → **Variables and Bindings** (or **Bindings**).
4. Under **KV Namespace Bindings**, click **Add binding**:
   - **Variable name:** `SYNC_KV`  *(must be exactly this)*
   - **KV namespace:** pick `todo-sync-kv`
   - Save / Deploy.

### 4. Set your secret key
1. Still in the Worker's **Settings** → **Variables and Bindings**.
2. Under **Environment Variables / Secrets**, add a variable:
   - **Name:** `SYNC_KEY`  *(must be exactly this)*
   - **Value:** a long random password — e.g. mash the keyboard, or use a password manager to
     generate ~30 characters. **This is what protects your data. Keep it private.**
   - Click **Encrypt** (so it's stored as a secret), then Save / Deploy.

### 5. Set the allowed origin (optional but recommended)
This tells the Worker which website is allowed to talk to it.
1. Add another plain (unencrypted) variable:
   - **Name:** `ALLOW_ORIGIN`
   - **Value:** the address where you open the app, e.g. `https://<your-github-username>.github.io`
     (no trailing slash). If you're unsure, you can use `*` for now and tighten it later.
   - Save / Deploy.

### 6. Copy your Worker URL
On the Worker's overview page, copy the URL — it looks like
`https://todo-sync.<your-name>.workers.dev`. That's what you paste into the app.

---

## Self-test with `curl` (optional)

Replace `URL` and `KEY` with yours. This seeds the store, proves the version guard works, and
reads it back.

```sh
URL="https://todo-sync.your-name.workers.dev"
KEY="your-secret-key"

# 1) Store the first version (baseRev 0). Expect: {"ok":true,"rev":1}
curl -s -X PUT "$URL/todos" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"baseRev":0,"data":{"hello":"world"}}'

# 2) A stale write (baseRev 0 again, but the store is now at rev 1).
#    Expect: HTTP 409 and the current server copy.
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$URL/todos" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"baseRev":0,"data":{"hello":"stale"}}'
# -> 409

# 3) Read it back. Expect: {"rev":1,"data":{"hello":"world"}}
curl -s "$URL/todos" -H "Authorization: Bearer $KEY"

# 4) A wrong key is rejected. Expect: 401
curl -s -o /dev/null -w "%{http_code}\n" "$URL/todos" -H "Authorization: Bearer nope"
# -> 401
```

If step 1 returns `{"ok":true,"rev":1}`, step 2 returns `409`, step 3 shows your data, and step 4
returns `401`, the store is working. Head into the app's **Sync…** panel and paste the URL + key.

---

## How it works (in one paragraph)

The Worker keeps a single envelope `{ rev, data }` in KV. `GET /todos` returns it. `PUT /todos`
carries a `baseRev`; if it matches the stored `rev`, the write is accepted and `rev` increments —
otherwise the Worker returns **409** with the newer server copy, and the app asks you which version
to keep. That version guard is why sync can **never silently overwrite** your todos. Every request
needs your `SYNC_KEY` as a bearer token, so a stranger who finds the URL still can't read or write.

The accept/409 logic lives in the pure `applyPut()` function and is covered by
[`worker.test.js`](./worker.test.js) (`npm run check`).
