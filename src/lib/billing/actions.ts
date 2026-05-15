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
    .in(
      "customer_id",
      params.items.map((item) => item.customerId),
    )
    .in(
      "from_date",
      params.items.map((item) => item.fromDate),
    )
    .in(
      "to_date",
      params.items.map((item) => item.toDate),
    );

  const existingMap = new Map<string, string>();
  existingRecords?.forEach((record) => {
    existingMap.set(record.customer_id, record.billing_number);
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

export async function syncBillingSnapshotsForDeliveryNumbers(params: {
  organizationId: string;
  customerId: string;
  deliveryNumbers: string[];
}) {
  const deliveryNumbers = Array.from(new Set(params.deliveryNumbers.filter(Boolean)));
  if (deliveryNumbers.length === 0) {
    return { success: true as const, updated: 0 };
  }

  const supabase = getSupabaseAdmin();
  const { data: records, error: recordsError } = await supabase
    .from("billing_records")
    .select("id, total_amount, snapshot_rows")
    .eq("organization_id", params.organizationId)
    .eq("customer_id", params.customerId);

  if (recordsError) {
    return { success: false as const, error: recordsError.message ?? "โหลดข้อมูลใบวางบิลไม่สำเร็จ" };
  }

  if (!records || records.length === 0) {
    return { success: true as const, updated: 0 };
  }

  const hasRelevantBillingRecord = records.some((record) => {
    const snapshotRows = Array.isArray(record.snapshot_rows)
      ? (record.snapshot_rows as SnapshotRow[])
      : [];
    return snapshotRows.some((row) => deliveryNumbers.includes(row.deliveryNumber));
  });

  if (!hasRelevantBillingRecord) {
    return { success: true as const, updated: 0 };
  }

  const { data: deliveryNotes, error: deliveryNotesError } = await supabase
    .from("delivery_notes")
    .select("delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", params.organizationId)
    .eq("customer_id", params.customerId)
    .in("delivery_number", deliveryNumbers);

  if (deliveryNotesError) {
    return { success: false as const, error: deliveryNotesError.message ?? "โหลดข้อมูลใบจัดส่งไม่สำเร็จ" };
  }

  const deliveryMap = new Map(
    (deliveryNotes ?? []).map((note) => [
      note.delivery_number,
      {
        deliveryDate: note.delivery_date,
        totalAmount: Number(note.total_amount ?? 0),
        notes: note.notes ?? null,
      },
    ]),
  );

  let updated = 0;

  for (const record of records) {
    const snapshotRows = Array.isArray(record.snapshot_rows)
      ? (record.snapshot_rows as SnapshotRow[])
      : [];

    let touched = false;
    const nextRows = snapshotRows.map((row, index) => {
      const live = deliveryMap.get(row.deliveryNumber);
      if (!live) {
        return {
          ...row,
          lineNumber: index + 1,
        };
      }

      touched = true;
      return {
        ...row,
        lineNumber: index + 1,
        deliveryDate: live.deliveryDate,
        totalAmount: live.totalAmount,
        notes: live.notes,
      };
    });

    if (!touched) continue;

    const nextTotal = nextRows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);

    const { error: updateError } = await supabase
      .from("billing_records")
      .update({
        snapshot_rows: nextRows,
        total_amount: nextTotal,
      })
      .eq("id", record.id);

    if (!updateError) {
      updated += 1;
    }
  }

  if (updated > 0) {
    revalidatePath("/billing");
  }

  return { success: true as const, updated };
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
