import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const parts = line.trim().split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      // Remove surrounding quotes if present
      env[key] = val.replace(/^["']|["']$/g, "");
    }
  }

  const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("delivery_notes")
    .select("id, delivery_number, delivery_date, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Latest delivery notes:");
  for (const row of data) {
    console.log(`DN: ${row.delivery_number}`);
    console.log(`  delivery_date: ${row.delivery_date}`);
    console.log(`  created_at:    ${row.created_at}`);
    if (row.created_at) {
      const d = new Date(row.created_at);
      console.log(`  parsed Date:   ${d.toISOString()}`);
      
      const formatted = new Intl.DateTimeFormat("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Asia/Bangkok",
      }).format(d);
      console.log(`  formatted:     ${formatted}`);
    }
  }
}

main();
