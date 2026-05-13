"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SnapshotRow } from "@/lib/billing/billing-statement";

const billingTable = (supabase: ReturnType<typeof getSupabaseAdmin>) => supabase;

type BillingItem = {
  customerId: string;
  billingDate: string;
  fromDate: string;
  toDate: string;
  totalAmount: number;
  snapshotRows: SnapshotRow[];
};

export async function recordBillingHistoryAction(params: {
  organizationId: string;
  items: BillingItem[];
}) {
  const supabase = getSupabaseAdmin();
  const db = billingTable(supabase);
  const results: { customerId: string; billingNumber: string }[] = [];

  for (const item of params.items) {
    const { data: existing } = await db
      .from("billing_records")
      .select("billing_number")
      .eq("organization_id", params.organizationId)
      .eq("customer_id", item.customerId)
      .eq("from_date", item.fromDate)
      .eq("to_date", item.toDate)
      .maybeSingle();

    if (existing) {
      results.push({
        customerId: item.customerId,
        billingNumber: (existing as { billing_number: string }).billing_number,
      });
      continue;
    }

    const { data: billingNumber } = await supabase.rpc("next_billing_number", {
      p_organization_id: params.organizationId,
      p_billing_date: item.billingDate,
    });

    if (!billingNumber) continue;

    await db.from("billing_records").insert({
      organization_id: params.organizationId,
      customer_id: item.customerId,
      billing_number: billingNumber,
      billing_date: item.billingDate,
      from_date: item.fromDate,
      to_date: item.toDate,
      total_amount: item.totalAmount,
      snapshot_rows: item.snapshotRows,
    });

    results.push({ customerId: item.customerId, billingNumber });
  }

  revalidatePath("/billing");
  return { success: true, results };
}
