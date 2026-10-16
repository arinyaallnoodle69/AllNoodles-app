import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const token = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
function load(session = { role: "admin", organizationId: "org", userId: "user", sessionId: "session" }, granted = true) {
  const calls = [], notifications = [];
  const dependencies = {
    "next/server": require("next/server"),
    "@/lib/auth/session": { getAppSession: async () => session },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => ({ rpc: async function (name, args) { assert.ok(this, "RPC must retain its Supabase client receiver"); calls.push({ name, args }); return { data: { granted, counts: { [customerId]: 1 }, locks: [] }, error: null }; } }) },
    "@/lib/orders/order-entry-live": { notifyOrderEntry: async org => notifications.push(org), orderEntryTopic: () => "opaque-hint-channel" },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => dependencies[name], loaded, loaded.exports);
  return { ...loaded.exports, calls, notifications };
}
const post = (action, origin = "http://localhost") => new NextRequest("http://localhost/api/orders/entry", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ action, token, customerId, date: "2026-10-16" }) });

test("status GET uses the signed session scope and accepts an empty customer selection", async () => {
  const api = load();
  const response = await api.GET(new NextRequest(`http://localhost/api/orders/entry?token=${token}&date=2026-10-16&customerId=`));
  assert.equal(response.status, 200);
  assert.equal(api.calls[0].args.p_customer, null);
  assert.equal(api.calls[0].args.p_org, "org");
  assert.equal(api.calls[0].args.p_session, "session");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).counts[customerId], 1);
});

for (const action of ["acquire", "renew", "release"]) test(`${action} invalidates only when status changes`, async () => {
  const api = load();
  assert.equal((await api.POST(post(action))).status, 200);
  assert.equal(api.notifications.length, action === "renew" ? 0 : 1);
  assert.equal(api.calls[0].args.p_owner, token);
});

test("a denied acquire does not announce a new owner", async () => {
  const api = load(undefined, false);
  assert.equal((await api.POST(post("acquire"))).status, 200);
  assert.equal(api.notifications.length, 0);
});

test("cross-origin writes, malformed actions, missing login and warehouse roles are rejected", async () => {
  const api = load();
  assert.equal((await api.POST(post("acquire", "https://untrusted.example"))).status, 403);
  assert.equal((await api.POST(post("delete-all"))).status, 400);
  assert.equal((await load(null).POST(post("acquire"))).status, 401);
  assert.equal((await load({ role: "warehouse" }).POST(post("acquire"))).status, 401);
  assert.equal(api.calls.length, 0);
});
