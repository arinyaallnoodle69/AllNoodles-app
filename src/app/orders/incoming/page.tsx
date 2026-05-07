import { Fragment } from "react";
import { Building2, Check, Search } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { DesktopOrderDetail } from "@/components/orders/desktop-order-detail";
import { IncomingOrderDateButton } from "@/components/orders/incoming-order-date-button";
import { IncomingOrderOpenCard } from "@/components/orders/incoming-order-open-card";
import { IncomingOrderToggleButton } from "@/components/orders/incoming-order-toggle-button";
import { IncomingOrderVehicleSelect } from "@/components/orders/incoming-order-vehicle-select";
import { PendingLineOrdersSection } from "@/components/orders/pending-line-orders-section";
import { OrderStoreStatusSummary } from "@/components/orders/order-store-status-summary";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeOrderDate, getTodayInBangkok } from "@/lib/orders/date";
import { getCustomerOrderCountsByDate, getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getPendingLineOrders } from "@/lib/orders/line-pending";
import { getCustomersForOrder, getProductsForOrder, getVehiclesForOrder } from "@/lib/orders/manage";
import { getOrderStoreStatusSummary } from "@/lib/orders/store-status";
import { getDeliveryList } from "@/lib/delivery/delivery-list";
import { IncomingOrdersDeliveryActions } from "@/components/orders/incoming-orders-delivery-actions";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";
import { PrintDailyDeliveryButton } from "@/components/orders/print-daily-delivery-button";
import { PrintStoreDeliveryButton } from "@/components/orders/print-store-delivery-button";

export const metadata = { title: "รายการออเดอร์" };

type IncomingOrdersPageProps = {
  searchParams: Promise<{ date?: string; expanded?: string; q?: string }>;
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

function formatOrderDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

export default async function IncomingOrdersPage({ searchParams }: IncomingOrdersPageProps) {
  const session = await requireAppRole("admin");
  const params = await searchParams;
  const orderDate = normalizeOrderDate(params.date);
  const searchTerm = params.q?.trim() ?? "";
  const expandedOrderId = params.expanded?.trim() ?? "";

  const [
    orders,
    expandedDetail,
    customers,
    products,
    vehicles,
    pendingLineOrders,
    customerOrderCountsToday,
    storeStatusSummary,
    deliveryData,
  ] = await Promise.all([
    getIncomingOrders(session.organizationId, { orderDate, searchTerm }),
    expandedOrderId ? getOrderDetailById(expandedOrderId) : Promise.resolve(null),
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
    getVehiclesForOrder(session.organizationId),
    getPendingLineOrders(session.organizationId, { orderDate, searchTerm }),
    getCustomerOrderCountsByDate(session.organizationId, orderDate),
    getOrderStoreStatusSummary(session.organizationId, orderDate),
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
        };

        current.orderIds.push(order.id);
        current.orderNumbers.push(order.orderNumber);
        current.orderRounds += 1;
        current.totalAmount += order.totalAmount;
        storeMap.set(order.customerId, current);
        return storeMap;
      }, new Map<string, { customerId: string; customerName: string; customerCode: string; orderIds: string[]; orderNumbers: string[]; orderRounds: number; totalAmount: number }>())
      .values(),
  );

  const deliveryEligibleStores = visibleOrderStores.filter(
    (store) => !(deliveryMap.get(store.customerId)?.length),
  );

  return (
    <SettingsShell title="คำสั่งซื้อ" description="" floatingSubmit={false}>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <form action="/orders/incoming" method="get" className="hidden flex-1 items-center gap-2 md:flex">
            <div className="w-44">
              <ThaiDatePicker
                id="incoming-date"
                name="date"
                defaultValue={orderDate}
                placeholder="เลือกวันที่"
              />
            </div>
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อร้าน หรือเลขออเดอร์"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-950 outline-none transition focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#003366] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#002244] active:scale-[0.98]"
            >
              ค้นหา
            </button>

            <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-4">
              <IncomingOrdersDeliveryActions date={orderDate} stores={deliveryEligibleStores} />
              <CreateOrderModal
                customerOrderCountsToday={customerOrderCountsToday}
                customers={customers}
                products={products}
                today={getTodayInBangkok()}
              />
            </div>
          </form>

          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex items-center justify-between gap-2">
              <IncomingOrdersDeliveryActions date={orderDate} stores={deliveryEligibleStores} />
              <CreateOrderModal
                customerOrderCountsToday={customerOrderCountsToday}
                customers={customers}
                products={products}
                today={getTodayInBangkok()}
              />
            </div>
          </div>
        </section>

        <MobileSearchDrawer title="ค้นหาออเดอร์">
          <form action="/orders/incoming" method="get" className="flex flex-col gap-4 pb-32">
            <div className="space-y-1">
              <label className="ml-1 text-xs font-bold text-slate-900">เลือกวันที่</label>
              <ThaiDatePicker
                id="m-incoming-date"
                name="date"
                defaultValue={orderDate}
                placeholder="เลือกวันที่"
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
        <OrderStoreStatusSummary orderDate={orderDate} summary={storeStatusSummary} />

        <section className="mt-8 bg-transparent">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-5">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-950">รายการออเดอร์เข้า</h2>
              {orders.length > 0 ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-950 ring-1 ring-slate-200">
                  {orders.length}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <PrintPackingListButton date={orderDate} />
              <PrintDailyDeliveryButton date={orderDate} />
            </div>
          </div>

          {orders.length > 0 ? (
            <>
              <div className="divide-y divide-slate-200 border-t border-slate-200 md:hidden">
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

              <div className="hidden md:block">
                <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-950">ตารางรายการคำสั่งซื้อล่าสุด</h3>
                      <p className="mt-1 text-base font-medium text-slate-950">
                        จัดการและติดตามสถานะออเดอร์ในวันที่เลือกจากจุดเดียว
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#003366]" />
                      รายการทั้งหมด
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                      <thead className="bg-slate-50 text-slate-950">
                        <tr className="border-b border-slate-200">
                          <th className="w-[30%] px-6 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">ร้านค้า</th>
                          <th className="w-[11%] px-6 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">วันที่</th>
                          <th className="w-[9%] px-6 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">ช่องทาง</th>
                          <th className="w-[10%] px-6 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">สินค้า</th>
                          <th className="w-[11%] px-6 py-4 text-right text-sm font-bold tracking-[0.04em] whitespace-nowrap text-slate-950">ยอดรวม</th>
                          <th className="w-[12%] px-6 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">การจัดส่ง</th>
                          <th className="w-[17%] px-6 py-4 pr-16 text-center text-sm font-bold tracking-[0.04em] text-slate-950 md:pr-20">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {orders.map((order) => {
                          const isExpanded = expandedOrderId === order.id;
                          const deliveryNumbers = deliveryMap.get(order.customerId);
                          const hasDelivery = Boolean(deliveryNumbers && deliveryNumbers.length > 0);

                          return (
                            <Fragment key={order.id}>
                              <tr className="align-middle transition-colors hover:bg-slate-50/80">
                                <td className="px-6 py-5">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Building2 className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
                                      <p className="truncate text-base font-bold leading-6 text-slate-950">
                                        <span translate="no">{order.customerCode}</span> - {order.customerName}
                                      </p>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 pl-6">
                                      <p className="truncate font-mono text-sm font-semibold leading-5 text-slate-950" translate="no">
                                        {order.orderNumber}
                                      </p>
                                      {hasDelivery ? (
                                        <span
                                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"
                                          title="สร้างใบส่งของแล้ว"
                                          aria-label="สร้างใบส่งของแล้ว"
                                        >
                                          <Check className="h-3 w-3" strokeWidth={3} />
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-base font-semibold whitespace-nowrap text-slate-950">
                                  {formatOrderDate(order.orderDate)}
                                </td>
                                <td className="px-6 py-5">
                                  <div className="space-y-1.5">
                                    <span className="inline-flex min-h-8 items-center py-1 text-sm font-semibold text-slate-950">
                                      {order.channelLabel}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-5">
                                  <p className="whitespace-nowrap text-base font-semibold text-slate-950">
                                    {order.productCount.toLocaleString("th-TH")} รายการ
                                  </p>
                                </td>
                                <td className="px-6 py-5 text-right whitespace-nowrap">
                                  <p className="font-mono text-base font-bold text-slate-950">
                                    ฿{formatCurrency(order.totalAmount)}
                                  </p>
                                </td>
                                <td className="px-6 py-5">
                                  <div className="max-w-[210px]">
                                    <IncomingOrderVehicleSelect
                                      customerId={order.customerId}
                                      currentVehicleId={order.vehicleId}
                                      currentVehicleName={order.vehicleName}
                                      vehicles={vehicles}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-5 pr-16 md:pr-20">
                                  <div className="mx-auto flex max-w-[160px] items-center justify-center gap-2">
                                    <IncomingOrderDateButton
                                      currentListDate={orderDate}
                                      orderDate={order.orderDate}
                                      orderId={order.id}
                                      orderNumber={order.orderNumber}
                                      searchTerm={searchTerm}
                                    />
                                    <IncomingOrderToggleButton
                                      href={buildExpandedHref(isExpanded ? null : order.id)}
                                      expanded={isExpanded}
                                      orderNumber={order.orderNumber}
                                      iconOnly
                                    />
                                    {hasDelivery ? (
                                      <PrintStoreDeliveryButton
                                        date={orderDate}
                                        customerId={order.customerId}
                                        label="พิมพ์ใบส่งของ"
                                        iconOnly
                                      />
                                    ) : null}
                                  </div>
                                </td>
                              </tr>

                              {isExpanded && expandedDetail ? (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={7} className="px-6 py-6">
                                    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                                      <DesktopOrderDetail
                                        detail={expandedDetail}
                                        date={orderDate}
                                        deliveryNumbers={deliveryNumbers}
                                        products={products}
                                        searchTerm={searchTerm}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
