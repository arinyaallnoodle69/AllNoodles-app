"server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";

export type SnapshotRow = {
  lineNumber: number;
  deliveryNumber: string;
  deliveryDate: string;
  totalAmount: number;
  notes: string | null;
};

export type BillingRecord = {
  id: string;
  billing_number: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  billing_date: string;
  total_amount: number;
  from_date: string;
  to_date: string;
  created_at: string;
  snapshot_rows: SnapshotRow[];
};

export type BillingCandidate = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryCount: number;
  totalAmount: number;
  latestDeliveryDate: string;
  deliveries: {
    number: string;
    date: string;
    amount: number;
    isAlreadyBilled: boolean;
    billingNumber: string | null;
    billingFrom?: string;
    billingTo?: string;
  }[];
};

export type BillingStatementData = {
  customer: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  organization: {
    name: string;
    address: string;
    phone: string;
  };
  billingDate: string;
  fromDate: string;
  toDate: string;
  grandTotal: number;
  billingNumber: string | null;
  isLocked: boolean;
  rows: {
    lineNumber: number;
    deliveryNumber: string;
    deliveryDate: string;
    totalAmount: number;
    notes: string | null;
  }[];
};

type DeliveryNoteRow = {
  id: string;
  customer_id: string;
  delivery_number: string;
  delivery_date: string;
  total_amount: number;
  notes: string | null;
};

function toNum(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function getDeliveryNoteActualTotals(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  noteIds: string[],
) {
  if (noteIds.length === 0) {
    return new Map<string, number>();
  }

  const { data: dnItems } = await supabase
    .from("delivery_note_items")
    .select("delivery_note_id, order_item_id")
    .in("delivery_note_id", noteIds);

  const orderItemIds = Array.from(
    new Set((dnItems ?? []).map((item) => item.order_item_id).filter(Boolean) as string[]),
  );
  const { data: orderItems } = orderItemIds.length
    ? await supabase
        .from("order_items")
        .select("id, line_total")
        .in("id", orderItemIds)
    : { data: [] as { id: string; line_total: number | null }[] };

  const orderItemTotalMap = new Map(
    (orderItems ?? []).map((item) => [item.id, toNum(item.line_total)]),
  );
  const deliveryTotals = new Map<string, number>();

  for (const noteId of noteIds) {
    deliveryTotals.set(noteId, 0);
  }

  const seenPairs = new Set<string>();
  for (const item of dnItems ?? []) {
    if (!item.order_item_id) continue;
    const dedupeKey = `${item.delivery_note_id}:${item.order_item_id}`;
    if (seenPairs.has(dedupeKey)) continue;
    seenPairs.add(dedupeKey);
    const currentTotal = deliveryTotals.get(item.delivery_note_id) ?? 0;
    deliveryTotals.set(
      item.delivery_note_id,
      currentTotal + (orderItemTotalMap.get(item.order_item_id) ?? 0),
    );
  }

  return deliveryTotals;
}

function sortByCustomerCode<T extends { customerCode: string; customerName: string }>(rows: T[]) {
  return rows.sort((a, b) => {
    const codeCompare = a.customerCode.localeCompare(b.customerCode, "th");
    if (codeCompare !== 0) return codeCompare;
    return a.customerName.localeCompare(b.customerName, "th");
  });
}

export async function getBillingCandidates(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<BillingCandidate[]> {
  const supabase = getSupabaseAdmin();
  
  const { data: notes, error: notesError } = await supabase
    .from("delivery_notes")
    .select(`
      id,
      customer_id,
      delivery_number,
      delivery_date,
      total_amount,
      notes,
      customers!inner (
        id,
        name,
        customer_code
      )
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate);

  if (notesError || !notes) return [];

  const deliveryTotals = await getDeliveryNoteActualTotals(
    supabase,
    (notes as { id: string }[]).map((note) => note.id),
  );

  const grouped = new Map<string, BillingCandidate>();

  for (const note of (notes as {
    id: string;
    customer_id: string;
    total_amount: number;
    delivery_number: string;
    delivery_date: string;
    customers: { name: string; customer_code: string };
  }[])) {
    const current = grouped.get(note.customer_id) ?? {
      customerId: note.customer_id,
      customerName: note.customers.name,
      customerCode: note.customers.customer_code,
      deliveryCount: 0,
      totalAmount: 0,
      latestDeliveryDate: note.delivery_date,
      deliveries: [] as BillingCandidate["deliveries"],
    };

    const actualAmount = deliveryTotals.has(note.id)
      ? (deliveryTotals.get(note.id) ?? 0)
      : toNum(note.total_amount);

    current.deliveryCount += 1;
    current.totalAmount += actualAmount;
    if (note.delivery_date > current.latestDeliveryDate) {
      current.latestDeliveryDate = note.delivery_date;
    }
    current.deliveries.push({
      number: note.delivery_number,
      date: note.delivery_date,
      amount: actualAmount,
      isAlreadyBilled: false,
      billingNumber: null,
    });
    grouped.set(note.customer_id, current);
  }

  const candidates = Array.from(grouped.values());
  if (candidates.length === 0) return [];

  const lookbackDate = new Date(fromDate);
  lookbackDate.setMonth(lookbackDate.getMonth() - 3);
  const lookbackISO = lookbackDate.toISOString().split("T")[0];

  const { data: billingRecords } = await supabase
    .from("billing_records")
    .select("customer_id, billing_number, snapshot_rows, from_date, to_date")
    .eq("organization_id", organizationId)
    .gte("from_date", lookbackISO)
    .in("customer_id", candidates.map((candidate) => candidate.customerId));

  if (billingRecords) {
    for (const record of (billingRecords as {
      customer_id: string;
      billing_number: string;
      snapshot_rows: { deliveryNumber: string }[];
      from_date: string;
      to_date: string;
    }[])) {
      const candidate = candidates.find(c => c.customerId === record.customer_id);
      if (!candidate) continue;

      const snapshot = record.snapshot_rows || [];
      const billedNumbers = new Set(snapshot.map(s => s.deliveryNumber));

      for (const delivery of candidate.deliveries) {
        if (billedNumbers.has(delivery.number)) {
          delivery.isAlreadyBilled = true;
          delivery.billingNumber = record.billing_number;
          delivery.billingFrom = record.from_date;
          delivery.billingTo = record.to_date;
        }
      }
    }
  }

  return sortByCustomerCode(candidates);
}

export async function getBilledDeliveryNumbersForRange(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_records")
    .select("snapshot_rows")
    .eq("organization_id", organizationId)
    .lte("from_date", toDate)
    .gte("to_date", fromDate);

  if (error || !data) {
    return new Set();
  }

  const billedDeliveryNumbers = new Set<string>();

  for (const row of data as Array<{ snapshot_rows: SnapshotRow[] | null }>) {
    const snapshotRows = Array.isArray(row.snapshot_rows) ? row.snapshot_rows : [];
    for (const snapshot of snapshotRows) {
      if (snapshot.deliveryNumber) {
        billedDeliveryNumbers.add(snapshot.deliveryNumber);
      }
    }
  }

  return billedDeliveryNumbers;
}

export async function getCustomersForBilling(organizationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, customer_code")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("customer_code", { ascending: true });
  
  if (error || !data) return [];
  return data;
}

export async function getBillingHistory(
  organizationId: string,
  options: {
    from?: string;
    to?: string;
    query?: string;
    customerIds?: string[];
    limit?: number;
  } = {}
): Promise<BillingRecord[]> {
  const supabase = getSupabaseAdmin();
  let queryBuilder = supabase
    .from("billing_records")
    .select(`
      id,
      billing_number,
      customer_id,
      billing_date,
      total_amount,
      from_date,
      to_date,
      created_at,
      snapshot_rows,
      customers!inner(name, customer_code)
    `)
    .eq("organization_id", organizationId);

  if (options.from) queryBuilder = queryBuilder.gte("billing_date", options.from);
  if (options.to) queryBuilder = queryBuilder.lte("billing_date", options.to);
  if (options.query) {
    const q = `%${options.query}%`;
    queryBuilder = queryBuilder.or(`billing_number.ilike.${q},customer_code.ilike.${q},name.ilike.${q}`, {
      referencedTable: "customers"
    });
  }
  if (options.customerIds && options.customerIds.length > 0) {
    queryBuilder = queryBuilder.in("customer_id", options.customerIds);
  }

  const { data, error } = await queryBuilder
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (error || !data) return [];

  return (data as {
    id: string;
    billing_number: string;
    customer_id: string;
    billing_date: string;
    total_amount: number;
    from_date: string;
    to_date: string;
    created_at: string;
    snapshot_rows: SnapshotRow[];
    customers: { name: string; customer_code: string } | null;
  }[]).map((row) => ({
    id: row.id,
    billing_number: row.billing_number,
    customer_id: row.customer_id,
    customer_name: row.customers?.name ?? "ไม่ทราบชื่อร้าน",
    customer_code: row.customers?.customer_code ?? "-",
    billing_date: row.billing_date,
    total_amount: toNum(row.total_amount),
    from_date: row.from_date,
    to_date: row.to_date,
    created_at: row.created_at,
    snapshot_rows: (row.snapshot_rows as SnapshotRow[]) || [],
  }));
}

export async function getBillingStatementData(
  organizationId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  deliveryNumbers?: string[],
): Promise<BillingStatementData | null> {
  const supabase = getSupabaseAdmin();

  let notesQuery = supabase
    .from("delivery_notes")
    .select("id, customer_id, delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true });

  if (deliveryNumbers && deliveryNumbers.length > 0) {
    notesQuery = notesQuery.in("delivery_number", deliveryNumbers);
  }

  const [orgResult, custResult, notesResult, historyResult] = await Promise.all([
    supabase.from("organizations").select("name, metadata").eq("id", organizationId).single(),
    supabase.from("customers").select("id, name, customer_code, address, phone").eq("id", customerId).single(),
    notesQuery,
    supabase.from("billing_records")
      .select("billing_number")
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .eq("from_date", fromDate)
      .eq("to_date", toDate)
      .limit(1)
      .maybeSingle()
  ]);

  if (!orgResult.data || !custResult.data || !notesResult.data || notesResult.data.length === 0) {
    return null;
  }
  const deliveryTotals = await getDeliveryNoteActualTotals(
    supabase,
    (notesResult.data as DeliveryNoteRow[]).map((note) => note.id),
  );

  const orgMeta = (orgResult.data.metadata as Record<string, string>) || {};
  const orgInfo = {
    name: orgResult.data.name || PRINT_ORGANIZATION_NAME,
    address: orgMeta.address || "จังหวัดเชียงใหม่",
    phone: orgMeta.phone || "-",
  };

  const rows = (notesResult.data as DeliveryNoteRow[]).map((note, idx) => ({
    lineNumber: idx + 1,
    deliveryNumber: note.delivery_number,
    deliveryDate: note.delivery_date,
    totalAmount: deliveryTotals.has(note.id)
      ? (deliveryTotals.get(note.id) ?? 0)
      : toNum(note.total_amount),
    notes: note.notes,
  }));

  return {
    customer: {
      id: custResult.data.id,
      code: custResult.data.customer_code,
      name: custResult.data.name,
      address: custResult.data.address,
      phone: custResult.data.phone,
    },
    organization: orgInfo,
    billingDate,
    fromDate,
    toDate,
    grandTotal: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    billingNumber: historyResult.data?.billing_number ?? null,
    isLocked: !!historyResult.data?.billing_number,
    rows,
  };
}

export async function getBatchBillingData(
  organizationId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  customerIds?: string[],
  deliveryNumbers?: string[],
): Promise<BillingStatementData[]> {
  const supabase = getSupabaseAdmin();

  let targetIds = customerIds;
  if (!targetIds || targetIds.length === 0) {
    let customerSourceQuery = supabase
      .from("delivery_notes")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .gte("delivery_date", fromDate)
      .lte("delivery_date", toDate);

    if (deliveryNumbers && deliveryNumbers.length > 0) {
      customerSourceQuery = customerSourceQuery.in("delivery_number", deliveryNumbers);
    }

    const { data: notes } = await customerSourceQuery;
    if (!notes) return [];
    targetIds = Array.from(new Set(notes.map((note) => note.customer_id)));
  }
  if (targetIds.length === 0) return [];

  const results = await Promise.all(
    targetIds.map((id) => {
      const customerDeliveryNumbers = deliveryNumbers;
      return getBillingStatementData(
        organizationId,
        id,
        fromDate,
        toDate,
        billingDate,
        customerDeliveryNumbers,
      );
    }),
  );

  return results.filter((r): r is BillingStatementData => r !== null);
}
