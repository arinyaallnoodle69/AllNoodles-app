// Read-only smoke check: generates local PDFs without uploading or sending to customers.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const origin = process.argv[2] || "http://localhost:3010";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: user, error: userError } = await db.from("app_users").select("id,organization_id")
  .eq("is_active", true).eq("role", "admin").limit(1).single();
if (userError) throw new Error(userError.message);
const payload = { displayName: "PDF verification", organizationId: user.organization_id, userId: user.id,
  role: "admin", sessionId: randomUUID(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const cookie = "allnoodles_session=" + encoded + "." + createHmac("sha256", env.SESSION_SECRET.trim()).update(encoded).digest("hex");
const { data: warehouses, error: warehouseError } = await db.from("warehouses").select("id,name")
  .eq("organization_id", user.organization_id).eq("is_active", true);
if (warehouseError) throw new Error(warehouseError.message);
const ids = [];
for (const warehouse of warehouses) {
  const { data: note, error } = await db.from("delivery_notes").select("id,delivery_number,total_amount")
    .eq("organization_id", user.organization_id).eq("warehouse_id", warehouse.id).eq("status", "confirmed")
    .order("delivery_date", { ascending: false }).limit(1).single();
  if (error) throw new Error(error.message);
  ids.push(note.id);
  console.log(JSON.stringify({ warehouse: warehouse.name, number: note.delivery_number, total: note.total_amount }));
}
assert.ok(ids.length >= 2);
mkdirSync("output/pdf/consistency-verification", { recursive: true });
for (const [label, url] of [
  ["single", `/orders/delivery-notes/${ids[0]}`],
  ["batch", `/delivery/print?note_ids=${ids.join(",")}`],
  ["preview", `/orders/delivery-notes/preview?note_ids=${ids.join(",")}`],
]) {
  const response = await fetch(origin + "/api/delivery-pdf", { method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ url: origin + url }) });
  if (!response.ok) throw new Error(`${label}: ${response.status}: ${await response.text()}`);
  const token = response.headers.get("X-Delivery-Export-Token");
  assert.ok(token);
  const file = Buffer.from(await response.arrayBuffer());
  assert.equal(file.subarray(0, 4).toString(), "%PDF");
  assert.ok(file.length > 5000, "PDF must contain rendered bills, not a blank page");
  const verified = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  assert.equal(verified.fileHash, createHash("sha256").update(file).digest("hex"));
  writeFileSync(`output/pdf/consistency-verification/${label}.pdf`, file);
  console.log(JSON.stringify({ test: label, status: response.status, bytes: file.length, hashVerified: true }));
}
const denied = await fetch(origin + "/api/delivery-pdf", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: origin + "/delivery/print" }) });
assert.equal(denied.status, 401);
console.log("Unauthenticated PDF request rejected");
