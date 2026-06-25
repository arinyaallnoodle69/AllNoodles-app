import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import { createWarehouseStockMap, getProductWarehouseStockSnapshots } from "@/lib/stock/warehouse-stocks";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Row types

type CustomerRow = { id: string; customer_code: string; default_warehouse_id: string | null; default_vehicle_id: string | null; name: string };
type ProductRow = {
  cost_price: number | string;
  id: string;
  metadata: unknown;
  name: string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
  display_order?: number;
};
type ProductImageRow = {
  product_id: string;
  public_url: string;
  sort_order: number;
};
type ProductCategoryRow = { id: string; name: string; sort_order: number };
type ProductCategoryItemRow = { product_category_id: string; product_id: string };
type SaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
  id: string;
  is_default: boolean;
  min_order_qty: number | string;
  product_id: string;
  step_order_qty: number | string | null;
  unit_label: string;
};
type VehicleRow = { id: string; name: string };

// Typed admin client

type SelectChain<T> = {
  eq: (col: string, val: string | boolean) => SelectChain<T>;
  order: (
    col: string,
    opts: { ascending: boolean },
  ) => Promise<{ data: T[] | null; error: { message?: string } | null }>;
};

type ManageAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from(table: "customers"): { select: (cols: string) => SelectChain<CustomerRow> };
  from(table: "products"): { select: (cols: string) => SelectChain<ProductRow> };
  from(table: "product_sale_units"): { select: (cols: string) => SelectChain<SaleUnitRow> };
  from(table: "vehicles"): { select: (cols: string) => SelectChain<VehicleRow> };
};

const codeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function getCodeSequence(code: string) {
  const match = code.trim().match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function compareCustomerCode(left: OrderCustomerOption, right: OrderCustomerOption) {
  const leftSequence = getCodeSequence(left.code);
  const rightSequence = getCodeSequence(right.code);

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const codeComparison = codeCollator.compare(left.code.trim(), right.code.trim());

  if (codeComparison !== 0) {
    return codeComparison;
  }

  return left.name.localeCompare(right.name, "th");
}

function compareProductSku(left: OrderProductOption, right: OrderProductOption) {
  const leftSequence = getCodeSequence(left.sku);
  const rightSequence = getCodeSequence(right.sku);

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const skuComparison = codeCollator.compare(left.sku.trim(), right.sku.trim());

  if (skuComparison !== 0) {
    return skuComparison;
  }

  return left.name.localeCompare(right.name, "th");
}

// Exported types

export type OrderCustomerOption = { code: string; defaultWarehouseId: string | null; defaultVehicleId: string | null; id: string; name: string };

export type OrderVehicleOption = { id: string; name: string };

export type OrderProductOption = {
  baseCostPrice: number;
  brand: string;
  categoryIds: string[];
  categoryNames: string[];
  id: string;
  imageUrl: string | null;
  name: string;
  saleUnits: {
    baseUnitQuantity: number;
    costMode: string | null;
    fixedCostPrice: number | null;
    id: string;
    isDefault: boolean;
    label: string;
    minOrderQty: number;
    stepOrderQty: number | null;
  }[];
  sku: string;
  stockQuantity: number;
  unit: string;
  warehouseStocks: {
    reservedQuantity: number;
    stockQuantity: number;
    warehouseId: string;
  }[];
  display_order?: number;
};

// Queries

export async function getCustomersForOrder(orgId: string): Promise<OrderCustomerOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin() as unknown as ManageAdmin;
  const { data } = await admin
    .from("customers")
    .select("id, customer_code, name, default_warehouse_id, default_vehicle_id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("customer_code", { ascending: true });

  return (data ?? [])
    .map((c) => ({
      code: c.customer_code,
      defaultWarehouseId: c.default_warehouse_id,
      defaultVehicleId: c.default_vehicle_id,
      id: c.id,
      name: c.name,
    }))
    .toSorted(compareCustomerCode);
}

export async function getVehiclesForOrder(orgId: string): Promise<OrderVehicleOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin() as unknown as ManageAdmin;
  const { data } = await admin
    .from("vehicles")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));
}

export async function getProductsForOrder(orgId: string): Promise<OrderProductOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheTag(`stock-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin();

  const [productsRes, saleUnitsRes, productImagesRes, categoriesRes, categoryItemsRes] =
    await Promise.all([
      admin
        .from("products")
        .select("id, name, sku, unit, stock_quantity, cost_price, display_order, metadata")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("product_sale_units")
        .select(
          "id, product_id, unit_label, base_unit_quantity, is_active, is_default, sort_order, cost_mode, fixed_cost_price, min_order_qty, step_order_qty",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_images")
        .select("product_id, public_url, sort_order")
        .eq("organization_id", orgId)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_categories")
        .select("id, name, sort_order")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_category_items")
        .select("product_category_id, product_id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
    ]);

  if (productsRes.error) {
    console.error("[getProductsForOrder] Database Error:", productsRes.error);
    return [];
  }

  const warehouseStocks = await getProductWarehouseStockSnapshots(
    orgId,
    (productsRes.data ?? []).map((product) => product.id),
  );
  const warehouseStockMap = createWarehouseStockMap(warehouseStocks);

  const productUnitMap = new Map((productsRes.data ?? []).map(p => [p.id, p.unit]));
  const byProduct = new Map<string, OrderProductOption["saleUnits"]>();
  for (const u of saleUnitsRes.data ?? []) {
    const list = byProduct.get(u.product_id) ?? [];
    list.push({
      baseUnitQuantity: Number(u.base_unit_quantity),
      costMode: u.cost_mode ?? null,
      fixedCostPrice:
        u.fixed_cost_price === null || u.fixed_cost_price === undefined
          ? null
          : Number(u.fixed_cost_price),
      id: u.id,
      isDefault: u.is_default,
      label: productUnitMap.get(u.product_id) ?? u.unit_label,
      minOrderQty: Number(u.min_order_qty ?? 1),
      stepOrderQty:
        u.step_order_qty === null || u.step_order_qty === undefined
          ? null
          : Number(u.step_order_qty),
    });
    byProduct.set(u.product_id, list);
  }

  const firstImageByProductId = new Map<string, string>();
  for (const image of ((productImagesRes.data ?? []) as ProductImageRow[]) ?? []) {
    if (!firstImageByProductId.has(image.product_id)) {
      firstImageByProductId.set(image.product_id, image.public_url);
    }
  }

  const categories = ((categoriesRes.data ?? []) as ProductCategoryRow[]) ?? [];
  const categoryItemIdsByProductId = new Map<string, Set<string>>();

  for (const item of ((categoryItemsRes.data ?? []) as ProductCategoryItemRow[]) ?? []) {
    const current = categoryItemIdsByProductId.get(item.product_id) ?? new Set<string>();
    current.add(item.product_category_id);
    categoryItemIdsByProductId.set(item.product_id, current);
  }

  const mapped = (productsRes.data ?? []).map((p) => {
    const baseCostPrice = Number(p.cost_price ?? 0);
    const metadata =
      p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
        ? (p.metadata as Record<string, unknown>)
        : {};
    const productCategoryIds = categoryItemIdsByProductId.get(p.id) ?? new Set<string>();
    const productCategories = categories.filter((category) => productCategoryIds.has(category.id));

    return {
      baseCostPrice,
      brand: typeof metadata.brand === "string" ? metadata.brand.trim() : "",
      categoryIds: productCategories.map((category) => category.id),
      categoryNames: productCategories.map((category) => category.name),
      id: p.id,
      imageUrl: firstImageByProductId.get(p.id) ?? null,
      name: p.name,
      saleUnits: byProduct.get(p.id) ?? [],
      sku: p.sku,
      stockQuantity: Number(p.stock_quantity),
      unit: p.unit,
      warehouseStocks: (warehouseStockMap.get(p.id) ?? []).map((stock) => ({
        reservedQuantity: stock.reservedQuantity,
        stockQuantity: stock.stockQuantity,
        warehouseId: stock.warehouseId,
      })),
      display_order: p.display_order ?? undefined,
    };
  });

  return sortProductsByCategory(
    mapped.toSorted(compareProductSku),
    categories.map((category) => ({ id: category.id, sortOrder: Number(category.sort_order) })),
  );
}
