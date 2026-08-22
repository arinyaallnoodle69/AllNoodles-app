import "server-only";

import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDailySpecialPrintItems } from "@/lib/orders/daily-special-items";

type ProductWarehouseFulfillmentMode = "disabled" | "fresh" | "stock";

export type VehicleSummaryProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  productKind?: string;
  supplierId?: string | null;
  supplierName?: string | null;
};

export type VehicleSummaryVehicle = {
  id: string | null;
  name: string;
};

export type VehicleProductSummaryData = {
  organizationName: string;
  dateLabel: string;
  products: VehicleSummaryProduct[];
  vehicles: VehicleSummaryVehicle[];
  qty: number[][];
  factoryName?: string;
  warehouseName?: string;
  sourceVehicleCount?: number;
};

type OrderRow = {
  assigned_vehicle_id: string | null;
  id: string;
  customer_id: string;
  warehouse_id?: string | null;
  order_items: Array<{
    product_id: string;
    quantity_in_base_unit: number | string | null;
  }>;
  customers: {
    default_vehicle_id: string | null;
    default_warehouse_id?: string | null;
    vehicles: unknown;
    warehouses?: unknown;
  };
  delivery_notes: unknown;
};

type DbProduct = {
  id: string;
  name: string;
  unit: string;
  display_order: number | null;
  metadata: unknown;
  sku: string;
  product_kind?: string;
  supplier_id?: string | null;
  suppliers?: { name: string } | null;
  product_images?: Array<{ public_url: string; sort_order: number | null }> | null;
};

type DbCategory = {
  id: string;
  sort_order: number | string | null;
};

type ProductModeRow = {
  mode: ProductWarehouseFulfillmentMode;
  product_id: string;
  supplier_id: string | null;
  suppliers?: { name: string } | null;
  warehouse_id: string;
};

type ProductWarehouseFulfillment = {
  mode: ProductWarehouseFulfillmentMode;
  supplierId: string | null;
  supplierName: string | null;
};

type FactoryGroupAccumulator = {
  factoryName: string;
  warehouseName: string;
  productVehicleQty: Map<string, Map<string, number>>;
  vehicleNamesByKey: Map<string, string>;
  vehicleKeys: Set<string>;
};

function getRelationName(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name ?? null;
  return (value as { name?: string }).name ?? null;
}

function getPackingListProductName(name: string, metadata: unknown) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const packingListName = (metadata as Record<string, unknown>).packing_list_name;
    if (typeof packingListName === "string" && packingListName.trim()) {
      return packingListName.trim();
    }
  }

  return name;
}

function isActiveProduct(product: DbProduct) {
  const metadata = product.metadata && typeof product.metadata === "object" ? (product.metadata as Record<string, unknown>) : null;
  return !metadata?.deleted;
}

function formatDateLabel(date: string, endDate: string) {
  if (date === endDate) {
    try {
      return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Bangkok",
      }).format(new Date(`${date}T00:00:00`));
    } catch {
      return date;
    }
  }

  const formatter = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });

  try {
    return `${formatter.format(new Date(`${date}T00:00:00`))} - ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
  } catch {
    return `${date} - ${endDate}`;
  }
}

function getActiveDeliveryNote(order: OrderRow) {
  const deliveryNotes = Array.isArray(order.delivery_notes) ? order.delivery_notes : order.delivery_notes ? [order.delivery_notes] : [];
  // Same "first non-cancelled note by created_at" semantics used in
  // lib/orders/detail.ts — pick deterministically when an order has
  // multiple notes instead of relying on database row order.
  const sortedDeliveryNotes = [...deliveryNotes].sort((a: { created_at?: string | null }, b: { created_at?: string | null }) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );
  return sortedDeliveryNotes.find((note: { status: string }) => note.status !== "cancelled") as
    | { status: string; vehicle_id: string | null; warehouse_id?: string | null; vehicles?: unknown; warehouses?: unknown }
    | undefined;
}

function modeKey(productId: string, warehouseId: string) {
  return `${productId}:${warehouseId}`;
}

async function loadSortedProducts(organizationId: string) {
  const admin = getSupabaseAdmin();
  const [productsResult, categoriesResult, categoryItemsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, sku, name, unit, display_order, metadata, product_kind, supplier_id, suppliers(name), product_images(public_url, sort_order)")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("product_categories")
      .select("id, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", organizationId),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message ?? "Failed to load products for vehicle summary.");
  if (categoriesResult.error) throw new Error(categoriesResult.error.message ?? "Failed to load product categories.");
  if (categoryItemsResult.error) throw new Error(categoryItemsResult.error.message ?? "Failed to load product category items.");

  const categoryIdsByProductId = new Map<string, string[]>();
  for (const item of categoryItemsResult.data ?? []) {
    const current = categoryIdsByProductId.get(item.product_id) ?? [];
    current.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, current);
  }

  const activeProducts = ((productsResult.data ?? []) as DbProduct[]).filter(isActiveProduct);

  return sortProductsByCategory(
    activeProducts.map((product) => {
      const sortedImages = [...(product.product_images ?? [])].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );

      return {
        id: product.id,
        name: getPackingListProductName(product.name, product.metadata),
        display_order: product.display_order !== null && product.display_order !== undefined ? Number(product.display_order) : undefined,
        categoryIds: categoryIdsByProductId.get(product.id) ?? [],
        sku: product.sku,
        unit: product.unit,
        imageUrl: sortedImages[0]?.public_url ?? null,
        productKind: product.product_kind,
        supplierId: product.supplier_id ?? null,
        supplierName: product.suppliers?.name ?? null,
      };
    }),
    ((categoriesResult.data ?? []) as DbCategory[]).map((category) => ({
      id: category.id,
      sortOrder: Number(category.sort_order ?? 0),
    })),
  );
}

export async function getVehicleProductSummaryData(
  organizationId: string,
  date: string,
  endDate: string,
): Promise<VehicleProductSummaryData> {
  const admin = getSupabaseAdmin();

  const [ordersResult, vehiclesResult, sortedProducts, specialItems] = await Promise.all([
    admin
      .from("orders")
      .select(`
        id,
        assigned_vehicle_id,
        customer_id,
        customers!inner(default_vehicle_id, vehicles(id, name)),
        delivery_notes!order_id(vehicle_id, status, created_at, vehicles(id, name)),
        order_items(product_id, quantity_in_base_unit)
      `)
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .gte("order_date", date)
      .lte("order_date", endDate),
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadSortedProducts(organizationId),
    getDailySpecialPrintItems(organizationId, date, endDate),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message ?? "Failed to load orders for vehicle summary.");
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message ?? "Failed to load vehicles.");

  const products: VehicleSummaryProduct[] = sortedProducts.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit || "-",
    imageUrl: product.imageUrl ?? null,
    productKind: product.productKind,
    supplierId: product.supplierId,
    supplierName: product.supplierName,
  }));

  const configuredVehicles: VehicleSummaryVehicle[] = ((vehiclesResult.data ?? []) as Array<{ id: string; name: string }>).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));

  const orders = (ordersResult.data ?? []) as unknown as OrderRow[];
  const hasUnassignedOrders = orders.some((order) => {
    const activeDeliveryNote = getActiveDeliveryNote(order);
    const vehicleId = activeDeliveryNote?.vehicle_id ?? order.assigned_vehicle_id ?? order.customers.default_vehicle_id;
    return !vehicleId;
  });

  const vehicles: VehicleSummaryVehicle[] = hasUnassignedOrders
    ? [...configuredVehicles, { id: null, name: "ยังไม่กำหนดรถ" }]
    : configuredVehicles;

  const productIndexById = new Map(products.map((product, index) => [product.id, index]));
  const vehicleIndexById = new Map(vehicles.map((vehicle, index) => [vehicle.id ?? "__unassigned__", index]));
  const qty = products.map(() => vehicles.map(() => 0));

  for (const order of orders) {
    const activeDeliveryNote = getActiveDeliveryNote(order);
    const vehicleId = activeDeliveryNote?.vehicle_id ?? order.assigned_vehicle_id ?? order.customers.default_vehicle_id;
    const resolvedVehicleId = vehicleId ?? "__unassigned__";
    let vehicleIndex = vehicleIndexById.get(resolvedVehicleId);

    if (vehicleIndex === undefined) {
      const deliveryVehicleName = activeDeliveryNote?.vehicle_id ? getRelationName(activeDeliveryNote.vehicles) : null;
      const assignedVehicleName = configuredVehicles.find((vehicle) => vehicle.id === order.assigned_vehicle_id)?.name ?? null;
      const customerVehicleName = getRelationName(order.customers.vehicles);
      vehicles.push({
        id: vehicleId,
        name: deliveryVehicleName || assignedVehicleName || customerVehicleName || "ยังไม่กำหนดรถ",
      });
      vehicleIndex = vehicles.length - 1;
      vehicleIndexById.set(resolvedVehicleId, vehicleIndex);
      qty.forEach((row) => row.push(0));
    }

    for (const item of order.order_items ?? []) {
      const productIndex = productIndexById.get(item.product_id);
      if (productIndex === undefined) continue;
      qty[productIndex][vehicleIndex] = (qty[productIndex][vehicleIndex] ?? 0) + Number(item.quantity_in_base_unit ?? 0);
    }
  }

  // Claims are daily, non-sale loading quantities. They appear only on the
  // packing order row and this vehicle-loading summary; they never touch stock
  // or delivery notes.
  for (const item of specialItems.filter((special) => special.type === "claim")) {
    const productIndex = productIndexById.get(item.productId);
    if (productIndex === undefined) continue;
    let vehicleIndex = vehicleIndexById.get(item.vehicleId);
    if (vehicleIndex === undefined) {
      vehicles.push({ id: item.vehicleId, name: item.vehicleName });
      vehicleIndex = vehicles.length - 1;
      vehicleIndexById.set(item.vehicleId, vehicleIndex);
      qty.forEach((row) => row.push(0));
    }
    qty[productIndex][vehicleIndex] = (qty[productIndex][vehicleIndex] ?? 0) + item.quantity;
  }

  const activeRowIndices = qty.reduce<number[]>((indices, row, index) => {
    if (row.some((value) => value > 0)) {
      indices.push(index);
    }
    return indices;
  }, []);

  return {
    organizationName: "All Noodles",
    dateLabel: formatDateLabel(date, endDate),
    products: activeRowIndices.map((index) => products[index]),
    vehicles,
    qty: activeRowIndices.map((index) => qty[index]),
  };
}

export async function getFactoryOrderSheetData(
  organizationId: string,
  date: string,
  endDate: string,
): Promise<VehicleProductSummaryData[]> {
  const admin = getSupabaseAdmin();
  const productWarehouseModesTable = (admin as unknown as {
    from(table: "product_warehouse_fulfillment_modes"): {
      select(columns: string): {
        eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  }).from("product_warehouse_fulfillment_modes");

  const [ordersResult, vehiclesResult, warehousesResult, modesResult, sortedProducts, specialItems] = await Promise.all([
    admin
      .from("orders")
      .select(`
        id,
        assigned_vehicle_id,
        customer_id,
        warehouse_id,
        customers!inner(default_vehicle_id, default_warehouse_id, vehicles(id, name), warehouses(id, name)),
        delivery_notes!order_id(vehicle_id, warehouse_id, status, created_at, vehicles(id, name), warehouses(id, name)),
        order_items(product_id, quantity_in_base_unit)
      `)
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .gte("order_date", date)
      .lte("order_date", endDate),
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("warehouses")
      .select("id, name")
      .eq("organization_id", organizationId),
    productWarehouseModesTable
      .select("product_id, warehouse_id, mode, supplier_id, suppliers(name)")
      .eq("organization_id", organizationId),
    loadSortedProducts(organizationId),
    getDailySpecialPrintItems(organizationId, date, endDate),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message ?? "Failed to load orders for factory order sheet.");
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message ?? "Failed to load vehicles.");
  if (warehousesResult.error) throw new Error(warehousesResult.error.message ?? "Failed to load warehouses.");
  if (modesResult.error) throw new Error(modesResult.error.message ?? "Failed to load warehouse product modes.");

  const products: VehicleSummaryProduct[] = sortedProducts.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit || "-",
    imageUrl: product.imageUrl ?? null,
    productKind: product.productKind,
    supplierId: product.supplierId,
    supplierName: product.supplierName,
  }));
  const productById = new Map(products.map((product) => [product.id, product]));
  const configuredVehicles: VehicleSummaryVehicle[] = ((vehiclesResult.data ?? []) as Array<{ id: string; name: string }>).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));
  const vehicleNameByKey = new Map(configuredVehicles.map((vehicle) => [vehicle.id ?? "__unassigned__", vehicle.name]));
  const warehouseNameById = new Map(((warehousesResult.data ?? []) as Array<{ id: string; name: string }>).map((warehouse) => [warehouse.id, warehouse.name]));
  const fulfillmentByProductWarehouse = new Map<string, ProductWarehouseFulfillment>(
    ((modesResult.data ?? []) as ProductModeRow[]).map((row) => [
      modeKey(row.product_id, row.warehouse_id),
      {
        mode: row.mode,
        supplierId: row.supplier_id ?? null,
        supplierName: row.suppliers?.name ?? null,
      },
    ]),
  );
  const groups = new Map<string, FactoryGroupAccumulator>();

  for (const order of (ordersResult.data ?? []) as unknown as OrderRow[]) {
    const activeDeliveryNote = getActiveDeliveryNote(order);
    const warehouseId = activeDeliveryNote?.warehouse_id ?? order.warehouse_id ?? order.customers.default_warehouse_id ?? null;
    if (!warehouseId) continue;

    const warehouseName = activeDeliveryNote?.warehouse_id
      ? getRelationName(activeDeliveryNote.warehouses) || warehouseNameById.get(warehouseId) || "ไม่ระบุคลัง"
      : getRelationName(order.customers.warehouses) || warehouseNameById.get(warehouseId) || "ไม่ระบุคลัง";
    const vehicleId = activeDeliveryNote?.vehicle_id ?? order.assigned_vehicle_id ?? order.customers.default_vehicle_id;
    const vehicleKey = vehicleId ?? "__unassigned__";
    const vehicleName = (activeDeliveryNote?.vehicle_id ? getRelationName(activeDeliveryNote.vehicles) : null)
      || vehicleNameByKey.get(vehicleKey)
      || getRelationName(order.customers.vehicles)
      || "ยังไม่กำหนดรถ";

    for (const item of order.order_items ?? []) {
      const product = productById.get(item.product_id);
      if (!product) continue;
      const fulfillment = fulfillmentByProductWarehouse.get(modeKey(product.id, warehouseId));
      if (fulfillment?.mode !== "fresh") continue;

      const supplierName = fulfillment.supplierName || product.supplierName || "โรงงานอนามัย";
      const supplierKey = fulfillment.supplierId || product.supplierId || supplierName;
      const groupKey = `${warehouseId}:${supplierKey}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          factoryName: supplierName,
          warehouseName,
          productVehicleQty: new Map(),
          vehicleNamesByKey: new Map(),
          vehicleKeys: new Set(),
        };
        groups.set(groupKey, group);
      }

      const productQty = group.productVehicleQty.get(product.id) ?? new Map<string, number>();
      productQty.set(vehicleKey, (productQty.get(vehicleKey) ?? 0) + Number(item.quantity_in_base_unit ?? 0));
      group.productVehicleQty.set(product.id, productQty);
      group.vehicleKeys.add(vehicleKey);
      group.vehicleNamesByKey.set(vehicleKey, vehicleName);
    }
  }

  // Office quantities are ordered from the factory but are not sales orders.
  // Resolve their warehouse from the product's configured fresh-production
  // mode, keeping the UI fast (vehicle -> products) without an extra step.
  for (const item of specialItems.filter((special) => special.type === "office")) {
    const product = productById.get(item.productId);
    if (!product) continue;
    const mode = ((modesResult.data ?? []) as ProductModeRow[]).find(
      (candidate) => candidate.product_id === item.productId && candidate.mode === "fresh",
    );
    if (!mode) continue;

    const warehouseName = warehouseNameById.get(mode.warehouse_id) || "ไม่ระบุคลัง";
    const supplierName = mode.suppliers?.name || product.supplierName || "โรงงานอนามัย";
    const supplierKey = mode.supplier_id || product.supplierId || supplierName;
    const groupKey = `${mode.warehouse_id}:${supplierKey}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        factoryName: supplierName,
        warehouseName,
        productVehicleQty: new Map(),
        vehicleNamesByKey: new Map(),
        vehicleKeys: new Set(),
      };
      groups.set(groupKey, group);
    }

    const productQty = group.productVehicleQty.get(product.id) ?? new Map<string, number>();
    productQty.set(item.vehicleId, (productQty.get(item.vehicleId) ?? 0) + item.quantity);
    group.productVehicleQty.set(product.id, productQty);
    group.vehicleKeys.add(item.vehicleId);
    group.vehicleNamesByKey.set(item.vehicleId, item.vehicleName);
  }

  const dateLabel = formatDateLabel(date, endDate);
  const configuredVehicleKeys = configuredVehicles.map((vehicle) => vehicle.id ?? "__unassigned__");

  return Array.from(groups.values()).map((group) => {
    const vehicleKeys = [
      ...configuredVehicleKeys.filter((key) => group.vehicleKeys.has(key)),
      ...Array.from(group.vehicleKeys).filter((key) => !configuredVehicleKeys.includes(key)),
    ];
    const groupProducts = products.filter((product) => group.productVehicleQty.has(product.id));
    const qty = groupProducts.map((product) => {
      const productQty = group.productVehicleQty.get(product.id) ?? new Map<string, number>();
      return [vehicleKeys.reduce((total, key) => total + (productQty.get(key) ?? 0), 0)];
    });

    return {
      organizationName: "All Noodles",
      dateLabel,
      factoryName: group.factoryName,
      warehouseName: group.warehouseName,
      products: groupProducts,
      sourceVehicleCount: vehicleKeys.length,
      vehicles: [{ id: "__total__", name: "จำนวนรวม" }],
      qty,
    };
  });
}
