import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function parseWeightRows(path) {
  const lines = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;

    const [sku = "", name = "", baseUnit = "", amount = "", weightUnit = ""] = line.split("\t");
    if (!sku.trim() || !amount.trim()) continue;

    const parsedAmount = Number(amount.replaceAll(",", "").trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new Error(`Invalid weight for ${sku}: ${amount}`);
    }

    const normalizedUnit = weightUnit.trim();
    let unitWeightGrams;
    if (normalizedUnit === "กรัม") {
      unitWeightGrams = parsedAmount;
    } else if (normalizedUnit === "กิโลกรัม") {
      unitWeightGrams = parsedAmount * 1000;
    } else {
      throw new Error(`Unsupported weight unit for ${sku}: ${weightUnit}`);
    }

    // The source text says 5 kg, but the confirmed value for ANP140 is 3 kg.
    if (sku.trim() === "ANP140") unitWeightGrams = 3000;

    rows.push({
      baseUnit: baseUnit.trim(),
      name: name.trim(),
      sku: sku.trim(),
      unitWeightGrams,
    });
  }

  return rows;
}

loadEnvFile(".env.local");

const inputPath = process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]);
const applyChanges = process.argv.includes("--apply");

if (!inputPath) {
  throw new Error("Usage: node scripts/backfill-product-unit-weights.mjs <weights.tsv> [--apply]");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const sourceRows = parseWeightRows(inputPath);
const sourceBySku = new Map(sourceRows.map((row) => [row.sku, row]));
if (sourceBySku.size !== sourceRows.length) {
  throw new Error("The input contains duplicate SKUs.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: products, error: productsError } = await admin
  .from("products")
  .select("id, organization_id, sku, name, unit, unit_weight_grams")
  .in("sku", [...sourceBySku.keys()]);

if (productsError) throw productsError;

const productsBySku = new Map();
for (const product of products ?? []) {
  const matches = productsBySku.get(product.sku) ?? [];
  matches.push(product);
  productsBySku.set(product.sku, matches);
}

const missingSkus = sourceRows.filter((row) => !productsBySku.has(row.sku)).map((row) => row.sku);
const duplicateSkus = [...productsBySku.entries()]
  .filter(([, matches]) => matches.length !== 1)
  .map(([sku]) => sku);
const matchedRows = sourceRows.filter((row) => productsBySku.get(row.sku)?.length === 1);
const organizationIds = new Set(
  matchedRows.map((row) => productsBySku.get(row.sku)[0].organization_id),
);

console.log(`Source rows with weights: ${sourceRows.length}`);
console.log(`Matched unique products: ${matchedRows.length}`);
console.log(`Missing SKUs: ${missingSkus.length}${missingSkus.length ? ` (${missingSkus.join(", ")})` : ""}`);
console.log(`Duplicate SKUs: ${duplicateSkus.length}${duplicateSkus.length ? ` (${duplicateSkus.join(", ")})` : ""}`);
console.log(`Organizations represented: ${organizationIds.size}`);

if (missingSkus.length || duplicateSkus.length || organizationIds.size !== 1) {
  throw new Error("Safety check failed; no products were updated.");
}

const changedRows = matchedRows.filter((row) => {
  const product = productsBySku.get(row.sku)[0];
  return Number(product.unit_weight_grams) !== row.unitWeightGrams;
});

console.log(`Products requiring an update: ${changedRows.length}`);

if (applyChanges) {
  for (const row of changedRows) {
    const product = productsBySku.get(row.sku)[0];
    const { error } = await admin
      .from("products")
      .update({ unit_weight_grams: row.unitWeightGrams })
      .eq("id", product.id)
      .eq("organization_id", product.organization_id);

    if (error) throw new Error(`Failed to update ${row.sku}: ${error.message}`);
  }

  console.log(`Updated products: ${changedRows.length}`);
} else {
  console.log("Dry run only. Pass --apply to update the matched products.");
}
