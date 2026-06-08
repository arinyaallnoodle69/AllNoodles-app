import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type WarehouseOption = {
  id: string;
  isActive: boolean;
  name: string;
  slug: string;
  sortOrder: number;
};

type WarehouseRow = {
  id: string;
  is_active: boolean;
  name: string;
  slug: string;
  sort_order: number | string | null;
};

type CustomerWarehouseRow = {
  default_warehouse_id: string | null;
  warehouses: WarehouseRow | null;
};

type OrderWarehouseRow = {
  warehouse_id: string | null;
  warehouses: WarehouseRow | null;
};

type WarehouseQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type WarehouseQuery = {
  eq(column: string, value: boolean | string): WarehouseQuery;
  maybeSingle(): Promise<WarehouseQueryResult>;
  order(column: string, options: { ascending: boolean }): WarehouseQuery;
  select(columns: string): WarehouseQuery;
  then: Promise<WarehouseQueryResult>["then"];
};

function mapWarehouse(row: WarehouseRow): WarehouseOption {
  return {
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    slug: row.slug,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function getWarehouseClient() {
  return getSupabaseAdmin() as unknown as {
    from(table: string): WarehouseQuery;
  };
}

export const getActiveWarehouses = cache(async (organizationId: string): Promise<WarehouseOption[]> => {
  const admin = getWarehouseClient();
  const { data, error } = await admin
    .from("warehouses")
    .select("id, slug, name, is_active, sort_order")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as WarehouseRow[]).map(mapWarehouse);
});

export async function getCustomerRequiredWarehouse(
  organizationId: string,
  customerId: string,
): Promise<{ error: string; warehouse: null } | { error: null; warehouse: WarehouseOption }> {
  const admin = getWarehouseClient();
  const { data, error } = await admin
    .from("customers")
    .select("default_warehouse_id, warehouses:default_warehouse_id(id, slug, name, is_active, sort_order)")
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { error: error.message ?? "โหลดข้อมูลคลังของร้านค้าไม่สำเร็จ", warehouse: null };
  }

  const row = data as CustomerWarehouseRow | null;

  if (!row) {
    return { error: "ไม่พบร้านค้านี้ในระบบ", warehouse: null };
  }

  if (!row.default_warehouse_id || !row.warehouses) {
    return { error: "ร้านค้านี้ยังไม่ได้ตั้งคลังประจำ กรุณาตั้งค่าคลังก่อนสร้างรายการ", warehouse: null };
  }

  if (!row.warehouses.is_active) {
    return { error: "คลังประจำของร้านค้านี้ถูกปิดใช้งาน กรุณาเลือกคลังใหม่", warehouse: null };
  }

  return { error: null, warehouse: mapWarehouse(row.warehouses) };
}

export async function getOrderRequiredWarehouse(
  organizationId: string,
  orderId: string,
): Promise<{ error: string; warehouse: null } | { error: null; warehouse: WarehouseOption }> {
  const admin = getWarehouseClient();
  const { data, error } = await admin
    .from("orders")
    .select("warehouse_id, warehouses:warehouse_id(id, slug, name, is_active, sort_order)")
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return { error: error.message ?? "โหลดข้อมูลคลังของออเดอร์ไม่สำเร็จ", warehouse: null };
  }

  const row = data as OrderWarehouseRow | null;

  if (!row) {
    return { error: "ไม่พบออเดอร์นี้ในระบบ", warehouse: null };
  }

  if (!row.warehouse_id || !row.warehouses) {
    return { error: "ออเดอร์นี้ยังไม่ได้ผูกคลัง กรุณาตรวจสอบร้านค้าก่อนทำรายการสต็อค", warehouse: null };
  }

  if (!row.warehouses.is_active) {
    return { error: "คลังของออเดอร์นี้ถูกปิดใช้งาน กรุณาตรวจสอบก่อนทำรายการสต็อค", warehouse: null };
  }

  return { error: null, warehouse: mapWarehouse(row.warehouses) };
}
