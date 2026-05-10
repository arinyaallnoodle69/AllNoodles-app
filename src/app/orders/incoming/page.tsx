import { Search } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { IncomingOrdersDesktopTable } from "@/components/orders/incoming-orders-desktop-table";
import { IncomingOrderOpenCard } from "@/components/orders/incoming-order-open-card";
import { IncomingOrderDateFilter } from "@/components/orders/incoming-order-date-filter";
import { PendingLineOrdersSection } from "@/components/orders/pending-line-orders-section";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeOrderDate, getTodayInBangkok } from "@/lib/orders/date";
import { getCustomerOrderCountsByDate, getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getPendingLineOrders } from "@/lib/orders/line-pending";
import { getCustomersForOrder, getProductsForOrder, getVehiclesForOrder } from "@/lib/orders/manage";
import { getDeliveryList } from "@/lib/delivery/delivery-list";
import { IncomingOrdersDeliveryActions } from "@/components/orders/incoming-orders-delivery-actions";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";

export const metadata = { title: "รายการออเดอร์" };

type IncomingOrdersPageProps = {
  searchParams: Promise<{ create?: string; date?: string; expanded?: string; q?: string }>;
};

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  const [y, m, d] = datePart.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

export default async function IncomingOrdersPage({ searchParams }: IncomingOrdersPageProps) {
  const session = await requireAppRole("admin");
  const params = await searchParams;
  const orderDate = normalizeOrderDate(params.date);
  const searchTerm = params.q?.trim() ?? "";
  const expandedOrderId = params.expanded?.trim() ?? "";
  const autoOpenCreateModal = params.create === "1";
const [
  orders,
  expandedDetail,
  customers,
  products,
  vehicles,
  pendingLineOrders,
  customerOrderCountsToday,
  deliveryData,
] = await Promise.all([
  getIncomingOrders(session.organizationId, { orderDate, searchTerm }),
  expandedOrderId ? getOrderDetailById(expandedOrderId) : Promise.resolve(null),
  getCustomersForOrder(session.organizationId),
  getProductsForOrder(session.organizationId),
  getVehiclesForOrder(session.organizationId),
  getPendingLineOrders(session.organizationId, { orderDate, searchTerm }),
  getCustomerOrderCountsByDate(session.organizationId, orderDate),
  getDeliveryList(session.organizationId, orderDate, orderDate, searchTerm || ""),
]);

  function buildExpandedHref(nextExpandedId: string | null) {
    const p = new URLSearchParams();
    p.set("date", orderDate);
    if (searchTerm) p.set("q", searchTerm);
    if (nextExpandedId) p.set("expanded", nextExpandedId);
    return `/orders/incoming?${p.toString()}`;
  }

  const deliveryMap = new Map<string, string[]>();
  for (const item of deliveryData) {
    deliveryMap.set(
      item.customerId,
      item.deliveryNotes.map((note) => note.deliveryNumber),
    );
  }

  const visibleOrderStores = Array.from(
    orders
      .filter((order) => order.status === "submitted" || order.status === "confirmed")
      .reduce((storeMap, order) => {
        const current = storeMap.get(order.customerId) ?? {
          customerId: order.customerId,
          customerName: order.customerName,
          customerCode: order.customerCode,
          orderIds: [] as string[],
          orderNumbers: [] as string[],
          orderRounds: 0,
          totalAmount: 0,
          hasDelivery: false,
        };

        current.orderIds.push(order.id);
        current.orderNumbers.push(order.orderNumber);
        current.orderRounds += 1;
        current.totalAmount += order.totalAmount;
        storeMap.set(order.customerId, current);
        return storeMap;
      }, new Map<string, { customerId: string; customerName: string; customerCode: string; orderIds: string[]; orderNumbers: string[]; orderRounds: number; totalAmount: number; hasDelivery: boolean }>())
      .values(),
  ).map(store => ({
    ...store,
    hasDelivery: !!(deliveryMap.get(store.customerId)?.length)
  }));
  const deliveryByCustomerId = Object.fromEntries(deliveryMap.entries());

  return (
    <SettingsShell
      title="คำสั่งซื้อ"
      description=""
      floatingSubmit={false}
      headerContent={
        <div className="hidden rounded-2xl border border-white/15 bg-white/10 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-md lg:block">
          <form action="/orders/incoming" method="get" className="hidden flex-1 items-center gap-2 lg:flex">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อร้าน หรือเลขออเดอร์"
                className="w-full rounded-lg border border-white/25 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-950 outline-none transition focus:border-white focus:ring-2 focus:ring-white/25"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-[#003366] shadow-sm transition hover:bg-slate-100 active:scale-[0.98]"
            >
              ค้นหา
            </button>

            <div className="ml-2 flex items-center gap-2 border-l border-white/20 pl-4">
              <div className="w-44">
                <IncomingOrderDateFilter
                  id="incoming-date"
                  name="date"
                  defaultValue={orderDate}
                />
              </div>
            </div>
          </form>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Floating Create Order Button for Desktop - Positioned at the very bottom-right, below Scroll-to-Top (which is at bottom-24) */}
        <div className="fixed bottom-6 right-6 z-[100] hidden lg:block">
          <div className="group relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#003366] to-[#1a237e] opacity-25 blur transition duration-300 group-hover:opacity-50"></div>
            <div className="relative">
              <CreateOrderModal
                autoOpen={autoOpenCreateModal}
                customerOrderCountsToday={customerOrderCountsToday}
                customers={customers}
                products={products}
                today={getTodayInBangkok()}
              />
            </div>
          </div>
        </div>

        <MobileSearchDrawer title="ค้นหาออเดอร์">
          <form action="/orders/incoming" method="get" className="flex flex-col gap-4 pb-32">
            <div className="space-y-1">
              <label className="ml-1 text-xs font-bold text-slate-900">เลือกวันที่</label>
              <IncomingOrderDateFilter
                id="m-incoming-date"
                name="date"
                defaultValue={orderDate}
              />
            </div>
            <div className="space-y-1">
              <label className="ml-1 text-xs font-bold text-slate-900">ค้นหาออเดอร์</label>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                <input
                  type="search"
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="ค้นหาจากเลขออเดอร์ ชื่อร้าน หรือช่องทาง"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-base font-medium text-slate-950 outline-none transition focus:border-[#003366] focus:bg-white"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-2xl bg-[#003366] py-4 text-base font-bold text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition active:scale-[0.98]"
            >
              ค้นหา
            </button>
          </form>
        </MobileSearchDrawer>

        <PendingLineOrdersSection customers={customers} pendingOrders={pendingLineOrders} />

        <section className="relative mt-0 w-full bg-transparent">
          <div className="flex flex-col gap-1.5 px-1 py-1 sm:flex-row sm:items-center sm:justify-between sm:py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-950 sm:text-xl">รายการออเดอร์เข้า</h2>
              {orders.length > 0 ? (
                <span className="rounded-md bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-950 ring-1 ring-slate-200 sm:text-xs">
                  {orders.length}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              <div className="flex flex-nowrap items-center gap-1.5 min-w-max">
                <PrintPackingListButton date={orderDate} />
                <IncomingOrdersDeliveryActions date={orderDate} stores={visibleOrderStores} />
              </div>
            </div>
          </div>

          {orders.length > 0 ? (
            <>
              <div className="relative left-1/2 w-screen -translate-x-1/2 lg:hidden">
                <div className="grid grid-cols-1 divide-y divide-slate-200 border-t border-slate-200 sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-slate-200">
                  {orders.map((order) => (
                    <IncomingOrderOpenCard
                      key={order.id}
                      href={buildExpandedHref(order.id)}
                      orderId={order.id}
                      orderNumber={order.orderNumber}
                      customerId={order.customerId}
                      customerName={order.customerName}
                      customerCode={order.customerCode}
                      channelLabel={order.channelLabel}
                      createdAtText={formatDateTime(order.createdAt)}
                      totalAmountText={`${formatCurrency(order.totalAmount)} บาท`}
                      vehicleId={order.vehicleId}
                      vehicleName={order.vehicleName}
                      vehicles={vehicles}
                      deliveryNumbers={deliveryMap.get(order.customerId)}
                      orderDate={order.orderDate}
                      currentListDate={orderDate}
                      productCount={order.productCount}
                      searchTerm={searchTerm}
                    />
                  ))}
                </div>
              </div>

              <div className="hidden overflow-x-auto no-scrollbar lg:block">
                <div className="min-w-[1100px]">
                  <IncomingOrdersDesktopTable
                    deliveryByCustomerId={deliveryByCustomerId}
                    initialExpandedDetail={expandedDetail}
                    initialExpandedOrderId={expandedOrderId}
                    orderDate={orderDate}
                    orders={orders}
                    searchTerm={searchTerm}
                    vehicles={vehicles}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-slate-950">ยังไม่มีออเดอร์เข้าในวันที่เลือก</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                เมื่อลูกค้าส่งคำสั่งซื้อเข้ามา ระบบจะแสดงรายการออเดอร์แต่ละใบที่หน้านี้
              </p>
            </div>
          )}
        </section>
      </div>

      {expandedOrderId ? (
        <IncomingOrderModal
          allOrders={orders}
          date={orderDate}
          detail={expandedDetail}
          expandedId={expandedOrderId}
          products={products}
          searchTerm={searchTerm}
        />
      ) : null}
    </SettingsShell>
  );
}
