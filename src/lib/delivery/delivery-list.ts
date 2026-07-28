import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type DeliveryNoteSummaryRow = {
  id: string;
  deliveryNumber: string;
  deliveryDate: string;
  customerId: string;
};

type RawDeliveryNoteSummaryRow = {
  id: string;
  delivery_number: string;
  delivery_date: string;
  customer_id: string;
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
      customers!inner(id, name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed");

  // If keyword is provided, search across all dates
  if (!keyword) {
    query = query.gte("delivery_date", from).lte("delivery_date", to);
  } else {
    // Limit global search results for performance
    query = query.limit(100);
  }

  const { data: notesData, error: notesError } = await query
    .order("delivery_date", { ascending: keyword ? false : true })
    .order("created_at", { ascending: keyword ? false : true });

  if (notesError || !notesData) return [];

  const normalizedKeyword = normalizeSearch(keyword);
  const allNotes = notesData as unknown as RawDeliveryNoteSummaryRow[];

  return allNotes
    .filter((row) => {
      if (!normalizedKeyword) return true;
      const customerName = normalizeSearch(row.customers.name);
      const customerCode = normalizeSearch(row.customers.customer_code);
      const deliveryNumber = normalizeSearch(row.delivery_number);
      return (
        customerName.includes(normalizedKeyword) ||
        customerCode.includes(normalizedKeyword) ||
        deliveryNumber.includes(normalizedKeyword)
      );
    })
    .map((row) => ({
      id: row.id,
      deliveryNumber: row.delivery_number,
      deliveryDate: row.delivery_date,
      customerId: row.customer_id,
    }));
}
