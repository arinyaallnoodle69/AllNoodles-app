import { Suspense } from "react";
import type { Viewport } from "next";
import { PageLoader } from "@/components/page-loader";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";
import {
  PackingListLayout,
  type PackingListData,
  type PackingListLayoutMode,
  type PackingListStore,
  type PackingListVehicle,
} from "@/components/print/packing-list-layout";
import { requireAnyRole } from "@/lib/auth/authorization";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import { getPackingListProductMeta } from "@/lib/orders/packing-list-product-meta";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AutoPrint, PackingListPrintButton } from "./preview/print-button";
import { getDailySpecialPrintItems } from "@/lib/orders/daily-special-items";

export const metadata = { title: "ใบจัดของ" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
    layout?: string;
  }>;
};

type OrderCustomer = {
  id: string;
  name: string;
  customer_code: string;
  default_vehicle_id: string | null;
  vehicles: unknown;
};

type DeliveryNoteRow = {
  created_at?: string | null;
  vehicle_id: string | null;
  status: string;
  vehicles: unknown;
};

type OrderItemRow = {
  product_id: string;
  quantity: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
  };
};

type OrderWithRelations = {
  assigned_vehicle_id: string | null;
  id: string;
  order_date: string;
  customers: OrderCustomer;
  delivery_notes: DeliveryNoteRow[] | DeliveryNoteRow | null;
  order_items: OrderItemRow[];
};

type DbProduct = {
  id: string;
  name: string;
  display_order: number | null;
  metadata: unknown;
  print_background_color: string | null;
};

type DbCategory = {
  id: string;
  name: string;
  print_color: string | null;
  sort_order: number | string | null;
};

type SupabaseReadResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type SupabaseSelectQuery<T> = PromiseLike<SupabaseReadResult<T>> & {
  eq(column: string, value: boolean | string): SupabaseSelectQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseSelectQuery<T>;
};

type ProductCategoryPrintColorTable = {
  select(columns: string): SupabaseSelectQuery<DbCategory>;
};

type GroupedStore = {
  customer: OrderCustomer;
  vehicleId: string | null;
  vehicleName: string | null;
  items: Map<string, number>;
  specialSort: number;
};

type ProductDescriptor = {
  brand: string;
  category: string;
  icon: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  categoryColor: string | null;
  printBackgroundColor: string | null;
};

function getVehicleName(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return (value[0] as { name?: string } | undefined)?.name ?? null;
  }
  return (value as { name?: string }).name ?? null;
}

function getOrderKey(item: OrderItemRow) {
  return `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}`;
}

function getThaiDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    console.error("Invalid date for packing list:", value);
    return value;
  }
}

function getThaiTimeLabel(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function normalizePackingBrand(value: string) {
  return value.trim() || "-";
}

function getMinCategoryRank(categoryIds: string[], rankById: Map<string, number>) {
  if (categoryIds.length === 0) return Infinity;
  return Math.min(...categoryIds.map((id) => rankById.get(id) ?? Infinity));
}

export default async function PackingListWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <PackingListPage searchParams={searchParams} />
    </Suspense>
  );
}

async function PackingListPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const generatedAt = new Date();
  const autoprint = params.autoprint === "1";
  const layout: PackingListLayoutMode = params.layout === "transposed" ? "transposed" : "standard";
  const date =
    params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;

  const admin = getSupabaseAdmin();
  const productCategories = admin.from("product_categories") as unknown as ProductCategoryPrintColorTable;
  const ordersQueryBase = admin
    .from("orders")
    .select(`
      id,
      assigned_vehicle_id,
      order_date,
      customers!inner(id, name, customer_code, default_vehicle_id, vehicles(id, name)),
      delivery_notes!order_id(vehicle_id, status, created_at, vehicles(id, name)),
      order_items(
        product_id,
        quantity,
        sale_unit_label,
        products!inner(name, sku)
      )
    `)
    .eq("organization_id", session.organizationId)
    .neq("status", "cancelled");

  const filteredOrdersQuery =
    endDate && endDate !== date
      ? ordersQueryBase.gte("order_date", date).lte("order_date", endDate)
      : ordersQueryBase.eq("order_date", date);

  const [vehicleRows, ordersResult, productsDb, categoriesDb, categoryItemsDb, specialItems] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    filteredOrdersQuery.order("order_date", { ascending: true }).order("created_at", {
      ascending: true,
    }),
    admin
      .from("products")
      .select("id, name, display_order, metadata, print_background_color")
      .eq("organization_id", session.organizationId),
    productCategories
      .select("id, name, sort_order, print_color")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", session.organizationId),
    getDailySpecialPrintItems(session.organizationId, date, endDate),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map(
    (vehicle: { id: string; name: string }) => ({
      id: vehicle.id,
      name: vehicle.name,
    }),
  );
  const vehicleSortIndexMap = new Map(vehicles.map((vehicle, index) => [vehicle.id, index]));

  const categoryIdsByProductId = new Map<string, string[]>();
  for (const item of categoryItemsDb.data ?? []) {
    const current = categoryIdsByProductId.get(item.product_id) ?? [];
    current.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, current);
  }
  const categories = categoriesDb.data ?? [];
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const categoryColorById = new Map(categories.map((category) => [category.id, category.print_color]));
  const categoryNamesByProductId = new Map(
    Array.from(categoryIdsByProductId.entries()).map(([productId, categoryIds]) => [
      productId,
      categoryIds.map((categoryId) => categoryNameById.get(categoryId)).filter(Boolean) as string[],
    ]),
  );

  const dbProductsList = (productsDb.data ?? []).filter((product: DbProduct) => {
    const metadata =
      product.metadata && typeof product.metadata === "object"
        ? (product.metadata as Record<string, unknown>)
        : null;
    return !metadata?.deleted;
  });
  const productPrintBackgroundColorById = new Map(
    dbProductsList.map((product: DbProduct) => [product.id, product.print_background_color]),
  );

  const packingListMetaByProductId = new Map(
    dbProductsList.map((product: DbProduct) => [
      product.id,
      getPackingListProductMeta({
        categoryNames: categoryNamesByProductId.get(product.id) ?? [],
        metadata: product.metadata,
        name: product.name,
      }),
    ]),
  );

  const sortedMasterProducts = sortProductsByCategory(
    dbProductsList.map((product: DbProduct) => ({
      id: product.id,
      name: packingListMetaByProductId.get(product.id)?.name ?? product.name,
      display_order:
        product.display_order !== null && product.display_order !== undefined
          ? Number(product.display_order)
          : undefined,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
    })),
    categories.map((category) => ({
      id: category.id,
      sortOrder: Number(category.sort_order ?? 0),
    })),
  );

  const productSortIndexMap = new Map<string, number>();
  sortedMasterProducts.forEach((product, index) => {
    productSortIndexMap.set(product.id, index);
  });
  const categoryRankById = new Map(
    categories.map((category) => [
      category.id,
      Number(category.sort_order ?? 0),
    ]),
  );
  const primaryCategoryIdByProductId = new Map(
    Array.from(categoryIdsByProductId.entries()).map(([productId, categoryIds]) => [
      productId,
      categoryIds
        .slice()
        .sort((a, b) => (categoryRankById.get(a) ?? Infinity) - (categoryRankById.get(b) ?? Infinity))[0] ?? null,
    ]),
  );
  const categoryColorByProductId = new Map(
    Array.from(primaryCategoryIdByProductId.entries()).map(([productId, categoryId]) => [
      productId,
      categoryId ? categoryColorById.get(categoryId) ?? null : null,
    ]),
  );
  const categoryRankByProductId = new Map(
    dbProductsList.map((product: DbProduct) => [
      product.id,
      getMinCategoryRank(categoryIdsByProductId.get(product.id) ?? [], categoryRankById),
    ]),
  );

  const rawOrders = (ordersResult.data ?? []) as unknown as OrderWithRelations[];
  const ordersByDate = new Map<string, OrderWithRelations[]>();

  for (const order of rawOrders) {
    const groupedDateOrders = ordersByDate.get(order.order_date);
    if (groupedDateOrders) {
      groupedDateOrders.push(order);
    } else {
      ordersByDate.set(order.order_date, [order]);
    }
  }

  // A date can legitimately contain only office/claim rows. Keep that date in
  // the document even when there are no customer orders.
  for (const item of specialItems) {
    if (!ordersByDate.has(item.date)) ordersByDate.set(item.date, []);
  }

  const allPackingData: PackingListData[] = Array.from(ordersByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currentDate, dateOrders]) => {
      const groupedStores = new Map<string, GroupedStore>();
      const productMap = new Map<string, ProductDescriptor>();

      for (const order of dateOrders) {
        const customer = order.customers;
        const deliveryNotes = Array.isArray(order.delivery_notes)
          ? order.delivery_notes
          : order.delivery_notes
            ? [order.delivery_notes]
            : [];
        // Same "first non-cancelled note by created_at" semantics used in
        // lib/orders/detail.ts — an order can have multiple notes, so pick
        // deterministically instead of relying on database row order.
        const sortedDeliveryNotes = [...deliveryNotes].sort((a, b) =>
          String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
        );
        const activeDeliveryNote = sortedDeliveryNotes.find((note) => note.status !== "cancelled");
        const vehicleId =
          activeDeliveryNote?.vehicle_id ??
          order.assigned_vehicle_id ??
          customer.default_vehicle_id;
        const vehicleName = activeDeliveryNote?.vehicle_id
          ? getVehicleName(activeDeliveryNote.vehicles)
          : order.assigned_vehicle_id
            ? vehicles.find((vehicle) => vehicle.id === order.assigned_vehicle_id)?.name ?? null
            : getVehicleName(customer.vehicles);
        const resolvedVehicleName =
          vehicleName ||
          (vehicleId ? vehicles.find((vehicle) => vehicle.id === vehicleId)?.name : null) ||
          null;
        const storeGroupKey = `${customer.id}_${vehicleId ?? "none"}`;

        let groupedStore = groupedStores.get(storeGroupKey);
        if (!groupedStore) {
          groupedStore = {
            customer,
            vehicleId,
            vehicleName: resolvedVehicleName,
            items: new Map(),
            specialSort: 0,
          };
          groupedStores.set(storeGroupKey, groupedStore);
        }

        for (const item of order.order_items ?? []) {
          const key = getOrderKey(item);
          const quantity = Number(item.quantity ?? 0);
          groupedStore.items.set(key, (groupedStore.items.get(key) ?? 0) + quantity);

          if (!productMap.has(key)) {
            productMap.set(key, {
              productId: item.product_id,
              sku: item.products.sku,
              name: packingListMetaByProductId.get(item.product_id)?.name ?? item.products.name,
              brand: normalizePackingBrand(packingListMetaByProductId.get(item.product_id)?.brand ?? ""),
              category: packingListMetaByProductId.get(item.product_id)?.category ?? "",
              categoryColor: categoryColorByProductId.get(item.product_id) ?? null,
              printBackgroundColor: productPrintBackgroundColorById.get(item.product_id) ?? null,
              icon: packingListMetaByProductId.get(item.product_id)?.icon ?? "",
              unit: item.sale_unit_label,
            });
          }
        }
      }

      for (const special of specialItems.filter((item) => item.date === currentDate)) {
        const key = `${special.product.sku.trim().toLowerCase()}||${special.product.unit.trim().toLowerCase()}`;
        const storeGroupKey = `special_${special.type}_${special.vehicleId}`;
        let groupedStore = groupedStores.get(storeGroupKey);
        if (!groupedStore) {
          groupedStore = {
            customer: {
              id: storeGroupKey,
              name: special.type === "office" ? "เข้าออฟฟิศ" : "เคลม",
              customer_code: special.type === "office" ? "SPECIAL-OFFICE" : "SPECIAL-CLAIM",
              default_vehicle_id: special.vehicleId,
              vehicles: null,
            },
            vehicleId: special.vehicleId,
            vehicleName: special.vehicleName,
            items: new Map(),
            specialSort: special.type === "office" ? 1 : 2,
          };
          groupedStores.set(storeGroupKey, groupedStore);
        }

        groupedStore.items.set(key, (groupedStore.items.get(key) ?? 0) + special.quantity);
        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: special.productId,
            sku: special.product.sku,
            name: packingListMetaByProductId.get(special.productId)?.name ?? special.product.name,
            brand: normalizePackingBrand(packingListMetaByProductId.get(special.productId)?.brand ?? ""),
            category: packingListMetaByProductId.get(special.productId)?.category ?? "",
            categoryColor: categoryColorByProductId.get(special.productId) ?? null,
            printBackgroundColor: productPrintBackgroundColorById.get(special.productId) ?? null,
            icon: packingListMetaByProductId.get(special.productId)?.icon ?? "",
            unit: special.product.unit,
          });
        }
      }

      const stores = Array.from(groupedStores.values())
        .sort((a, b) => {
          const indexA =
            a.vehicleId === null ? 999 : (vehicleSortIndexMap.get(a.vehicleId) ?? 998);
          const indexB =
            b.vehicleId === null ? 999 : (vehicleSortIndexMap.get(b.vehicleId) ?? 998);
          if (indexA !== indexB) return indexA - indexB;
          if (a.specialSort !== b.specialSort) return a.specialSort - b.specialSort;
          return a.customer.customer_code.localeCompare(b.customer.customer_code);
        })
        .map(
          (group): PackingListStore & { consolidatedItems: Map<string, number> } => ({
            id: group.customer.customer_code,
            name: group.customer.name,
            vehicleId: group.vehicleId,
            vehicleName: group.vehicleName,
            consolidatedItems: group.items,
          }),
        );

      const products = Array.from(productMap.entries())
        .map(([key, product]) => ({
          key,
          brand: product.brand,
          category: product.category,
          categoryColor: product.categoryColor,
          printBackgroundColor: product.printBackgroundColor,
          icon: product.icon,
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        }))
        .sort((a, b) => {
          const categoryRankA = categoryRankByProductId.get(a.productId) ?? Infinity;
          const categoryRankB = categoryRankByProductId.get(b.productId) ?? Infinity;
          if (categoryRankA < categoryRankB) return -1;
          if (categoryRankA > categoryRankB) return 1;

          const categoryCompare = a.category.localeCompare(b.category, "th");
          if (categoryCompare !== 0) return categoryCompare;

          const brandCompare = a.brand.localeCompare(b.brand, "th");
          if (brandCompare !== 0) return brandCompare;

          const indexA = productSortIndexMap.get(a.productId) ?? 999999;
          const indexB = productSortIndexMap.get(b.productId) ?? 999999;
          if (indexA !== indexB) return indexA - indexB;

          return a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name);
        });

      const qty = products.map((product) =>
        stores.map((store) => store.consolidatedItems.get(product.key) ?? 0),
      );

      return {
        date: currentDate,
        dateLabel: `${getThaiDateLabel(currentDate)} เวลา ${getThaiTimeLabel(generatedAt)} น.`,
        organizationName: PRINT_ORGANIZATION_NAME,
        stores: stores.map((store) => ({
          id: store.id,
          name: store.name,
          vehicleId: store.vehicleId,
          vehicleName: store.vehicleName,
        })),
        products: products.map((product) => ({
          key: product.key,
          brand: product.brand,
          category: product.category,
          categoryColor: product.categoryColor,
          printBackgroundColor: product.printBackgroundColor,
          icon: product.icon,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        })),
        qty,
        vehicles,
      };
    });

  const totalStores = allPackingData.reduce((sum, packingData) => sum + packingData.stores.length, 0);
  const mainDateLabel =
    allPackingData.length > 1
      ? `${allPackingData[0]?.dateLabel ?? ""} - ${
          allPackingData[allPackingData.length - 1]?.dateLabel ?? ""
        }`
      : (allPackingData[0]?.dateLabel ?? "");
  const unassignedStores = allPackingData.flatMap((packingData) =>
    packingData.stores
      .filter((store: PackingListStore) => store.vehicleId === null)
      .map((store: PackingListStore) => store.name),
  );

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <div
        className="no-print flex flex-col md:flex-row items-center gap-2 md:gap-3 bg-white py-2.5 px-4 rounded-[16px] shadow-lg fixed top-3 left-1/2 -translate-x-1/2 z-[100] border border-slate-100/80 w-max max-w-[calc(100vw-24px)]"
        style={{
          fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", sans-serif',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#4A148C" }}>
            {layout === "transposed" ? "ใบจัดของ (สลับตาราง)" : "ใบจัดของ"}
          </span>
          <span
            className="hidden sm:inline"
            style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}
          >
            {mainDateLabel} · {totalStores} ร้าน
          </span>
        </div>

        <div className="flex items-center gap-2 flex-nowrap">
          <div>
            <PrintPackingListButton
              date={date}
              endDate={endDate}
              layout={layout === "standard" ? "transposed" : "standard"}
              label={
                layout === "standard"
                  ? "สลับตาราง"
                  : "ตารางเดิม"
              }
            />
          </div>
          <PackingListPrintButton
            unassignedStores={unassignedStores}
            dateLabel={mainDateLabel}
            hidePrintOnMobile
          />
          <a
            href={`/orders/incoming?date=${date}${endDate ? `&endDate=${endDate}` : ""}`}
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#ef4444",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: "8px",
              background: "#fef2f2",
            }}
          >
            กลับ
          </a>
        </div>
      </div>

      {allPackingData.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", sans-serif',
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>
            ไม่มีออเดอร์ในช่วงที่เลือก
          </p>
          <a
            href="/orders/incoming"
            style={{ marginTop: "8px", color: "#4A148C", fontSize: "14px" }}
          >
            กลับหน้าออเดอร์
          </a>
        </div>
      ) : (
        <div className="packing-print-container">
          {allPackingData.map((packingData) => (
            <PackingListLayout
              key={`${layout}-${packingData.date}`}
              data={packingData}
              layout={layout}
            />
          ))}
        </div>
      )}
    </>
  );
}
