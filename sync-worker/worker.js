"use strict";
//
// Cloudflare Worker — a tiny authenticated store for the todo app's whole-state blob.
//
// The app (todos.html) stays offline-first: localStorage is the local source of truth and this
// Worker syncs on top. It holds ONE envelope { rev, data } in a KV namespace under the key "blob":
//   - GET  /todos            -> { rev, data }   (or { rev: 0, data: null } when empty)
//   - PUT  /todos { baseRev, data }
//        accept iff baseRev === current rev -> store, rev++, 200 { ok:true, rev }
//        otherwise (stale write)            -> 409 { ok:false, rev, data }  (the newer server copy)
//
// The monotonic `rev` gives optimistic concurrency, so a write that isn't based on the current
// server version is REJECTED instead of silently overwriting — clock skew is irrelevant.
//
// Auth is a single bearer secret (SYNC_KEY) compared in constant time; every real request needs
// `Authorization: Bearer <key>`. The app URL is public but useless without the key.
//
// Dual-mode, exactly like logic.js: it runs in the Cloudflare Workers runtime (the service-worker
// `fetch` listener at the bottom) AND is `require()`-able in Node so `worker.test.js` can unit-test
// the pure `applyPut()` accept/409 logic without the Cloudflare runtime.
//
// Bindings (set in the Cloudflare dashboard — see README.md):
//   - SYNC_KV      : a KV namespace binding (the store)
//   - SYNC_KEY     : a secret (the bearer key)
//   - ALLOW_ORIGIN : a plain var — the app's origin for CORS (e.g. https://<user>.github.io), or "*"

const KV_KEY = "blob";

/**
 * Pure optimistic-concurrency decision — the heart of the store, unit-tested in Node.
 * Accept a write only when it is based on the store's current rev.
 * @param {{rev:number,data:any}|null} current  The stored envelope, or null when empty.
 * @param {{baseRev:number,data:any}} body       The incoming PUT body.
 * @returns {{ok:true,next:{rev:number,data:any}} | {ok:false,rev:number,data:any}}
 */
function applyPut(current, body) {
  const rev = current ? current.rev : 0;
  if (!body || body.baseRev !== rev) {
    return { ok: false, rev, data: current ? current.data : null };
  }
  return { ok: true, next: { rev: rev + 1, data: body.data } };
}

// Length-checked constant-time string compare, so a wrong key can't be timing-probed.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
  });
}

function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : "";
}

/**
 * The single request handler. `env` carries the bindings ({ SYNC_KV, SYNC_KEY, ALLOW_ORIGIN }),
 * passed in from the service-worker listener so the routing stays testable/explicit.
 */
async function handleRequest(request, env) {
  const origin = (env && env.ALLOW_ORIGIN) || "*";
  const cors = corsHeaders(origin);

  // CORS preflight — answered WITHOUT auth so the browser can proceed to the real request.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Bearer auth on every real request.
  if (!env || !env.SYNC_KEY || !safeEqual(bearerToken(request), env.SYNC_KEY)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401, cors);
  }

  const url = new URL(request.url);
  if (url.pathname !== "/todos") {
    return jsonResponse({ ok: false, error: "not found" }, 404, cors);
  }

  // The current stored envelope (or null when the store is still empty).
  const readCurrent = async () => {
    const raw = await env.SYNC_KV.get(KV_KEY);
    return raw ? JSON.parse(raw) : null;
  };

  if (request.method === "GET") {
    const current = await readCurrent();
    return jsonResponse(
      current ? { rev: current.rev, data: current.data } : { rev: 0, data: null },
      200, cors
    );
  }

  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body.baseRev !== "number") {
      return jsonResponse({ ok: false, error: "bad request" }, 400, cors);
    }
    const current = await readCurrent();
    const result = applyPut(current, body);
    if (!result.ok) {
      // Stale write — hand back the newer server copy so the client can offer a conflict choice.
      return jsonResponse({ ok: false, rev: result.rev, data: result.data }, 409, cors);
    }
    await env.SYNC_KV.put(KV_KEY, JSON.stringify(result.next));
    return jsonResponse({ ok: true, rev: result.next.rev }, 200, cors);
  }

  return jsonResponse({ ok: false, error: "method not allowed" }, 405, cors);
}

// --- Cloudflare service-worker entrypoint (skipped under Node's require, where there is no
//     `addEventListener`, so the module stays a pure library for the tests). ---
if (typeof addEventListener !== "undefined") {
  addEventListener("fetch", (event) => {
    const env = {
      SYNC_KV: globalThis.SYNC_KV,
      SYNC_KEY: globalThis.SYNC_KEY,
      ALLOW_ORIGIN: globalThis.ALLOW_ORIGIN,
    };
    event.respondWith(handleRequest(event.request, env));
  });
}

// Node-only export for unit tests; `module` is undefined in the Workers runtime.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyPut, safeEqual };
}
