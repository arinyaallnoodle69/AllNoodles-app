import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BillingReportRow = {
  id: string;
  billingDate: string;
  customerCode: string;
  customerName: string;
  totalAmount: number;
};

export type BillingReportData = {
  rows: BillingReportRow[];
  summary: {
    totalAmount: number;
    totalBills: number;
  };
};

type BillingSnapshotRow = {
  deliveryNumber?: string;
  delivery_number?: string;
  totalAmount?: number | string | null;
  total_amount?: number | string | null;
};

type BillingRecordWithCustomer = {
  id: string;
  billing_date: string;
  total_amount: number | string | null;
  customer_id: string;
  snapshot_rows: unknown;
  customers: {
    id: string;
    customer_code: string | null;
    name: string | null;
    default_warehouse_id: string | null;
  } | null;
};

export async function getBillingReport(
  fromDate: string,
  toDate: string,
  warehouseId?: string
): Promise<BillingReportData> {
  const supabase = getSupabaseAdmin();

  const query = supabase
    .from("billing_records")
    .select(`
      id,
      billing_date,
      total_amount,
      customer_id,
      snapshot_rows,
      customers!inner(id, customer_code, name, default_warehouse_id)
    `)
    .gte("billing_date", fromDate)
    .lte("billing_date", toDate)
    .order("billing_date", { ascending: true });

  const { data: records, error: recordsError } = await query;

  if (recordsError) {
    console.error("Error fetching billing records:", recordsError.message, recordsError.code);
    return { rows: [], summary: { totalAmount: 0, totalBills: 0 } };
  }

  const typedRecords = (records ?? []) as unknown as BillingRecordWithCustomer[];

  // If a warehouse filter is set, resolve the warehouse for each delivery note in snapshot_rows
  const deliveryWarehouseMap = new Map<string, string>();

  if (warehouseId && typedRecords.length > 0) {
    const deliveryNumbers = Array.from(
      new Set(
        typedRecords
          .flatMap((r) => {
            const rows = (r.snapshot_rows as BillingSnapshotRow[]) || [];
            return rows.map((row) => row.deliveryNumber || row.delivery_number);
          })
          .filter(Boolean)
      )
    ) as string[];

    if (deliveryNumbers.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < deliveryNumbers.length; i += chunkSize) {
        const chunk = deliveryNumbers.slice(i, i + chunkSize);
        const { data: dns, error: dnsError } = await supabase
          .from("delivery_notes")
          .select("delivery_number, warehouse_id")
          .in("delivery_number", chunk);

        if (dnsError) {
          console.error("Error fetching delivery notes for billing warehouse filter:", dnsError.message);
        } else if (dns) {
          for (const dn of dns) {
            if (dn.delivery_number && dn.warehouse_id) {
              deliveryWarehouseMap.set(dn.delivery_number, dn.warehouse_id);
            }
          }
        }
      }
    }
  }

  const rows: BillingReportRow[] = [];

  for (const item of typedRecords) {
    const customer = item.customers;
    const snapshotRows = (item.snapshot_rows as BillingSnapshotRow[]) || [];

    let amount = 0;
    let hasMatchingDelivery = false;

    if (warehouseId) {
      const matchingRows = snapshotRows.filter((row) => {
        const whId = deliveryWarehouseMap.get(row.deliveryNumber || row.delivery_number || "") ?? customer?.default_warehouse_id;
        return whId === warehouseId;
      });

      if (matchingRows.length > 0) {
        amount = matchingRows.reduce((sum, row) => sum + Number(row.totalAmount ?? row.total_amount ?? 0), 0);
        hasMatchingDelivery = true;
      }
    } else {
      amount = Number(item.total_amount ?? 0);
      hasMatchingDelivery = true;
    }

    if (hasMatchingDelivery) {
      rows.push({
        id: item.id,
        billingDate: item.billing_date,
        customerCode: customer?.customer_code ?? "-",
        customerName: customer?.name ?? "ไม่ทราบชื่อ",
        totalAmount: amount,
      });
    }
  }

  const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  return {
    rows,
    summary: {
      totalAmount,
      totalBills: rows.length,
    },
  };
}
