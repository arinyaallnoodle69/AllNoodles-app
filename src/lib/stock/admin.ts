import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getEffectiveSaleUnitCost,
  normalizeSaleUnitCostMode,
  type SaleUnitCostMode,
} from "@/lib/products/sale-unit-cost";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";


export type StockProductOption = {
  costPrice: number;
  displayOrder: number;
  id: string;
  imageUrl: string | null;
  isActive: boolean;
  name: string;
  onHandQuantity: number;
  reservedQuantity: number;
  saleUnits: {
    baseUnitQuantity: number;
    costMode: SaleUnitCostMode;
    effectiveCostPrice: number;
    id: string;
    isDefault: boolean;
    label: string;
  }[];
  warehouseStocks: {
    onHandQuantity: number;
    reservedQuantity: number;
    warehouseId: string;
  }[];
  warehouseModes: {
    mode: ProductWarehouseFulfillmentMode;
    supplierId: string | null;
    supplierName: string | null;
    warehouseId: string;
  }[];
  categoryName: string | null;
  brandName: string | null;
  sku: string;
  unit: string;
};

export type StockSupplierOption = {
  id: string;
  name: string;
  code: string;
};

export type StockMovementRow = {
  createdAt: string;
  id: string;
  movementType: string;
  notes: string | null;
  productId: string;
  productName: string;
  quantityDelta: number;
  receiptUrl: string | null;
  referenceNumber: string | null;
  sku: string;
  stockAfter: number;
  stockBefore: number;
  warehouseId: string | null;
};

export type StockDashboardData = {
  lowStockCount: number;
  movementRows: StockMovementRow[];
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
  reservedTotal: number;
  setupHint: string | null;
  totalOnHandValue: number;
  brands?: string[];
};

type ProductRow = {
  cost_price: number | string;
  display_order: number | string;
  id: string;
  is_active: boolean;
  name: string;
  reserved_quantity: number | string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
  metadata: Record<string, unknown> | null;
  product_category_items: Array<{
    product_categories: {
      id: string;
      name: string;
    } | null;
  }>;
  product_images: Array<{
    public_url: string;
    sort_order: number;
  }>;
  product_sale_units: Array<{
    base_unit_quantity: number | string;
    cost_mode: string | null;
    fixed_cost_price: number | string | null;
    id: string;
    is_active: boolean;
    is_default: boolean;
    sort_order: number | string;
  }>;
  product_warehouse_stocks: Array<{
    warehouse_id: string;
    stock_quantity: number | string;
    reserved_quantity: number | string;
  }>;
  product_warehouse_fulfillment_modes: Array<{
    warehouse_id: string;
    mode: string;
    supplier_id: string | null;
    suppliers: { name: string | null } | Array<{ name: string | null }> | null;
  }>;
};

type ProductWarehouseFulfillmentMode = "disabled" | "fresh" | "stock";

type SupplierRow = {
  id: string;
  name: string;
  supplier_code: string;
};

type MovementRow = {
  created_at: string;
  id: string;
  inventory_receipts: { receipt_url: string | null } | null;
  movement_type: string;
  notes: string | null;
  product_id: string;
  quantity_delta: number | string;
  reference_number: string | null;
  stock_after: number | string;
  stock_before: number | string;
  warehouse_id: string | null;
};

function isMissingTableError(message: string | undefined) {
  return Boolean(message?.includes('relation "public.'));
}

export type StockHistoryRow = {
  createdAt: string;
  id: string;
  itemCount: number;
  notes: string | null;
  receiptNumber: string;
  receiptUrl: string | null;
  receivedAt: string;
  supplierId: string | null;
  supplierName: string;
  totalAmount: number;
  warehouseId?: string | null;
};

export const getStockHistoryData = cache(
  async (organizationId: string, limit = 50, offset = 0, warehouseId?: string): Promise<StockHistoryRow[]> => {
    const admin = getSupabaseAdmin();

    let query = admin
      .from("inventory_receipts")
      .select(`
        id, receipt_number, supplier_name, supplier_id, received_at, created_at, notes, receipt_url, warehouse_id,
        inventory_receipt_items(quantity_received, unit_cost),
        suppliers(name)
      `)
      .eq("organization_id", organizationId);

    if (warehouseId && warehouseId !== "all") {
      query = query.eq("warehouse_id", warehouseId);
    }

    const { data, error } = await query
      .order("received_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];

    return (data as unknown as {
      id: string;
      receipt_number: string;
      supplier_name: string;
      supplier_id: string | null;
      received_at: string;
      created_at: string;
      notes: string | null;
      receipt_url: string | null;
      warehouse_id: string | null;
      inventory_receipt_items: { quantity_received: number; unit_cost: number }[];
      suppliers: { name: string } | null;
    }[]).map((r) => {
      const items = r.inventory_receipt_items || [];
      const totalAmount = items.reduce(
        (sum: number, it: { quantity_received: number; unit_cost: number }) => sum + Number(it.quantity_received) * Number(it.unit_cost),
        0,
      );

      return {
        createdAt: r.created_at,
        id: r.id,
        itemCount: items.length,
        notes: r.notes,
        receiptNumber: r.receipt_number,
        receiptUrl: r.receipt_url,
        receivedAt: r.received_at,
        supplierId: r.supplier_id,
        supplierName: r.suppliers?.name || r.supplier_name || "ไม่ระบุผู้ขาย",
        totalAmount,
        warehouseId: r.warehouse_id,
      };
    });
  },
);

export type StockReceiptDetail = StockHistoryRow & {
  items: {
    productId: string;
    productName: string;
    sku: string;
    quantityReceived: number;
    unit: string;
    unitCost: number;
    lineTotal: number;
  }[];
  createdBy: string | null;
  createdByName: string | null;
  supplierAddress: string | null;
};

export const getStockReceiptDetail = cache(
  async (organizationId: string, receiptId: string): Promise<StockReceiptDetail | null> => {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("inventory_receipts")
      .select(`
        id, receipt_number, supplier_name, supplier_id, received_at, created_at, notes, receipt_url,
        inventory_receipt_items(
          product_id, quantity_received, unit, unit_cost,
          products(name, sku, unit)
        ),
        suppliers(name, address, province, district, subdistrict, postal_code),
        profiles:created_by(display_name)
      `)
      .eq("organization_id", organizationId)
      .eq("id", receiptId)
      .maybeSingle();

    if (error || !data) return null;

    interface ReceiptItemRow {
      product_id: string;
      unit: string;
      unit_cost: number;
      quantity_received: number;
      products: { name: string; sku: string; unit: string; } | null;
    }

    interface ReceiptRow {
      id: string;
      created_at: string;
      received_at: string;
      receipt_number: string;
      notes: string | null;
      receipt_url: string | null;
      supplier_id: string | null;
      supplier_name: string | null;
      suppliers: { name: string; address: string | null } | null;
      inventory_receipt_items: ReceiptItemRow[];
      created_by: string | null;
      profiles: { display_name: string | null } | null;
    }

    const r = data as unknown as ReceiptRow;
    const items = (r.inventory_receipt_items || []).map((it) => ({
      productId: it.product_id,
      productName: it.products?.name || "สินค้าไม่ทราบชื่อ",
      sku: it.products?.sku || "-",
      quantityReceived: Number(it.quantity_received),
      unit: it.products?.unit ?? it.unit,
      unitCost: Number(it.unit_cost),
      lineTotal: Number(it.quantity_received) * Number(it.unit_cost),
    }));

    const totalAmount = items.reduce((sum, it) => sum + it.lineTotal, 0);

    return {
      createdAt: r.created_at,
      id: r.id,
      itemCount: items.length,
      notes: r.notes,
      receiptNumber: r.receipt_number,
      receiptUrl: r.receipt_url,
      receivedAt: r.received_at,
      supplierId: r.supplier_id,
      supplierName: r.suppliers?.name || r.supplier_name || "ไม่ระบุผู้ขาย",
      supplierAddress: r.suppliers?.address || null,
      totalAmount,
      items,
      createdBy: r.created_by,
      createdByName: r.profiles?.display_name || null,
    };
  },
);

export const getStockDashboardData = cache(
  async (organizationId: string, movementLimit = 20, movementOffset = 0): Promise<StockDashboardData> => {
    const admin = getSupabaseAdmin();
    const movementsPromise =
      movementLimit > 0
        ? admin.from("inventory_movements")
            .select(
              "id, product_id, warehouse_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_at, inventory_receipts(receipt_url)",
            )
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false })
            .range(movementOffset, movementOffset + movementLimit - 1)
        : Promise.resolve({ data: [], error: null });

    const [
      productsResult,
      movementsResult,
      suppliersResult,
      categoriesResult,
      brandsResult,
    ] = await Promise.all([
      (admin as unknown as { from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown; error: { message?: string } | null }>;
            };
          };
        };
      } }).from("products")
        .select(`
          id, sku, name, cost_price, stock_quantity, reserved_quantity, unit, is_active, display_order, metadata,
          product_category_items(product_categories(id, name)),
          product_images(public_url, sort_order),
          product_sale_units(id, unit_label, base_unit_quantity, is_active, is_default, sort_order, cost_mode, fixed_cost_price),
          product_warehouse_stocks(warehouse_id, stock_quantity, reserved_quantity),
          product_warehouse_fulfillment_modes(warehouse_id, mode, supplier_id, suppliers(name))
        `)
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true })
        .order("sku", { ascending: true }),
      movementsPromise,
      admin.from("suppliers")
        .select("id, name, supplier_code")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      admin.from("product_categories")
        .select("id, sort_order")
        .eq("organization_id", organizationId),
      admin.from("product_brands")
        .select("name, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
    ]);

    const errors = [
      productsResult.error,
      movementsResult.error,
      categoriesResult.error,
      brandsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      const firstError = errors[0];

      return {
        lowStockCount: 0,
        movementRows: [],
        products: [],
        suppliers: [],
        reservedTotal: 0,
        setupHint: isMissingTableError(firstError?.message)
          ? "ยังไม่ได้รัน migration สำหรับหน้าสต็อก"
          : "ยังโหลดข้อมูลสต็อกไม่สำเร็จ",
        totalOnHandValue: 0,
      };
    }

    const products = (productsResult.data ?? []) as unknown as ProductRow[];
    const movements = (movementsResult.data ?? []) as MovementRow[];
    const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
    const categories = (categoriesResult.data ?? []) as Array<{ id: string; sort_order: number | string }>;
    const brands = (brandsResult.data ?? []) as Array<{ name: string; sort_order: number | string }>;

    const productMap = new Map(products.map((product) => [product.id, product]));
    const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

    const mappedProducts = products.map((product) => {
      const baseCostPrice = Number(product.cost_price);

      // Sort images and extract the first one
      const sortedImages = (product.product_images ?? [])
        .toSorted((a, b) => Number(a.sort_order) - Number(b.sort_order));
      const imageUrl = sortedImages[0]?.public_url ?? null;

      const productSaleUnits = (product.product_sale_units ?? [])
        .filter((su) => su.is_active)
        .toSorted((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((su) => {
          const baseUnitQuantity = Number(su.base_unit_quantity);
          const fixedCostPrice = su.fixed_cost_price === null ? null : Number(su.fixed_cost_price);
          const costMode = normalizeSaleUnitCostMode(su.cost_mode);
          return {
            baseUnitQuantity,
            costMode,
            effectiveCostPrice: getEffectiveSaleUnitCost({ baseCostPrice, baseUnitQuantity, costMode, fixedCostPrice }),
            id: su.id,
            isDefault: su.is_default,
            label: product.unit,
          };
        });

      const categoryIds = (product.product_category_items ?? [])
        .map((item) => item?.product_categories?.id)
        .filter(Boolean) as string[];

      const warehouseModes = (product.product_warehouse_fulfillment_modes ?? []).map((row) => {
        const mode: ProductWarehouseFulfillmentMode =
          row.mode === "fresh" || row.mode === "disabled" ? row.mode : "stock";
        const modeSupplierId = row.supplier_id ?? null;
        const suppliers = row.suppliers;
        const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
        return {
          mode,
          supplierId: modeSupplierId,
          supplierName: supplier?.name?.trim() || (modeSupplierId ? supplierNameById.get(modeSupplierId)?.trim() : null) || null,
          warehouseId: row.warehouse_id,
        };
      });

      return {
        costPrice: baseCostPrice,
        displayOrder: Number(product.display_order ?? 0),
        display_order: product.display_order !== null ? Number(product.display_order) : null,
        categoryIds,
        id: product.id,
        imageUrl,
        categoryName: product.product_category_items?.[0]?.product_categories?.name ?? null,
        brandName: (product.metadata as { brand?: string })?.brand ?? null,
        isActive: product.is_active,
        name: product.name,
        onHandQuantity: Number(product.stock_quantity),
        reservedQuantity: Number(product.reserved_quantity),
        saleUnits: productSaleUnits,
        warehouseStocks: (product.product_warehouse_stocks ?? []).map((stock) => ({
          onHandQuantity: Number(stock.stock_quantity),
          reservedQuantity: Number(stock.reserved_quantity),
          warehouseId: stock.warehouse_id,
        })),
        warehouseModes,
        sku: product.sku,
        unit: product.unit,
      };
    });

    const categorySortList = categories.map((c) => ({ id: c.id, sortOrder: Number(c.sort_order) }));
    const normalizedProducts = sortProductsByCategory(mappedProducts, categorySortList);
    const brandSortList = brands.map((b) => b.name.trim()).filter(Boolean);

    return {
      lowStockCount: normalizedProducts.reduce((total, product) => {
        if (!product.isActive) return total;
        if (product.warehouseStocks.length === 0) {
          const availableQuantity = product.onHandQuantity - product.reservedQuantity;
          return total + (availableQuantity <= 5 ? 1 : 0);
        }

        return total + product.warehouseStocks.filter((stock) => {
          const availableQuantity = stock.onHandQuantity - stock.reservedQuantity;
          return availableQuantity <= 5;
        }).length;
      }, 0),
      movementRows: movements.map((movement) => ({
        createdAt: movement.created_at,
        id: movement.id,
        movementType: movement.movement_type,
        notes: movement.notes,
        productId: movement.product_id,
        productName: productMap.get(movement.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
        quantityDelta: Number(movement.quantity_delta),
        receiptUrl: movement.inventory_receipts?.receipt_url ?? null,
        referenceNumber: movement.reference_number,
        sku: productMap.get(movement.product_id)?.sku ?? "-",
        stockAfter: Number(movement.stock_after),
        stockBefore: Number(movement.stock_before),
        warehouseId: movement.warehouse_id,
      })),
      products: normalizedProducts,
      suppliers: suppliers.map(s => ({
        id: s.id,
        name: s.name,
        code: s.supplier_code
      })),
      reservedTotal: normalizedProducts.reduce(
        (total, product) => total + product.reservedQuantity,
        0,
      ),
      setupHint: null,
      totalOnHandValue: normalizedProducts.reduce(
        (total, product) => total + product.onHandQuantity * product.costPrice,
        0,
      ),
      brands: brandSortList,
    };
  },
);

export const getStockMovementsData = cache(
  async (organizationId: string, limit = 50, offset = 0): Promise<StockMovementRow[]> => {
    const admin = getSupabaseAdmin();

    const [movementsResult, productsResult] = await Promise.all([
      admin.from("inventory_movements")
        .select(
          "id, product_id, warehouse_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_at, inventory_receipts(receipt_url)",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      admin.from("products")
        .select("id, name, sku")
        .eq("organization_id", organizationId),
    ]);

    if (movementsResult.error || !movementsResult.data) return [];

    const movements = (movementsResult.data as unknown as MovementRow[]);
    const products = (productsResult.data as unknown as { id: string; name: string; sku: string }[]);
    const productMap = new Map(products.map(p => [p.id, p]));

    return movements.map((movement) => ({
      createdAt: movement.created_at,
      id: movement.id,
      movementType: movement.movement_type,
      notes: movement.notes,
      productId: movement.product_id,
      productName: productMap.get(movement.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
      quantityDelta: Number(movement.quantity_delta),
      receiptUrl: movement.inventory_receipts?.receipt_url ?? null,
      referenceNumber: movement.reference_number,
      sku: productMap.get(movement.product_id)?.sku ?? "-",
      stockAfter: Number(movement.stock_after),
      stockBefore: Number(movement.stock_before),
      warehouseId: movement.warehouse_id,
    }));
  }
);
