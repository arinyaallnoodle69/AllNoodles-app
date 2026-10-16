"use server";

import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReserveHistorySnapshot } from "@/lib/orders/reserve-product-history";
import type { WarehouseHistoryPage } from "@/lib/orders/reserve-warehouse-history";
import { buildRecentReserveActivities } from "@/lib/orders/reserve-recent-activity";

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
    || (input.cursor && (!input.asOf || !instant(input.cursor.at) || !uuid.test(input.cursor.id.replace(/:(scheduled|received)$/, ""))))) throw new Error("ช่วงวันที่หรือข้อมูลประวัติไม่ถูกต้อง");
  const admin = getSupabaseAdmin();
  const group = await admin.from("fresh_reserve_stock_groups").select("id,start_date").eq("organization_id", session.organizationId).eq("id", input.groupId).maybeSingle();
  if (group.error || !group.data) throw new Error("ไม่พบคลังสำรองที่เข้าถึงได้");
  const startDate = group.data.start_date;
  const asOf = input.asOf ?? new Date().toISOString();
  const until = new Date(Date.parse(`${input.to}T00:00:00+07:00`) + 86400000).toISOString();
  const bounds = <T extends { eq: (column: string, value: string) => T; gte: (column: string, value: string) => T; lt: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(query: T) => query.eq("organization_id", session.organizationId).eq("group_id", input.groupId).gte("event_at", `${input.from}T00:00:00+07:00`).lt("event_at", until).lte("event_at", asOf).lte("created_at", asOf);
  let query = bounds(admin.from("fresh_reserve_history_events").select("id,movement_id,product_id,quantity_delta,quantity_after,reason,effective_at,created_at,event_at,event_kind,product_name"));
  if (input.cursor) query = query.or(`event_at.gt.${input.cursor.at},and(event_at.eq.${input.cursor.at},id.gt.${input.cursor.id})`);
  const [rows, count] = await Promise.all([
    query.order("event_at", { ascending: true }).order("id", { ascending: true }).limit(51),
    bounds(admin.from("fresh_reserve_history_events").select("id", { count: "exact", head: true })),
  ]);
  if (rows.error || count.error || count.count === null) throw new Error("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่");
  const items = (rows.data ?? []).slice(0, 50).map(row => ({
    id: row.id!, movement_id: row.movement_id!, product_id: row.product_id!, quantity_delta: Number(row.quantity_delta),
    quantity_after: row.quantity_after, reason: row.reason!, effective_at: row.effective_at!, created_at: row.created_at!,
    event_at: row.event_at!, event_kind: row.event_kind!, productName: row.product_name ?? "ไม่พบชื่อสินค้า",
  }));
  const snapshots = await Promise.all([...new Set(items.map(item => item.product_id))].map(async productId => {
    const result = await admin.rpc("get_reserve_product_history", { p_org: session.organizationId, p_group: input.groupId, p_product: productId, p_from: startDate });
    if (result.error) throw new Error("โหลดยอดก่อน–หลังไม่สำเร็จ กรุณาลองใหม่");
    return [productId, result.data as unknown as ReserveHistorySnapshot | null] as const;
  }));
  const ledgers = new Map(snapshots.flatMap(([id, snapshot]) => snapshot ? [[id, snapshot] as const] : []));
  const activityById = new Map(buildRecentReserveActivities(items, ledgers, asOf).map(item => [item.id, item]));
  const enrichedItems = items.map(item => {
    const activity = activityById.get(item.id)!;
    const after = !activity.waiting && item.event_kind !== "received" && item.quantity_after !== null ? Number(item.quantity_after) : activity.after;
    return { ...item, waiting: activity.waiting, at: activity.at, after,
      before: activity.waiting ? activity.before : after === null ? null : Math.round((after - Number(item.quantity_delta)) * 1000) / 1000 };
  });
  const last = items.at(-1);
  return { items: enrichedItems, total: count.count, asOf, cursor: rows.data && rows.data.length > 50 && last ? { at: last.event_at, id: last.id } : null };
}
