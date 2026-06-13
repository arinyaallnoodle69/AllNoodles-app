import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { WarehouseForm, type WarehouseMetadata } from "@/components/settings/warehouse-form";
import { WarehouseListPanel } from "@/components/settings/warehouse-list-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = {
  title: "จัดการคลัง",
};

type SettingsWarehousesPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
    q?: string;
  }>;
};

type DbWarehouseRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  sort_order: number | string | null;
  address?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postal_code?: string | null;
  metadata?: WarehouseMetadata | null;
};

type DbCustomerRow = {
  id: string;
  name: string;
  code: string;
  default_warehouse_id: string | null;
};

type WarehouseAdminClient = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string | boolean): WarehouseAdminChain;
    };
  };
};

type WarehouseAdminChain = {
  eq(col: string, val: string | boolean): WarehouseAdminChain;
  order(col: string, opts: { ascending: boolean }): WarehouseAdminChain;
  then: Promise<{ data: unknown; error: { message?: string } | null }>["then"];
};

async function getWarehousesWithCounts(organizationId: string) {
  const admin = getSupabaseAdmin() as unknown as WarehouseAdminClient;

  const { data: warehouseRows, error: warehouseError } = await admin
    .from("warehouses")
    .select("id, slug, name, is_active, sort_order, address, subdistrict, district, province, postal_code, metadata")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (warehouseError || !warehouseRows) {
    return [];
  }

  const warehouses = warehouseRows as DbWarehouseRow[];

  const { data: customerRows } = await admin
    .from("customers")
    .select("id, name, code, default_warehouse_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const customers = (customerRows ?? []) as DbCustomerRow[];

  const customersByWarehouse = new Map<string, Array<{ id: string; name: string; code: string }>>();
  for (const c of customers) {
    if (c.default_warehouse_id) {
      if (!customersByWarehouse.has(c.default_warehouse_id)) {
        customersByWarehouse.set(c.default_warehouse_id, []);
      }
      customersByWarehouse.get(c.default_warehouse_id)!.push({
        id: c.id,
        name: c.name,
        code: c.code
      });
    }
  }

  return warehouses.map((w) => ({
    customers: customersByWarehouse.get(w.id) ?? [],
    customerCount: (customersByWarehouse.get(w.id) ?? []).length,
    id: w.id,
    isActive: w.is_active,
    name: w.name,
    slug: w.slug,
    sortOrder: Number(w.sort_order ?? 0),
    address: w.address,
    subdistrict: w.subdistrict,
    district: w.district,
    province: w.province,
    postalCode: w.postal_code,
    metadata: w.metadata,
  }));
}

export default async function SettingsWarehousesPage({
  searchParams,
}: SettingsWarehousesPageProps) {
  const session = await requireAppRole("admin");
  const warehouses = await getWarehousesWithCounts(session.organizationId);
  const params = await searchParams;
  const searchTerm = params.q?.trim() ?? "";
  const normalizedSearch = searchTerm.toLocaleLowerCase("th");
  const filteredWarehouses = normalizedSearch
    ? warehouses.filter((warehouse) =>
        [
          warehouse.name,
          warehouse.slug,
          warehouse.address,
          warehouse.subdistrict,
          warehouse.district,
          warehouse.province,
          warehouse.postalCode,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("th").includes(normalizedSearch)),
      )
    : warehouses;
  const editingWarehouse = params.edit
    ? (warehouses.find((w) => w.id === params.edit) ?? null)
    : null;

  return (
    <SettingsShell
      current="warehouses"
      title="จัดการคลัง"
      description="เพิ่ม แก้ไข และจัดการคลังสินค้าสำหรับกระจายสต็อคแยกตามพื้นที่"
      floatingSubmit={false}
      hideHeader
    >
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-black text-[#8E24AA]">จัดการคลัง</p>
            <p className="text-xs font-semibold text-[#667085]">
              แสดง {filteredWarehouses.length.toLocaleString("th-TH")} จาก {warehouses.length.toLocaleString("th-TH")} คลัง
            </p>
          </div>

          <form action="/settings/warehouses" method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:w-[48rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อคลัง รหัส หรือที่อยู่"
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#8E24AA] outline-none transition placeholder:text-[#667085] focus:border-[#8E24AA] focus:ring-2 focus:ring-[#8E24AA]/15"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[#8E24AA]/20 bg-white px-4 text-sm font-bold text-[#8E24AA] transition hover:border-[#8E24AA] hover:bg-[#8E24AA]/[0.04] active:scale-[0.98]"
            >
              ค้นหา
            </button>
            <Link
              href="/settings/warehouses?create=1"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#8E24AA] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition hover:bg-[#8E24AA] active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มคลัง
            </Link>
          </form>
        </div>
      </div>

      <MobileSearchDrawer title="ค้นหาคลัง">
        <form action="/settings/warehouses" method="get" className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={searchTerm}
              placeholder="ค้นหาชื่อคลัง รหัส หรือที่อยู่"
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#8E24AA] outline-none transition placeholder:text-[#667085] focus:border-[#8E24AA] focus:ring-2 focus:ring-[#8E24AA]/15"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#8E24AA] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition active:scale-[0.98]"
          >
            ค้นหา
          </button>
        </form>
      </MobileSearchDrawer>

      <Link
        href="/settings/warehouses?create=1"
        aria-label="เพิ่มคลัง"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#8E24AA] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </Link>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-8 animate-fade-in">
        <WarehouseListPanel warehouses={filteredWarehouses} />
      </div>

      {params.create === "1" ? <WarehouseForm returnHref="/settings/warehouses" /> : null}
      {editingWarehouse ? (
        <WarehouseForm initialWarehouse={editingWarehouse} returnHref="/settings/warehouses" />
      ) : null}
    </SettingsShell>
  );
}
