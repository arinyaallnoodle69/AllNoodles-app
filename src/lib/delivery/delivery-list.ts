import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type DeliveryNoteSummaryRow = {
  id: string;
  deliveryNumber: string;
  deliveryDate: string;
  customerId: string;
  totalAmount: number;
  previousOutstanding: number;
  isInstallmentPlan: boolean;
  installmentPaid: number;
};

type RawDeliveryNoteSummaryRow = {
  id: string;
  delivery_number: string;
  delivery_date: string;
  customer_id: string;
  total_amount?: number | string | null;
  previous_outstanding?: number | string | null;
  is_installment_plan?: boolean | null;
  installment_paid?: number | string | null;
  customers: {
    id: string;
    name: string;
    customer_code: string;
  };
};

/**
 * Lightweight delivery-note lookup for list pages that only need the
 * delivery number/id per customer+date. Single query, no line items / images /
 * billing joins.
 */
export async function getDeliveryNoteSummariesForRange(
  organizationId: string,
  from: string,
  to: string,
  keyword = "",
): Promise<DeliveryNoteSummaryRow[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("delivery_notes")
    .select(`
      id, delivery_number, delivery_date, customer_id,
      total_amount, previous_outstanding, is_installment_plan, installment_paid,
      customers!inner(id, name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed");

  // Always respect date range when provided so deliveries within the selected dates are never omitted
  if (from && to) {
    query = query.gte("delivery_date", from).lte("delivery_date", to);
  }

  const { data: notesData, error: notesError } = await query
    .order("delivery_date", { ascending: keyword ? false : true })
    .order("created_at", { ascending: keyword ? false : true });

  if (notesError || !notesData) return [];

  const tokens = (keyword ?? "")
    .trim()
    .split(/\s+/)
    .map(normalizeSearch)
    .filter(Boolean);
  const allNotes = notesData as unknown as RawDeliveryNoteSummaryRow[];

  return allNotes
    .filter((row) => {
      if (tokens.length === 0) return true;
      const pool = [
        row.customers.name,
        row.customers.customer_code,
        row.delivery_number,
      ]
        .map(normalizeSearch)
        .join(" ");

      return tokens.every((token) => pool.includes(token));
    })
    .map((row) => ({
      id: row.id,
      deliveryNumber: row.delivery_number,
      deliveryDate: row.delivery_date,
      customerId: row.customer_id,
      totalAmount: Number(row.total_amount ?? 0),
      previousOutstanding: Number(row.previous_outstanding ?? 0),
      isInstallmentPlan: Boolean(row.is_installment_plan),
      installmentPaid: Number(row.installment_paid ?? 0),
    }));
}
