"use server";

import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReserveHistorySnapshot } from "@/lib/orders/reserve-product-history";
import type { WarehouseHistoryPage } from "@/lib/orders/reserve-warehouse-history";

export async function fetchReserveProductHistory(input: { groupId: string; productId: string; from: string }) {
  const session = await requireAnyRole(["admin", "member"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.groupId) || !uuid.test(input.productId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.from)
    || !Number.isFinite(Date.parse(input.from)) || input.from < "2000-01-01" || input.from > "2100-12-31") throw new Error("ข้อมูลประวัติไม่ถูกต้อง");
  const { data, error } = await getSupabaseAdmin().rpc("get_reserve_product_history", {
    p_org: session.organizationId, p_group: input.groupId, p_product: input.productId, p_from: input.from,
  });
  if (error || !data) throw new Error("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่");
  return data as unknown as ReserveHistorySnapshot;
}

export async function fetchReserveWarehouseHistory(input: {
  groupId: string; from: string; to: string; asOf?: string; cursor?: { at: string; id: string } | null;
}): Promise<WarehouseHistoryPage> {
  const session = await requireAnyRole(["admin", "member"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01" && value <= "2100-12-31"
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const instant = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!uuid.test(input.groupId) || !day(input.from) || !day(input.to) || input.from > input.to
    || (input.asOf !== undefined && !instant(input.asOf))
    || (input.cursor && (!input.asOf || !instant(input.cursor.at) || !uuid.test(input.cursor.id)))) throw new Error("ช่วงวันที่หรือข้อมูลประวัติไม่ถูกต้อง");
  const admin = getSupabaseAdmin();
  const group = await admin.from("fresh_reserve_stock_groups").select("id").eq("organization_id", session.organizationId).eq("id", input.groupId).maybeSingle();
  if (group.error || !group.data) throw new Error("ไม่พบคลังสำรองที่เข้าถึงได้");
  const asOf = input.asOf ?? new Date().toISOString();
  const until = new Date(Date.parse(`${input.to}T00:00:00+07:00`) + 86400000).toISOString();
  const bounds = <T extends { eq: (column: string, value: string) => T; gte: (column: string, value: string) => T; lt: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(query: T) => query.eq("group_id", input.groupId).gte("created_at", `${input.from}T00:00:00+07:00`).lt("created_at", until).lte("created_at", asOf);
  let query = bounds(admin.from("fresh_reserve_stock_movements").select("id,quantity_delta,quantity_after,reason,effective_at,created_at,products(name)"));
  if (input.cursor) query = query.or(`created_at.lt.${input.cursor.at},and(created_at.eq.${input.cursor.at},id.lt.${input.cursor.id})`);
  const [rows, count] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51),
    bounds(admin.from("fresh_reserve_stock_movements").select("id", { count: "exact", head: true })),
  ]);
  if (rows.error || count.error || count.count === null) throw new Error("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่");
  const items = (rows.data ?? []).slice(0, 50).map(({ products, ...row }) => ({ ...row, productName: products?.name ?? "ไม่พบชื่อสินค้า" }));
  const last = items.at(-1);
  return { items, total: count.count, asOf, cursor: rows.data && rows.data.length > 50 && last ? { at: last.created_at, id: last.id } : null };
}
