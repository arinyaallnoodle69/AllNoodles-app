import { ClipboardList, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { unstable_cache } from "next/cache";
import { SettingsShell } from "@/components/settings/settings-shell";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { IncomingOrdersMobileList } from "@/components/orders/incoming-orders-mobile-list";
import { IncomingOrderDateFilter } from "@/components/orders/incoming-order-date-filter";
import { OrderCustomerFilter } from "@/components/orders/order-customer-filter";
import { requireAnyRole } from "@/lib/auth/authorization";
import { normalizeOrderDate, getTodayInBangkok } from "@/lib/orders/date";
import { getCustomerOrderCountsByDate, getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getBilledDeliveryNumbersForRange } from "@/lib/billing/billing-statement";
import { getPendingLineOrders } from "@/lib/orders/line-pending";
import { getCustomersForOrder, getProductsForOrder, getVehiclesForOrder } from "@/lib/orders/manage";
import { getDeliveryList } from "@/lib/delivery/delivery-list";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveWarehouses } from "@/lib/warehouses";
import { IncomingOrdersDeliveryActions } from "@/components/orders/incoming-orders-delivery-actions";
import type {
  PackingListSummaryProduct,
  PackingListSummaryStore,
} from "@/components/orders/packing-list-summary-button";

const CreateOrderModal = dynamic(() =>
  import("@/components/orders/create-order-modal").then((mod) => mod.CreateOrderModal),
);
const IncomingOrdersDesktopTable = dynamic(() =>
  import("@/components/orders/incoming-orders-desktop-table").then((mod) => mod.IncomingOrdersDesktopTable),
);
const IncomingOrderModal = dynamic(() =>
  import("@/components/orders/incoming-order-modal").then((mod) => mod.IncomingOrderModal),
);
const PackingListSummaryButton = dynamic(() =>
  import("@/components/orders/packing-list-summary-button").then((mod) => mod.PackingListSummaryButton),
);
const PendingLineOrdersSection = dynamic(() =>
  import("@/components/orders/pending-line-orders-section").then((mod) => mod.PendingLineOrdersSection),
);
const PrintPackingListCombinedButton = dynamic(() =>
  import("@/components/orders/print-packing-list-combined-button").then((mod) => mod.PrintPackingListCombinedButton),
);
const PrintVehicleProductSummaryButton = dynamic(() =>
  import("@/components/orders/print-vehicle-product-summary-button").then((mod) => mod.PrintVehicleProductSummaryButton),
);
const PrintFactoryOrderSheetButton = dynamic(() =>
  import("@/components/orders/print-factory-order-sheet-button").then((mod) => mod.PrintFactoryOrderSheetButton),
);
const MobilePrintActions = dynamic(() =>
  import("@/components/orders/mobile-print-actions").then((mod) => mod.MobilePrintActions),
);

export const metadata = { title: "รายการออเดอร์" };

type IncomingOrdersPageProps = {
  searchParams: Promise<{
    create?: string;
    customers?: string;
    date?: string;
    endDate?: string;
    expanded?: string;
    q?: string;
    warehouse?: string;
    vehicle?: string;
  }>;
};

type IncomingOrderSummaryItemRow = {
  order_id: string;
  product_id: string;
  quantity: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
  } | null;
};

const ORDER_SUMMARY_ITEM_CHUNK_SIZE = 50;

async function getOrderSummaryItems(
  admin: ReturnType<typeof getSupabaseAdmin>,
  orderIds: string[],
) {
  if (orderIds.length === 0) {
    return { data: [] as IncomingOrderSummaryItemRow[], error: null };
  }

  const chunks: string[][] = [];
  for (let index = 0; index < orderIds.length; index += ORDER_SUMMARY_ITEM_CHUNK_SIZE) {
    chunks.push(orderIds.slice(index, index + ORDER_SUMMARY_ITEM_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      admin
        .from("order_items")
        .select(
          `
            order_id,
            product_id,
            quantity,
            sale_unit_label,
            products!inner(name, sku)
          `,
        )
        .in("order_id", chunk),
    ),
  );

  const error = results.find((result) => result.error)?.error ?? null;
  if (error) {
    return { data: [] as IncomingOrderSummaryItemRow[], error };
  }

  return {
    data: results.flatMap((result) => (result.data ?? []) as IncomingOrderSummaryItemRow[]),
    error: null,
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDisplayDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

const getCachedPendingLineOrders = (
  orgId: string,
  opts: { orderDate: string; endDate?: string; searchTerm?: string },
) =>
  unstable_cache(
    () => getPendingLineOrders(orgId, opts),
    ["incoming-pending-line-orders", orgId, opts.orderDate, opts.endDate ?? "", opts.searchTerm ?? ""],
    { revalidate: 3, tags: [`orders-${orgId}`] },
  )();

const getCachedDeliveryList = (
  orgId: string,
  from: string,
  to: string,
  keyword: string,
) =>
  unstable_cache(
    () => getDeliveryList(orgId, from, to, keyword),
    ["incoming-delivery-list", orgId, from, to, keyword],
    { revalidate: 3, tags: [`orders-${orgId}`] },
  )();

const getCachedBilledDeliveryNumbersArray = (
  orgId: string,
  fromDate: string,
  toDate: string,
) =>
  unstable_cache(
    async () => {
      const set = await getBilledDeliveryNumbersForRange(orgId, fromDate, toDate);
      return Array.from(set);
    },
    ["incoming-billed-delivery-numbers", orgId, fromDate, toDate],
    { revalidate: 3, tags: [`orders-${orgId}`] },
  )();

export default async function IncomingOrdersPage({ searchParams }: IncomingOrdersPageProps) {
  const session = await requireAnyRole(["admin", "member"]);
  const admin = getSupabaseAdmin();
  const params = await searchParams;
  const orderDate = normalizeOrderDate(params.date);
  const endDate = params.endDate ? normalizeOrderDate(params.endDate) : orderDate;
  const searchTerm = params.q?.trim() ?? "";
  const expandedOrderId = params.expanded?.trim() ?? "";
  const autoOpenCreateModal = params.create === "1";
  const selectedWarehouseId = params.warehouse?.trim() ?? "";
  const selectedVehicleId = params.vehicle?.trim() ?? "__all__";
  const selectedCustomerIds = Array.from(
    new Set(
      (params.customers ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  const [
    orders,
    expandedDetail,
    customers,
    products,
    vehicles,
    pendingLineOrders,
    warehouses,
    customerOrderCountsToday,
    deliveryData,
    billedDeliveryNumbersArray,
  ] = await Promise.all([
    getIncomingOrders(session.organizationId, { orderDate, endDate, searchTerm }),
    expandedOrderId ? getOrderDetailById(session.organizationId, expandedOrderId) : Promise.resolve(null),
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
    getVehiclesForOrder(session.organizationId),
    getCachedPendingLineOrders(session.organizationId, { orderDate, endDate, searchTerm }),
    getActiveWarehouses(session.organizationId),
    getCustomerOrderCountsByDate(session.organizationId, orderDate, endDate),
    getCachedDeliveryList(session.organizationId, orderDate, endDate, searchTerm || ""),
    getCachedBilledDeliveryNumbersArray(session.organizationId, orderDate, endDate),
  ]);

  const billedDeliveryNumbers = new Set(billedDeliveryNumbersArray);

  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    code: customer.code,
    name: customer.name,
    defaultVehicleId: customer.defaultVehicleId,
  }));
  const productImageById = new Map(products.map((product) => [product.id, product.imageUrl ?? null]));

  const activeOrders = orders.filter((order) => order.status !== "cancelled");

  let baseFilteredOrders =
    selectedCustomerIds.length > 0
      ? activeOrders.filter((order) => selectedCustomerIds.includes(order.customerId))
      : activeOrders;

  if (selectedWarehouseId) {
    baseFilteredOrders = baseFilteredOrders.filter((order) => order.warehouseId === selectedWarehouseId);
  }

  let filteredOrders = baseFilteredOrders;
  if (selectedVehicleId !== "__all__") {
    if (selectedVehicleId === "__none__") {
      filteredOrders = baseFilteredOrders.filter((order) => !order.vehicleId);
    } else {
      filteredOrders = baseFilteredOrders.filter((order) => order.vehicleId === selectedVehicleId);
    }
  }

  const filteredExpandedDetail =
    expandedDetail &&
    expandedDetail.status !== "cancelled" &&
    (selectedCustomerIds.length === 0 || selectedCustomerIds.includes(expandedDetail.customer.id)) &&
    (!selectedWarehouseId || expandedDetail.warehouseId === selectedWarehouseId)
      ? expandedDetail
      : null;

  const activeOrderIds = activeOrders.map((order) => order.id);
  const orderSummaryItemsResult = await getOrderSummaryItems(admin, activeOrderIds);

  if (orderSummaryItemsResult.error) {
    throw new Error(orderSummaryItemsResult.error.message ?? "Failed to load order summary items.");
  }

  const itemsByOrderId = new Map<string, IncomingOrderSummaryItemRow[]>();
  for (const row of (orderSummaryItemsResult.data ?? []) as IncomingOrderSummaryItemRow[]) {
    const current = itemsByOrderId.get(row.order_id) ?? [];
    current.push(row);
    itemsByOrderId.set(row.order_id, current);
  }

  const summaryProductMap = new Map<string, PackingListSummaryProduct>();
  const summaryStoreMap = new Map<string, PackingListSummaryStore>();

  for (const order of filteredOrders) {
    const orderItems = itemsByOrderId.get(order.id) ?? [];
    const storeKey = `${order.customerId}_${order.orderDate}_${order.vehicleId ?? "unassigned"}`;
    const existingStore = summaryStoreMap.get(storeKey) ?? {
      id: storeKey,
      customerCode: order.customerCode,
      customerName: order.customerName,
      date: order.orderDate,
      dateLabel: formatDisplayDate(order.orderDate),
      itemCount: 0,
      totalQuantity: 0,
      vehicleId: order.vehicleId,
      vehicleName: order.vehicleName,
      items: [],
    };
    const storeItemMap = new Map(existingStore.items.map((item) => [item.key, item]));

    for (const item of orderItems) {
      if (!item.products) continue;
      const unit = item.sale_unit_label?.trim() || "-";
      const quantity = Number(item.quantity ?? 0);
      const key = `${String(item.products.sku).trim().toLowerCase()}||${unit.toLowerCase()}`;
      const vehicleProductKey = `${order.vehicleId ?? "unassigned"}||${key}`;

      const existingProduct = summaryProductMap.get(vehicleProductKey);
      if (existingProduct) {
        existingProduct.quantity += quantity;
      } else {
        summaryProductMap.set(vehicleProductKey, {
          key: vehicleProductKey,
          sku: item.products.sku,
          name: item.products.name,
          unit,
          quantity,
          imageUrl: productImageById.get(item.product_id) ?? null,
          vehicleId: order.vehicleId,
          vehicleName: order.vehicleName,
        });
      }

      const existingStoreItem = storeItemMap.get(key);
      if (existingStoreItem) {
        existingStoreItem.quantity += quantity;
      } else {
        storeItemMap.set(key, {
          key,
          sku: item.products.sku,
          name: item.products.name,
          unit,
          quantity,
        });
      }
    }

    const storeItems = Array.from(storeItemMap.values()).sort((a, b) => {
      const skuCompare = a.sku.localeCompare(b.sku, "th");
      if (skuCompare !== 0) return skuCompare;
      return a.name.localeCompare(b.name, "th");
    });

    existingStore.items = storeItems;
    existingStore.itemCount = storeItems.length;
    existingStore.totalQuantity = storeItems.reduce((sum, item) => sum + item.quantity, 0);
    summaryStoreMap.set(storeKey, existingStore);
  }

  const summaryProducts = Array.from(summaryProductMap.values()).sort((a, b) => {
    const skuCompare = a.sku.localeCompare(b.sku, "th");
    if (skuCompare !== 0) return skuCompare;
    return a.name.localeCompare(b.name, "th");
  });

  const summaryStores = Array.from(summaryStoreMap.values()).sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const vehicleCompare = (a.vehicleName ?? "").localeCompare(b.vehicleName ?? "", "th");
    if (vehicleCompare !== 0) return vehicleCompare;
    return `${a.customerCode} ${a.customerName}`.localeCompare(`${b.customerCode} ${b.customerName}`, "th");
  });

  type DirectDeliveryRow = {
    id: string;
    order_id: string | null;
    customer_id: string;
    delivery_date: string;
    delivery_number: string;
  };

  // Fetch direct delivery notes by activeOrderIds in chunks of 40 to solve any deliveryDate vs orderDate mismatches and URL limit errors
  const directDeliveries: DirectDeliveryRow[] = [];
  if (activeOrderIds.length > 0) {
    const orderIdChunks: string[][] = [];
    for (let i = 0; i < activeOrderIds.length; i += 40) {
      orderIdChunks.push(activeOrderIds.slice(i, i + 40));
    }

    for (const chunk of orderIdChunks) {
      const { data, error } = await admin
        .from("delivery_notes")
        .select("id, order_id, customer_id, delivery_date, delivery_number")
        .eq("organization_id", session.organizationId)
        .in("order_id", chunk)
        .eq("status", "confirmed");

      if (!error && data) {
        directDeliveries.push(...data);
      }
    }
  }

  const deliveryMap = new Map<string, string[]>();
  const deliveryIdMap = new Map<string, string[]>();

  for (const item of deliveryData) {
    const key = `${item.customerId}_${item.deliveryDate}`;
    deliveryMap.set(
      key,
      item.deliveryNotes.map((note) => note.deliveryNumber),
    );
    deliveryIdMap.set(
      key,
      item.deliveryNotes.map((note) => note.id),
    );
  }

  // Enrich with direct deliveries using orderDate!
  if (directDeliveries) {
    for (const note of directDeliveries) {
      if (!note.order_id) continue;
      const matchedOrder = activeOrders.find((o) => o.id === note.order_id);
      if (matchedOrder) {
        // We map under key: customerId_orderDate
        const key = `${matchedOrder.customerId}_${matchedOrder.orderDate}`;
        
        const existingNumbers = deliveryMap.get(key) ?? [];
        if (!existingNumbers.includes(note.delivery_number)) {
          existingNumbers.push(note.delivery_number);
        }
        deliveryMap.set(key, existingNumbers);

        const existingIds = deliveryIdMap.get(key) ?? [];
        if (!existingIds.includes(note.id)) {
          existingIds.push(note.id);
        }
        deliveryIdMap.set(key, existingIds);
      }
    }
  }

  type GroupedOrderStore = {
    customerId: string;
    customerName: string;
    customerCode: string;
    hasDelivery: boolean;
    orderDate: string;
    orderIds: string[];
    orderNumbers: string[];
    deliveryNoteIds: string[];
    deliveryNumbers: string[];
    orderRounds: number;
    totalAmount: number;
    vehicleId?: string | null;
    vehicleName?: string | null;
  };

  const visibleOrderStores = Array.from(
    filteredOrders
      .filter((order) => order.status === "submitted" || order.status === "confirmed")
      .reduce((storeMap, order) => {
        const groupKey = `${order.customerId}_${order.orderDate}`;
        const current = storeMap.get(groupKey) ?? {
          customerId: order.customerId,
          customerName: order.customerName,
          customerCode: order.customerCode,
          hasDelivery: false,
          orderDate: order.orderDate,
          orderIds: [] as string[],
          orderNumbers: [] as string[],
          deliveryNoteIds: [] as string[],
          deliveryNumbers: [] as string[],
          orderRounds: 0,
          totalAmount: 0,
          vehicleId: order.vehicleId,
          vehicleName: order.vehicleName,
        };

        current.orderIds.push(order.id);
        current.orderNumbers.push(order.orderNumber);
        current.orderRounds += 1;
        current.totalAmount += order.totalAmount;
        storeMap.set(groupKey, current);
        return storeMap;
      }, new Map<string, GroupedOrderStore>())
      .values(),
  ).map((store) => ({
    ...store,
    hasDelivery: Boolean(deliveryMap.get(`${store.customerId}_${store.orderDate}`)?.length),
    deliveryNoteIds: deliveryIdMap.get(`${store.customerId}_${store.orderDate}`) ?? [],
    deliveryNumbers: deliveryMap.get(`${store.customerId}_${store.orderDate}`) ?? [],
  }));

  const deliveryByCustomerId = Object.fromEntries(deliveryMap.entries());
  const billedDeliveryByCustomerDate = Object.fromEntries(
    Array.from(deliveryMap.entries()).map(([key, deliveryNumbers]) => [
      key,
      deliveryNumbers.some((deliveryNumber) => billedDeliveryNumbers.has(deliveryNumber)),
    ]),
  );

  const mobileMappedOrders = filteredOrders.map((order) => {
    const deliveryNumbers = deliveryMap.get(`${order.customerId}_${order.orderDate}`);
    const isBilled = billedDeliveryByCustomerDate[`${order.customerId}_${order.orderDate}`] ?? false;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      customerCode: order.customerCode,
      channelLabel: order.channelLabel,
      orderDate: order.orderDate,
      notes: order.notes,
      productCount: order.productCount,
      totalAmount: order.totalAmount,
      totalAmountText: `${formatCurrency(order.totalAmount)} บาท`,
      vehicleId: order.vehicleId,
      vehicleName: order.vehicleName,
      deliveryNumbers,
      isBilled,
      warehouseId: order.warehouseId,
      warehouseName: order.warehouseName,
    };
  });

  return (
    <SettingsShell
      title="คำสั่งซื้อ"
      description=""
      floatingSubmit={false}
      hideHeader
    >
      <div className="space-y-6">
        <div className="sticky top-0 z-40 -mx-3 hidden border-b border-[#EA80FC]/35 bg-white/95 px-4 py-3 shadow-[0_14px_34px_rgba(142, 36, 170,0.08)] backdrop-blur lg:block">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-1.5 rounded-full bg-[#EA80FC]" />
                  <p className="text-lg font-black text-[#4A148C]">รายการออเดอร์</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-[#4A148C]">
                  แสดง {filteredOrders.length.toLocaleString("th-TH")} ออเดอร์
                </p>
              </div>

            </div>

            <form action="/orders/incoming" method="get" className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_14rem_12rem_10rem_10rem_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#4A148C]" strokeWidth={2} />
                <input
                  type="search"
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="ค้นหาชื่อร้าน หรือเลขออเดอร์"
                  className="h-12 w-full rounded-xl border border-[#EA80FC]/35 bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] shadow-sm outline-none transition placeholder:text-[#4A148C]/70 focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/20"
                />
              </label>

              <OrderCustomerFilter
                options={customerOptions}
                selectedIds={selectedCustomerIds}
                placeholder="เลือกร้านค้า"
              />

              <div className="w-full">
                <select
                  name="warehouse"
                  defaultValue={selectedWarehouseId}
                  className="h-12 w-full rounded-xl border border-[#EA80FC]/35 bg-white px-3 text-sm font-semibold text-[#4A148C] shadow-sm outline-none transition focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/20"
                >
                  <option value="">ทุกคลังสินค้า</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <IncomingOrderDateFilter
                id="incoming-date"
                name="date"
                defaultValue={orderDate}
                noAutoSubmit={true}
              />

              <IncomingOrderDateFilter
                id="incoming-endDate"
                name="endDate"
                defaultValue={endDate}
                noAutoSubmit={true}
              />

              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[#EA80FC]/70 bg-[#4A148C] px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.24)] transition hover:bg-[#4A148C] active:scale-[0.98]"
              >
                ค้นหา
              </button>
            </form>
          </div>
        </div>

        <div className="fixed bottom-8 right-8 z-40 hidden lg:block [&_.action-touch-safe]:border [&_.action-touch-safe]:border-[#EA80FC]/85 [&_.action-touch-safe]:bg-[#4A148C] [&_.action-touch-safe]:shadow-[0_18px_44px_rgba(142, 36, 170,0.34)] [&_.action-touch-safe]:hover:bg-[#4A148C]">
          <div className="rounded-full bg-[#EA80FC]/35 p-[2px] shadow-[0_18px_42px_rgba(142, 36, 170,0.28)]">
            <CreateOrderModal
              autoOpen={autoOpenCreateModal}
              customerOrderCountsToday={customerOrderCountsToday}
              customers={customers}
              products={products}
              vehicles={vehicles}
              today={getTodayInBangkok()}
            />
          </div>
        </div>

        <MobileSearchDrawer title="ค้นหาออเดอร์">
          <form action="/orders/incoming" method="get" className="flex flex-col gap-4 pb-24">
            <label htmlFor="m-incoming-date" className="text-sm font-semibold text-[#4A148C]">
              วันที่เริ่มต้น
            </label>
            <IncomingOrderDateFilter
              id="m-incoming-date"
              name="date"
              defaultValue={orderDate}
              noAutoSubmit={true}
            />

            <label htmlFor="m-incoming-endDate" className="text-sm font-semibold text-[#4A148C]">
              วันที่สิ้นสุด
            </label>
            <IncomingOrderDateFilter
              id="m-incoming-endDate"
              name="endDate"
              defaultValue={endDate}
              noAutoSubmit={true}
            />

            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#4A148C]" strokeWidth={2} />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อร้าน หรือเลขออเดอร์"
                className="h-12 w-full rounded-xl border border-[#EA80FC]/35 bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#4A148C]/70 focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/20"
              />
            </label>

            <OrderCustomerFilter
              options={customerOptions}
              selectedIds={selectedCustomerIds}
              placeholder="เลือกร้านค้า"
            />

            <label className="text-sm font-semibold text-[#4A148C]">
              คลังสินค้า
            </label>
            <div className="w-full">
              <select
                name="warehouse"
                defaultValue={selectedWarehouseId}
                className="h-12 w-full rounded-xl border border-[#EA80FC]/35 bg-white px-3 text-sm font-semibold text-[#4A148C] outline-none transition focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/20"
              >
                <option value="">ทุกคลังสินค้า</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[#EA80FC]/70 bg-[#4A148C] px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.24)] transition active:scale-[0.98]"
            >
              ค้นหา
            </button>
          </form>
        </MobileSearchDrawer>

        <PendingLineOrdersSection
          customers={customers}
          pendingOrders={pendingLineOrders}
          warehouses={warehouses}
        />

        <section className="relative mt-0 w-full bg-transparent">
          <div className="flex flex-col gap-3 px-1 py-1 sm:py-3">
            <div className="flex items-center justify-center gap-2 w-full">
              <ClipboardList className="h-5 w-5 text-[#4A148C] sm:h-6 sm:w-6" strokeWidth={2.5} />
              <h2 className="text-base font-bold text-slate-950 sm:text-xl">รายการออเดอร์เข้า</h2>
              {filteredOrders.length > 0 ? (
                <span className="rounded-md bg-[#EA80FC]/20 px-1.5 py-0.5 text-[9px] font-black text-[#4A148C] ring-1 ring-[#EA80FC]/40 sm:text-xs">
                  {filteredOrders.length}
                </span>
              ) : null}
            </div>

            {/* Mobile View: Premium Actions Bottom Sheet */}
            <div className="block sm:hidden w-full">
              <MobilePrintActions
                date={orderDate}
                endDate={endDate}
                dateLabel={orderDate === endDate ? formatDisplayDate(orderDate) : `${formatDisplayDate(orderDate)} - ${formatDisplayDate(endDate)}`}
                summaryProducts={summaryProducts}
                summaryStores={summaryStores}
                visibleOrderStores={visibleOrderStores}
              />
            </div>

            {/* Desktop & Tablet View: 5 Equal Width Action Cards Grid */}
            <div className="hidden sm:block w-full">
              <div className="grid grid-cols-5 gap-3 w-full [&_button]:w-full [&_button]:h-full [&_button]:justify-center [&_button]:rounded-2xl [&_button]:border-[#EA80FC]/35 [&_button]:py-3.5 [&_button]:px-5">
                <PackingListSummaryButton
                  dateLabel={orderDate === endDate ? formatDisplayDate(orderDate) : `${formatDisplayDate(orderDate)} - ${formatDisplayDate(endDate)}`}
                  products={summaryProducts}
                  stores={summaryStores}
                />
                <PrintPackingListCombinedButton date={orderDate} endDate={endDate} />
                <PrintVehicleProductSummaryButton date={orderDate} endDate={endDate} />
                <PrintFactoryOrderSheetButton date={orderDate} endDate={endDate} />
                <IncomingOrdersDeliveryActions date={orderDate} endDate={endDate} stores={visibleOrderStores} />
              </div>
            </div>
          </div>

          {baseFilteredOrders.length > 0 ? (
            <>
              <div className="relative left-1/2 w-screen -translate-x-1/2 lg:hidden">
                <IncomingOrdersMobileList
                  orders={mobileMappedOrders}
                  vehicles={vehicles}
                  currentListDate={orderDate}
                  searchTerm={searchTerm}
                  selectedCustomerIds={selectedCustomerIds}
                />
              </div>

              <div className="hidden overflow-x-auto no-scrollbar lg:block">
                <div className="lg:min-w-0 xl:min-w-[1100px]">
                  <IncomingOrdersDesktopTable
                    billedByCustomerDate={billedDeliveryByCustomerDate}
                    deliveryByCustomerId={deliveryByCustomerId}
                    initialExpandedDetail={filteredExpandedDetail}
                    initialExpandedOrderId={expandedOrderId}
                    orderDate={orderDate}
                    orders={filteredOrders}
                    searchTerm={searchTerm}
                    selectedCustomerIds={selectedCustomerIds}
                    vehicles={vehicles}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-slate-950">ยังไม่มีออเดอร์เข้าในช่วงวันที่เลือก</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                เมื่อลูกค้าส่งคำสั่งซื้อเข้ามา ระบบจะแสดงรายการออเดอร์แต่ละใบที่หน้านี้
              </p>
            </div>
          )}
        </section>
      </div>

      {expandedOrderId && filteredExpandedDetail ? (
        <IncomingOrderModal
          allOrders={filteredOrders}
          date={orderDate}
          detail={filteredExpandedDetail}
          expandedId={expandedOrderId}
          products={products}
          searchTerm={searchTerm}
        />
      ) : null}
    </SettingsShell>
  );
}
