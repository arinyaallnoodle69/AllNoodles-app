import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const billingTable = (supabase: ReturnType<typeof getSupabaseAdmin>) => supabase;

export type SnapshotRow = {
  lineNumber: number;
  deliveryNumber: string;
  deliveryDate: string;
  totalAmount: number;
  notes: string | null;
};

export type BillingStatementData = {
  billingNumber: string | null;
  billingDate: string;
  fromDate: string;
  toDate: string;
  isLocked: boolean;
  customer: {
    id: string;
    name: string;
    code: string;
    address: string;
  };
  organization: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  rows: SnapshotRow[];
  grandTotal: number;
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
  isSnapshotLocked: boolean;
};

export type BillingCandidate = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryCount: number;
  totalAmount: number;
  latestDeliveryDate: string;
  deliveryNumbers: string[];
  billingNumber: string | null;
};

type CustomerLookup = {
  id: string;
  name: string;
  customer_code: string;
  address: string | null;
};

type RawDeliveryNote = {
  id: string;
  customer_id: string;
  delivery_number: string;
  delivery_date: string;
  total_amount: number | string;
  notes: string | null;
  customers: {
    id: string;
    name: string;
    customer_code: string;
  };
};

function toNum(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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
  toDate: string,
): Promise<BillingCandidate[]> {
  const supabase = getSupabaseAdmin();
  const { data: notesData, error } = await supabase
    .from("delivery_notes")
    .select(`
      id,
      customer_id,
      delivery_number,
      delivery_date,
      total_amount,
      notes,
      customers!inner(id, name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !notesData) return [];

  const grouped = new Map<string, BillingCandidate>();

  for (const note of notesData as RawDeliveryNote[]) {
    const current = grouped.get(note.customer_id) ?? {
      customerId: note.customer_id,
      customerName: note.customers.name,
      customerCode: note.customers.customer_code,
      deliveryCount: 0,
      totalAmount: 0,
      latestDeliveryDate: note.delivery_date,
      deliveryNumbers: [],
      billingNumber: null,
    };

    current.deliveryCount += 1;
    current.totalAmount += toNum(note.total_amount);
    if (note.delivery_date > current.latestDeliveryDate) {
      current.latestDeliveryDate = note.delivery_date;
    }
    current.deliveryNumbers.push(note.delivery_number);
    grouped.set(note.customer_id, current);
  }

  const candidates = Array.from(grouped.values());
  if (candidates.length === 0) return [];

  const { data: billingRows } = await supabase
    .from("billing_records")
    .select("customer_id, billing_number")
    .eq("organization_id", organizationId)
    .eq("from_date", fromDate)
    .eq("to_date", toDate)
    .in("customer_id", candidates.map((candidate) => candidate.customerId));

  const billingByCustomer = new Map<string, string>();
  for (const row of (billingRows ?? []) as { customer_id: string; billing_number: string }[]) {
    billingByCustomer.set(row.customer_id, row.billing_number);
  }

  for (const candidate of candidates) {
    candidate.billingNumber = billingByCustomer.get(candidate.customerId) ?? null;
  }

  return sortByCustomerCode(candidates);
}

export async function getBillingHistory(
  organizationId: string,
  limit: number = 20,
): Promise<BillingRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await billingTable(supabase)
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
      customers(name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  const records: BillingRecord[] = (data as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    billing_number: row.billing_number as string,
    customer_id: row.customer_id as string,
    customer_name: (row.customers as { name: string } | null)?.name ?? "ไม่ทราบชื่อร้าน",
    customer_code: (row.customers as { customer_code: string } | null)?.customer_code ?? "-",
    billing_date: row.billing_date as string,
    total_amount: toNum(row.total_amount as number | string | null | undefined),
    from_date: row.from_date as string,
    to_date: row.to_date as string,
    created_at: row.created_at as string,
    snapshot_rows:
      Array.isArray(row.snapshot_rows) && row.snapshot_rows.length > 0
        ? (row.snapshot_rows as unknown as SnapshotRow[])
        : [],
    isSnapshotLocked: Array.isArray(row.snapshot_rows) && row.snapshot_rows.length > 0,
  }));

  const missingSnapshots = records.filter((record) => record.snapshot_rows.length === 0);
  if (missingSnapshots.length === 0) return records;

  const customerIds = Array.from(new Set(missingSnapshots.map((record) => record.customer_id)));
  const minDate = missingSnapshots.reduce(
    (min, record) => (record.from_date < min ? record.from_date : min),
    missingSnapshots[0].from_date,
  );
  const maxDate = missingSnapshots.reduce(
    (max, record) => (record.to_date > max ? record.to_date : max),
    missingSnapshots[0].to_date,
  );

  const { data: freshNotes } = await supabase
    .from("delivery_notes")
    .select("delivery_number, delivery_date, total_amount, notes, customer_id")
    .eq("organization_id", organizationId)
    .in("customer_id", customerIds)
    .gte("delivery_date", minDate)
    .lte("delivery_date", maxDate)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (!freshNotes) return records;

  const notesByCustomer = new Map<string, RawDeliveryNote[]>();
  for (const note of freshNotes as unknown as RawDeliveryNote[]) {
    const bucket = notesByCustomer.get(note.customer_id) ?? [];
    bucket.push(note);
    notesByCustomer.set(note.customer_id, bucket);
  }

  for (const record of records) {
    if (record.snapshot_rows.length > 0) continue;
    const customerNotes = notesByCustomer.get(record.customer_id) ?? [];
    const rows = customerNotes
      .filter((note) => note.delivery_date >= record.from_date && note.delivery_date <= record.to_date)
      .map((note, index) => ({
        lineNumber: index + 1,
        deliveryNumber: note.delivery_number,
        deliveryDate: note.delivery_date,
        totalAmount: toNum(note.total_amount),
        notes: note.notes,
      }));
    record.snapshot_rows = rows;
  }

  return records;
}

export async function getBillingStatementData(
  organizationId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  options: { existingBillingNumber?: string } = {},
): Promise<BillingStatementData | null> {
  const supabase = getSupabaseAdmin();
  const db = billingTable(supabase);

  const { data: existingRecord } = await db
    .from("billing_records")
    .select("billing_number, snapshot_rows")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("from_date", fromDate)
    .eq("to_date", toDate)
    .maybeSingle();

  const locked = existingRecord as {
    billing_number: string;
    snapshot_rows: SnapshotRow[] | null;
  } | null;

  const [{ data: customerData }, { data: orgData }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, customer_code, address")
      .eq("id", customerId)
      .single(),
    supabase
      .from("organizations")
      .select("name, metadata")
      .eq("id", organizationId)
      .single(),
  ]);

  if (!customerData || !orgData) return null;

  const customer = customerData as CustomerLookup;
  const metadata =
    typeof orgData.metadata === "object" && orgData.metadata !== null
      ? (orgData.metadata as Record<string, unknown>)
      : {};

  if (locked?.snapshot_rows && locked.snapshot_rows.length > 0) {
    return {
      billingNumber: locked.billing_number,
      billingDate,
      fromDate,
      toDate,
      isLocked: true,
      customer: {
        id: customer.id,
        name: customer.name,
        code: customer.customer_code,
        address: customer.address ?? "",
      },
      organization: {
        name: orgData.name,
        address: (metadata.address as string) ?? null,
        phone: (metadata.phone as string) ?? null,
      },
      rows: locked.snapshot_rows,
      grandTotal: locked.snapshot_rows.reduce((sum, row) => sum + row.totalAmount, 0),
    };
  }

  const { data: notesData, error } = await supabase
    .from("delivery_notes")
    .select("delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !notesData || notesData.length === 0) return null;

  const rows: SnapshotRow[] = (notesData as {
    delivery_number: string;
    delivery_date: string;
    total_amount: number | string;
    notes: string | null;
  }[]).map((row, index) => ({
    lineNumber: index + 1,
    deliveryNumber: row.delivery_number,
    deliveryDate: row.delivery_date,
    totalAmount: toNum(row.total_amount),
    notes: row.notes,
  }));

  return {
    billingNumber: locked?.billing_number ?? options.existingBillingNumber ?? null,
    billingDate,
    fromDate,
    toDate,
    isLocked: false,
    customer: {
      id: customer.id,
      name: customer.name,
      code: customer.customer_code,
      address: customer.address ?? "",
    },
    organization: {
      name: orgData.name,
      address: (metadata.address as string) ?? null,
      phone: (metadata.phone as string) ?? null,
    },
    rows,
    grandTotal: rows.reduce((sum, row) => sum + row.totalAmount, 0),
  };
}

export async function getBatchBillingData(
  organizationId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  customerIds?: string[],
): Promise<BillingStatementData[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("delivery_notes")
    .select("customer_id")
    .eq("organization_id", organizationId)
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .eq("status", "confirmed")
    .order("customer_id");

  if (customerIds && customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const uniqueIds = customerIds && customerIds.length > 0
    ? customerIds
    : Array.from(new Set(data.map((row) => row.customer_id)));

  const results: BillingStatementData[] = [];
  for (const customerId of uniqueIds) {
    const statement = await getBillingStatementData(
      organizationId,
      customerId,
      fromDate,
      toDate,
      billingDate,
    );
    if (statement) results.push(statement);
  }

  const sortableResults = results.map((row) => ({
    row,
    customerCode: row.customer.code,
    customerName: row.customer.name,
  }));

  sortByCustomerCode(sortableResults);
  return sortableResults.map((item) => item.row);
}
