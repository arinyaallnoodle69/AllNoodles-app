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

  const { data: existingRecords } = await db
    .from("billing_records")
    .select("customer_id, billing_number")
    .eq("organization_id", params.organizationId)
    .in("customer_id", params.items.map(i => i.customerId))
    .in("from_date", params.items.map(i => i.fromDate))
    .in("to_date", params.items.map(i => i.toDate));

  const existingMap = new Map<string, string>();
  existingRecords?.forEach(r => {
    // Note: Matches logic in statement.ts where we check exact period
    existingMap.set(r.customer_id, r.billing_number);
  });

  for (const item of params.items) {
    const existingNumber = existingMap.get(item.customerId);

    if (existingNumber) {
      results.push({
        customerId: item.customerId,
        billingNumber: existingNumber,
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

export async function confirmAndSaveBillingBatchAction(params: {
  fromDate: string;
  toDate: string;
  customerIds: string[];
  billingDate: string;
}) {
  const { requireAppRole } = await import("@/lib/auth/authorization");
  const { getBatchBillingData } = await import("@/lib/billing/billing-statement");
  const session = await requireAppRole("admin");

  const dataList = await getBatchBillingData(
    session.organizationId,
    params.fromDate,
    params.toDate,
    params.billingDate,
    params.customerIds,
  );

  if (dataList.length === 0) {
    return { success: false, error: "No records found" };
  }

  const items = dataList.map((item) => ({
    customerId: item.customer.id,
    billingDate: item.billingDate,
    fromDate: item.fromDate,
    toDate: item.toDate,
    totalAmount: item.grandTotal,
    snapshotRows: item.rows,
  }));

  const result = await recordBillingHistoryAction({
    organizationId: session.organizationId,
    items,
  });

  return result;
}
