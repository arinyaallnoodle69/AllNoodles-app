import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function harness({ denied = false, uploadError = null } = {}) {
  const uploads = [], receipts = [], authorization = [];
  const admin = {
    from() {
      const query = { select() { return query; }, eq() { return query; }, async in() { return { data: [{ product_id: "product", mode: "stock", supplier_id: "supplier", suppliers: { name: "โรงงาน" } }], error: null }; } };
      return query;
    },
    async rpc(name, input) { if (name === "generate_receipt_number") return { data: "RCV1", error: null }; receipts.push(input); return { error: null }; },
    storage: { from(bucket) { return { async upload(path, body, options) { uploads.push({ bucket, path, body, options }); return { error: uploadError }; }, getPublicUrl(path) { return { data: { publicUrl: `https://storage.example/${bucket}/${path}` } }; } }; } },
  };
  const loaded = { exports: {} };
  const mocks = {
    "next/cache": { revalidatePath() {}, revalidateTag() {}, updateTag() {} },
    "@/lib/auth/authorization": { async requireAnyRole(roles) { authorization.push(roles); if (denied) throw new Error("denied"); return { organizationId: "org", userId: "user" }; } },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/stock/admin": {},
    "@/lib/stock/receipt-number-sequence": { generateSequentialReceiptNumbers: async (_count, next) => [await next()] },
    "@/lib/supabase/action": { createActionClient() { throw new Error("Anonymous upload must not be used"); } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return { uploads, receipts, authorization, run: loaded.exports.receiveStockAction };
}
function form(file = new File(["image"], "bill.jpg", { type: "image/jpeg" })) {
  const data = new FormData();
  data.set("warehouseId", "warehouse");
  data.set("itemsJson", JSON.stringify([{ productId: "product", quantityReceived: 10, unit: "กก.", unitCost: 2 }]));
  if (file) data.set("receiptImage", file);
  return data;
}
test("custom app session uploads via authorized server client and attaches the URL before stock receipt", async () => {
  const ui = harness();
  const result = await ui.run({}, form());
  assert.equal(result.status, "success");
  assert.deepEqual(ui.authorization, [["admin", "member"]]);
  assert.equal(ui.uploads[0].bucket, "stock-receipts");
  assert.match(ui.uploads[0].path, /^org\/[a-f0-9-]+\.jpg$/);
  assert.equal(ui.uploads[0].options.upsert, false);
  assert.equal(ui.receipts[0].p_receipt_url, `https://storage.example/stock-receipts/${ui.uploads[0].path}`);
});
test("unauthorized callers cannot upload or receive stock", async () => {
  const ui = harness({ denied: true });
  await assert.rejects(ui.run({}, form()), /denied/);
  assert.equal(ui.uploads.length, 0);
  assert.equal(ui.receipts.length, 0);
});
test("file type/size validation prevents uploads and stock writes", async () => {
  for (const file of [new File(["bad"], "bill.html", { type: "text/html" }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "bill.jpg", { type: "image/jpeg" })]) {
    const ui = harness();
    assert.equal((await ui.run({}, form(file))).status, "error");
    assert.equal(ui.uploads.length, 0);
    assert.equal(ui.receipts.length, 0);
  }
});
test("upload failure stops stock creation; receipts without a photo still work", async () => {
  const ui = harness({ uploadError: { message: "storage unavailable" } });
  assert.equal((await ui.run({}, form())).status, "error");
  assert.equal(ui.receipts.length, 0);
  const withoutPhoto = harness();
  assert.equal((await withoutPhoto.run({}, form(null))).status, "success");
  assert.equal(withoutPhoto.uploads.length, 0);
  assert.equal(withoutPhoto.receipts[0].p_receipt_url, null);
});
