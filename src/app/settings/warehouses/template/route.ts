import "server-only";

import writeExcelFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WarehouseMode = "disabled" | "fresh" | "stock";

type TemplateProduct = {
  brand: string;
  categoryNames: string[];
  id: string;
  name: string;
  sku: string;
};

type TemplateModeRow = {
  mode: WarehouseMode;
  product_id: string;
  supplier_id: string | null;
  suppliers?: { name: string } | null;
  warehouse_id: string;
};

function modeLabel(mode: WarehouseMode) {
  if (mode === "fresh") return "ผลิตสด";
  if (mode === "disabled") return "ไม่ใช้ในคลังนี้";
  return "ใช้สต็อก";
}

export async function GET() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const productWarehouseModesTable = (admin as unknown as {
    from(table: "product_warehouse_fulfillment_modes"): {
      select(columns: string): {
        eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  }).from("product_warehouse_fulfillment_modes");

  const [productsResult, warehousesResult, modesResult] = await Promise.all([
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
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("sku", { ascending: true }),
    admin
      .from("warehouses")
      .select("id, name, slug")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    productWarehouseModesTable
      .select("product_id, warehouse_id, mode, supplier_id, suppliers(name)")
      .eq("organization_id", session.organizationId),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message ?? "Failed to load products.");
  if (warehousesResult.error) throw new Error(warehousesResult.error.message ?? "Failed to load warehouses.");
  if (modesResult.error) throw new Error(modesResult.error.message ?? "Failed to load warehouse product modes.");

  const warehouses = (warehousesResult.data ?? []) as Array<{ id: string; name: string; slug: string }>;
  const modeByProductWarehouse = new Map<string, TemplateModeRow>(
    ((modesResult.data ?? []) as TemplateModeRow[])
      .map((row) => [`${row.product_id}:${row.warehouse_id}`, row]),
  );
  const products: TemplateProduct[] = ((productsResult.data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    metadata: Record<string, unknown> | null;
    product_category_items?: Array<{ product_categories: { name: string } | null }> | null;
  }>)
    .filter((product) => !product.metadata?.deleted)
    .map((product) => ({
      brand: typeof product.metadata?.brand === "string" ? product.metadata.brand : "",
      categoryNames: (product.product_category_items ?? [])
        .map((item) => item.product_categories?.name ?? "")
        .filter(Boolean),
      id: product.id,
      name: product.name,
      sku: product.sku,
    }));

  const headerRow = [
    { value: "SKU", fontWeight: "bold" },
    { value: "ชื่อสินค้า", fontWeight: "bold" },
    { value: "หมวดหมู่", fontWeight: "bold" },
    { value: "แบรนด์", fontWeight: "bold" },
    ...warehouses.flatMap((warehouse) => {
      const title = `${warehouse.name} (${warehouse.slug.toUpperCase()})`;
      return [
        { value: `${title} - โหมด`, fontWeight: "bold" as const },
        { value: `${title} - โรงงาน`, fontWeight: "bold" as const },
      ];
    }),
  ];

  const rows: SheetData = [
    headerRow,
    ...products.map((product) => [
      { value: product.sku },
      { value: product.name },
      { value: product.categoryNames.join(", ") },
      { value: product.brand },
      ...warehouses.flatMap((warehouse) => {
        const row = modeByProductWarehouse.get(`${product.id}:${warehouse.id}`);
        return [
          { value: modeLabel(row?.mode ?? "stock") },
          { value: row?.mode === "fresh" ? (row.suppliers?.name ?? "") : "" },
        ];
      }),
    ]),
  ];

  const buffer = await writeExcelFile(rows, {
    columns: [
      { width: 14 },
      { width: 34 },
      { width: 24 },
      { width: 20 },
      ...warehouses.flatMap(() => [{ width: 20 }, { width: 24 }]),
    ],
    sheet: "Warehouse Product Modes",
  }).toBuffer();
  const body = new Blob([new Uint8Array(buffer)]);

  return new Response(body, {
    headers: {
      "Content-Disposition": 'attachment; filename="all-noodles-warehouse-product-modes-template.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
