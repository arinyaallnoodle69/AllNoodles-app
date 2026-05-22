import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";
import {
  PackingListSummaryButton,
  type PackingListSummaryProduct,
  type PackingListSummaryStore,
} from "@/components/orders/packing-list-summary-button";
import {
  PackingListLayout,
  type PackingListData,
  type PackingListLayoutMode,
  type PackingListStore,
  type PackingListVehicle,
} from "@/components/print/packing-list-layout";
import { requireAnyRole } from "@/lib/auth/authorization";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AutoPrint, PackingListPrintButton } from "./preview/print-button";

export const metadata = { title: "ใบจัดของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
    layout?: string;
  }>;
};

type OrderWithRelations = {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number | string;
  metadata: unknown;
  status: string;
  customers: {
    id: string;
    name: string;
    customer_code: string;
    address: string;
    default_vehicle_id: string | null;
    vehicles: unknown;
  };
  delivery_notes: unknown;
  order_items: Array<{
    id: string;
    product_id: string;
    quantity: number | string;
    sale_unit_label: string;
    unit_price: number | string;
    line_total: number | string;
    products: {
      name: string;
      sku: string;
    };
  }>;
};

type DbProduct = {
  id: string;
  name: string;
  display_order: number | null;
  sku: string;
  metadata: unknown;
};

type DbCategory = {
  id: string;
  name: string;
  sort_order: number | string | null;
};

type SummaryAggregate = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  vehicleId: string | null;
  vehicleName: string | null;
};

function getVehicleName(value: unknown) {
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
  const autoprint = params.autoprint === "1";
  const layout: PackingListLayoutMode = params.layout === "transposed" ? "transposed" : "standard";
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;

  const admin = getSupabaseAdmin();
  const ordersQueryBase = admin
    .from("orders")
    .select(`
      id, order_number, order_date, total_amount, metadata, status,
      customers!inner(id, name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      delivery_notes!order_id(vehicle_id, status, vehicles(id, name)),
      order_items(
        id, product_id, quantity, sale_unit_label, unit_price, line_total,
        products!inner(name, sku)
      )
    `)
    .eq("organization_id", session.organizationId)
    .neq("status", "cancelled");

  const filteredQuery =
    endDate && endDate !== date ? ordersQueryBase.gte("order_date", date).lte("order_date", endDate) : ordersQueryBase.eq("order_date", date);

  const [vehicleRows, ordersResult, productsDb, categoriesDb, categoryItemsDb] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    filteredQuery.order("order_date", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("products").select("id, name, display_order, sku, metadata").eq("organization_id", session.organizationId),
    admin.from("product_categories").select("id, name, sort_order").eq("organization_id", session.organizationId).eq("is_active", true),
    admin.from("product_category_items").select("product_category_id, product_id").eq("organization_id", session.organizationId),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map((vehicle: { id: string; name: string }) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));

  const categoryIdsByProductId = new Map<string, string[]>();
  for (const item of categoryItemsDb.data ?? []) {
    const current = categoryIdsByProductId.get(item.product_id) ?? [];
    current.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, current);
  }

  const dbProductsList = (productsDb.data ?? []).filter((product: DbProduct) => {
    const metadata = product.metadata && typeof product.metadata === "object" ? (product.metadata as Record<string, unknown>) : null;
    return !metadata?.deleted;
  });

  const packingListNameByProductId = new Map(
    dbProductsList.map((product: DbProduct) => [product.id, getPackingListProductName(product.name, product.metadata)]),
  );

  const sortedMasterProducts = sortProductsByCategory(
    dbProductsList.map((product: DbProduct) => ({
      id: product.id,
      name: packingListNameByProductId.get(product.id) ?? product.name,
      display_order: product.display_order !== null && product.display_order !== undefined ? Number(product.display_order) : undefined,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
    })),
    (categoriesDb.data ?? []).map((category: DbCategory) => ({
      id: category.id,
      sortOrder: Number(category.sort_order ?? 0),
    })),
  );

  const productSortIndexMap = new Map<string, number>();
  sortedMasterProducts.forEach((product, index) => {
    productSortIndexMap.set(product.id, index);
  });

  const rawOrders = (ordersResult.data ?? []) as OrderWithRelations[];
  const ordersByDate = new Map<string, OrderWithRelations[]>();

  for (const order of rawOrders) {
    const orderDate = order.order_date;
    if (!ordersByDate.has(orderDate)) ordersByDate.set(orderDate, []);
    ordersByDate.get(orderDate)?.push(order);
  }

  const overallProductMap = new Map<string, SummaryAggregate>();
  const overallStoreMap = new Map<string, PackingListSummaryStore>();

  const allPackingData: PackingListData[] = Array.from(ordersByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currentDate, dateOrders]) => {
      let dateLabel = currentDate;
      try {
        dateLabel = new Intl.DateTimeFormat("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        }).format(new Date(`${currentDate}T00:00:00`));
      } catch {
        console.error("Invalid date for packing list:", currentDate);
      }

      const groupedStores = new Map<
        string,
        {
          customer: { id: string; name: string; customer_code: string; default_vehicle_id: string | null; vehicles: unknown };
          vehicleId: string | null;
          vehicleName: string | null;
          items: Map<string, number>;
        }
      >();

      for (const order of dateOrders) {
        const customer = order.customers;
        const deliveryNotes = Array.isArray(order.delivery_notes) ? order.delivery_notes : order.delivery_notes ? [order.delivery_notes] : [];
        const activeDeliveryNote = deliveryNotes.find((note: { status: string }) => note.status !== "cancelled") as
          | { vehicle_id: string | null; vehicles: unknown }
          | undefined;

        const vehicleId = activeDeliveryNote?.vehicle_id ?? customer.default_vehicle_id;
        const vehicleName =
          activeDeliveryNote?.vehicle_id
            ? getVehicleName(activeDeliveryNote.vehicles)
            : getVehicleName(customer.vehicles);
        const resolvedVehicleName = vehicleName || (vehicleId ? vehicles.find((vehicle) => vehicle.id === vehicleId)?.name : null) || null;
        const storeGroupKey = `${customer.id}_${vehicleId ?? "none"}`;

        if (!groupedStores.has(storeGroupKey)) {
          groupedStores.set(storeGroupKey, {
            customer,
            vehicleId,
            vehicleName: resolvedVehicleName,
            items: new Map(),
          });
        }

        const groupedStore = groupedStores.get(storeGroupKey);
        if (!groupedStore) continue;

        for (const item of order.order_items ?? []) {
          const key = `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}`;
          const quantity = Number(item.quantity ?? 0);
          groupedStore.items.set(key, (groupedStore.items.get(key) ?? 0) + quantity);

          const productVehicleKey = `${vehicleId ?? "unassigned"}||${key}`;
          const existingSummaryProduct = overallProductMap.get(productVehicleKey);
          if (existingSummaryProduct) {
            existingSummaryProduct.quantity += quantity;
          } else {
            overallProductMap.set(productVehicleKey, {
              productId: item.product_id,
              sku: item.products.sku,
              name: packingListNameByProductId.get(item.product_id) ?? item.products.name,
              unit: item.sale_unit_label,
              quantity,
              vehicleId,
              vehicleName: resolvedVehicleName,
            });
          }
        }
      }

      const stores = Array.from(groupedStores.values())
        .sort((a, b) => {
          const vehicleIds = vehicles.map((vehicle) => vehicle.id);
          const indexA = a.vehicleId ? vehicleIds.indexOf(a.vehicleId) : 999;
          const indexB = b.vehicleId ? vehicleIds.indexOf(b.vehicleId) : 999;
          const vehicleSort = (indexA === -1 ? 998 : indexA) - (indexB === -1 ? 998 : indexB);
          if (vehicleSort !== 0) return vehicleSort;
          return a.customer.customer_code.localeCompare(b.customer.customer_code);
        })
        .map((group) => ({
          id: group.customer.customer_code,
          name: group.customer.name,
          vehicleId: group.vehicleId,
          vehicleName: group.vehicleName,
          consolidatedItems: group.items,
        }));

      const productMap = new Map<
        string,
        {
          productId: string;
          sku: string;
          name: string;
          unit: string;
        }
      >();

      for (const store of stores) {
        for (const key of store.consolidatedItems.keys()) {
          if (productMap.has(key)) continue;

          const orderItem = dateOrders
            .flatMap((order) => order.order_items ?? [])
            .find((item) => `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}` === key);

          if (!orderItem) continue;

          productMap.set(key, {
            productId: orderItem.product_id,
            sku: orderItem.products.sku,
            name: packingListNameByProductId.get(orderItem.product_id) ?? orderItem.products.name,
            unit: orderItem.sale_unit_label,
          });
        }
      }

      const products = Array.from(productMap.entries())
        .map(([key, product]) => ({
          key,
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        }))
        .sort((a, b) => {
          const indexA = a.productId ? productSortIndexMap.get(a.productId) ?? 999999 : 999999;
          const indexB = b.productId ? productSortIndexMap.get(b.productId) ?? 999999 : 999999;
          if (indexA !== indexB) return indexA - indexB;
          return a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name);
        });

      const qty = products.map((product) => stores.map((store) => store.consolidatedItems.get(product.key) ?? 0));

      for (const store of stores) {
        const items = products
          .map((product) => ({
            key: product.key,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            quantity: store.consolidatedItems.get(product.key) ?? 0,
          }))
          .filter((item) => item.quantity > 0);

        const summaryStoreKey = `${currentDate}:${store.id}:${store.vehicleId ?? "unassigned"}`;
        overallStoreMap.set(summaryStoreKey, {
          id: summaryStoreKey,
          customerCode: store.id,
          customerName: store.name,
          date: currentDate,
          dateLabel,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          vehicleId: store.vehicleId,
          vehicleName: store.vehicleName,
          items: items.map((item) => ({
            key: item.key,
            sku: item.sku,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
          })),
        });
      }

      return {
        date: currentDate,
        dateLabel,
        organizationName: "T&Y Noodle",
        stores: stores.map((store) => ({
          id: store.id,
          name: store.name,
          vehicleId: store.vehicleId,
          vehicleName: store.vehicleName,
        })),
        products: products.map((product) => ({
          key: product.key,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        })),
        qty,
        vehicles,
      };
    });

  const summaryProducts: PackingListSummaryProduct[] = Array.from(overallProductMap.values())
    .sort((a, b) => {
      const indexA = productSortIndexMap.get(a.productId) ?? 999999;
      const indexB = productSortIndexMap.get(b.productId) ?? 999999;
      if (indexA !== indexB) return indexA - indexB;
      return a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name);
    })
    .map((product) => ({
      key: `${product.vehicleId ?? "unassigned"}||${product.sku.toLowerCase()}||${product.unit.toLowerCase()}`,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      quantity: product.quantity,
      vehicleId: product.vehicleId,
      vehicleName: product.vehicleName,
    }));

  const summaryStores = Array.from(overallStoreMap.values()).sort(
    (a, b) =>
      (a.vehicleName ?? "").localeCompare(b.vehicleName ?? "", "th") ||
      a.customerCode.localeCompare(b.customerCode) ||
      a.customerName.localeCompare(b.customerName),
  );

  const totalStores = allPackingData.reduce((sum, packingData) => sum + packingData.stores.length, 0);
  const mainDateLabel =
    allPackingData.length > 1
      ? `${allPackingData[0]?.dateLabel ?? ""} - ${allPackingData[allPackingData.length - 1]?.dateLabel ?? ""}`
      : (allPackingData[0]?.dateLabel ?? "");
  const unassignedStores = allPackingData.flatMap((packingData) =>
    packingData.stores.filter((store: PackingListStore) => store.vehicleId === null).map((store: PackingListStore) => store.name),
  );

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <div
        className="no-print"
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          background: "white",
          padding: "10px 14px",
          borderRadius: "14px",
          boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
          position: "fixed",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          fontFamily: "Sarabun, sans-serif",
          width: "max-content",
          maxWidth: "calc(100vw - 24px)",
          border: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 800, color: "#003366" }}>
          {layout === "transposed" ? "ใบจัดของ (สลับตาราง)" : "ใบจัดของ"}
        </span>
        <span className="hidden sm:inline" style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
          {mainDateLabel} · {totalStores} ร้าน
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "nowrap",
          }}
        >
          <div className="hidden md:block">
            <PackingListSummaryButton dateLabel={mainDateLabel} products={summaryProducts} stores={summaryStores} />
          </div>
          <div className="hidden md:block">
            <PrintPackingListButton
              date={date}
              endDate={endDate}
              layout={layout === "standard" ? "transposed" : "standard"}
              label={layout === "standard" ? "ใบจัดของ (สลับตาราง)" : "ใบจัดของ (ตารางเดิม)"}
            />
          </div>
          <PackingListPrintButton unassignedStores={unassignedStores} dateLabel={mainDateLabel} hidePrintOnMobile />
        </div>
        <a
          href="/orders/incoming"
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#ef4444",
            textDecoration: "none",
            marginLeft: "4px",
            padding: "6px 12px",
            borderRadius: "8px",
            background: "#fef2f2",
          }}
        >
          กลับ
        </a>
      </div>

      {allPackingData.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: "Sarabun, sans-serif",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีออเดอร์ในช่วงที่เลือก</p>
          <a href="/orders/incoming" style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}>
            กลับหน้าออเดอร์
          </a>
        </div>
      ) : (
        <div className="packing-print-container">
          {allPackingData.map((packingData) => (
            <PackingListLayout key={`${layout}-${packingData.date}`} data={packingData} layout={layout} />
          ))}
        </div>
      )}
    </>
  );
}
