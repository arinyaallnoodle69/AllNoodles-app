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

type WarehouseProductMode = "disabled" | "fresh" | "stock";

type WarehouseProductModeItem = {
  brand: string;
  categoryNames: string[];
  id: string;
  modeByWarehouseId: Record<string, WarehouseProductMode>;
  name: string;
  supplierIdByWarehouseId: Record<string, string | null>;
  sku: string;
  imageUrl: string | null;
};

type WarehouseSupplierOption = {
  code: string;
  id: string;
  name: string;
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
    .select("id, name, customer_code, default_warehouse_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const customers = ((customerRows ?? []) as Array<{ id: string; name: string; customer_code: string; default_warehouse_id: string | null }>).map((c) => ({
    id: c.id,
    name: c.name,
    code: c.customer_code,
    default_warehouse_id: c.default_warehouse_id,
  }));

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

async function getWarehouseProductModeItems(organizationId: string): Promise<WarehouseProductModeItem[]> {
  const admin = getSupabaseAdmin();

  const [productsResult, categoriesResult, modesResult, imagesResult] = await Promise.all([
    admin
      .from("products")
      .select(`
        id,
        sku,
        name,
        metadata,
        display_order,
        product_category_items(product_categories(name))
      `)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("sku", { ascending: true }),
    admin
      .from("warehouses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    (admin as unknown as {
      from(table: "product_warehouse_fulfillment_modes"): {
        select(cols: string): {
          eq(col: string, val: string): Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
        };
      };
    })
      .from("product_warehouse_fulfillment_modes")
      .select("product_id, warehouse_id, mode, supplier_id")
      .eq("organization_id", organizationId),
    admin
      .from("product_images")
      .select("product_id, public_url, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true }),
  ]);

  if (productsResult.error || categoriesResult.error || modesResult.error || imagesResult.error) {
    return [];
  }

  const imageMap = new Map<string, string>();
  for (const img of (imagesResult.data ?? []) as Array<{ product_id: string; public_url: string }>) {
    if (!imageMap.has(img.product_id)) {
      imageMap.set(img.product_id, img.public_url);
    }
  }

  const warehouseIds = new Set(((categoriesResult.data ?? []) as Array<{ id: string }>).map((warehouse) => warehouse.id));
  const modeByProductWarehouse = new Map<string, WarehouseProductMode>();
  const supplierIdByProductWarehouse = new Map<string, string | null>();
  for (const row of (modesResult.data ?? []) as Array<{ product_id: string; warehouse_id: string; mode: WarehouseProductMode; supplier_id: string | null }>) {
    modeByProductWarehouse.set(`${row.product_id}:${row.warehouse_id}`, row.mode);
    supplierIdByProductWarehouse.set(`${row.product_id}:${row.warehouse_id}`, row.supplier_id ?? null);
  }

  return ((productsResult.data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    metadata: Record<string, unknown> | null;
    product_category_items?: Array<{ product_categories: { name: string } | null }> | null;
  }>)
    .filter((product) => !product.metadata?.deleted)
    .map((product) => {
      const modeByWarehouseId: Record<string, WarehouseProductMode> = {};
      const supplierIdByWarehouseId: Record<string, string | null> = {};
      for (const warehouseId of warehouseIds) {
        modeByWarehouseId[warehouseId] = modeByProductWarehouse.get(`${product.id}:${warehouseId}`) ?? "stock";
        supplierIdByWarehouseId[warehouseId] = supplierIdByProductWarehouse.get(`${product.id}:${warehouseId}`) ?? null;
      }

      return {
        brand: typeof product.metadata?.brand === "string" ? product.metadata.brand : "",
        categoryNames: (product.product_category_items ?? [])
          .map((item) => item.product_categories?.name ?? "")
          .filter(Boolean),
        id: product.id,
        modeByWarehouseId,
        name: product.name,
        supplierIdByWarehouseId,
        sku: product.sku,
        imageUrl: imageMap.get(product.id) ?? null,
      };
    });
}

async function getWarehouseSupplierOptions(organizationId: string): Promise<WarehouseSupplierOption[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("suppliers")
    .select("id, supplier_code, name")
    .eq("organization_id", organizationId)
    .order("supplier_code", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as Array<{ id: string; supplier_code: string; name: string }>).map((supplier) => ({
    code: supplier.supplier_code,
    id: supplier.id,
    name: supplier.name,
  }));
}

export default async function SettingsWarehousesPage({
  searchParams,
}: SettingsWarehousesPageProps) {
  const session = await requireAppRole("admin");
  const [warehouses, productModeItems, suppliers] = await Promise.all([
    getWarehousesWithCounts(session.organizationId),
    getWarehouseProductModeItems(session.organizationId),
    getWarehouseSupplierOptions(session.organizationId),
  ]);
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
            <p className="text-lg font-black text-[#4A148C]">จัดการคลัง</p>
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
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[#4A148C]/20 bg-white px-4 text-sm font-bold text-[#4A148C] transition hover:border-[#4A148C] hover:bg-[#4A148C]/[0.04] active:scale-[0.98]"
            >
              ค้นหา
            </button>
            <Link
              href="/settings/warehouses?create=1"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition hover:bg-[#4A148C] active:scale-[0.98]"
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
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition active:scale-[0.98]"
          >
            ค้นหา
          </button>
        </form>
      </MobileSearchDrawer>

      <Link
        href="/settings/warehouses?create=1"
        aria-label="เพิ่มคลัง"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </Link>

      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-8 animate-fade-in">
        <WarehouseListPanel products={productModeItems} suppliers={suppliers} warehouses={filteredWarehouses} />
      </div>

      {params.create === "1" ? <WarehouseForm returnHref="/settings/warehouses" /> : null}
      {editingWarehouse ? (
        <WarehouseForm initialWarehouse={editingWarehouse} returnHref="/settings/warehouses" />
      ) : null}
    </SettingsShell>
  );
}
