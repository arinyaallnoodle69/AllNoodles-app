import { Fragment } from "react";
import { ClipboardList, Clock3, Package2, Search } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { DesktopOrderDetail } from "@/components/orders/desktop-order-detail";
import { IncomingOrderOpenCard } from "@/components/orders/incoming-order-open-card";
import { IncomingOrderToggleButton } from "@/components/orders/incoming-order-toggle-button";
import { PendingLineOrdersSection } from "@/components/orders/pending-line-orders-section";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeOrderDate, getTodayInBangkok } from "@/lib/orders/date";
import { getCustomerOrderCountsByDate, getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getPendingLineOrders } from "@/lib/orders/line-pending";
import { getCustomersForOrder, getProductsForOrder } from "@/lib/orders/manage";

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
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
    hour12: false,
  }).format(date);
  return `${d}/${m}/${parseInt(y, 10) + 543} ${time}`;
}

const STATUS_MAP = {
  cancelled: { cls: "border-rose-200 bg-rose-50 text-rose-700", label: "ยกเลิก" },
  confirmed: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "ยืนยันแล้ว" },
  draft: { cls: "border-slate-200 bg-slate-100 text-slate-700", label: "ฉบับร่าง" },
  submitted: { cls: "border-sky-200 bg-sky-50 text-sky-700", label: "รับออเดอร์แล้ว" },
};

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
    pendingLineOrders,
    customerOrderCountsToday,
  ] = await Promise.all([
    getIncomingOrders(session.organizationId, { orderDate, searchTerm }),
    expandedOrderId ? getOrderDetailById(expandedOrderId) : Promise.resolve(null),
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
    getPendingLineOrders(session.organizationId, { orderDate, searchTerm }),
    getCustomerOrderCountsByDate(session.organizationId, orderDate),
  ]);

  function buildExpandedHref(nextExpandedId: string | null) {
    const p = new URLSearchParams();
    p.set("date", orderDate);
    if (searchTerm) p.set("q", searchTerm);
    if (nextExpandedId) p.set("expanded", nextExpandedId);
    return `/orders/incoming?${p.toString()}`;
  }

  return (
    <SettingsShell title="คำสั่งซื้อ" description="" floatingSubmit={false}>
      <div className="space-y-6">
        <section className="rounded-[1.8rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
          <form className="hidden md:flex md:flex-row md:items-center md:gap-3">
            <ThaiDatePicker
              id="incoming-orders-date"
              name="date"
              defaultValue={orderDate}
              placeholder="เลือกวันที่"
            />
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาจากเลขออเดอร์ ชื่อร้าน หรือช่องทาง"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:bg-white"
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002244]"
            >
              ค้นหา
            </button>
            <div className="ml-1">
              <CreateOrderModal
                customerOrderCountsToday={customerOrderCountsToday}
                customers={customers}
                products={products}
                today={getTodayInBangkok()}
              />
            </div>
          </form>

          <div className="flex justify-end md:hidden">
            <CreateOrderModal
              customerOrderCountsToday={customerOrderCountsToday}
              customers={customers}
              products={products}
              today={getTodayInBangkok()}
            />
          </div>
        </section>

        <MobileSearchDrawer title="ค้นหาออเดอร์">
          <form action="/orders/incoming" method="get" className="flex flex-col gap-3">
            <ThaiDatePicker
              id="m-incoming-date"
              name="date"
              defaultValue={orderDate}
              placeholder="เลือกวันที่"
            />
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาจากเลขออเดอร์ ชื่อร้าน หรือช่องทาง"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-base text-slate-900 outline-none transition focus:border-[#003366] focus:bg-white"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-[#003366] py-3.5 text-base font-semibold text-white transition hover:bg-[#002244]"
            >
              ค้นหา
            </button>
          </form>
        </MobileSearchDrawer>

        <PendingLineOrdersSection
          customers={customers}
          pendingOrders={pendingLineOrders}
        />

        <section className="rounded-[1.9rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-lg font-semibold text-slate-950">รายการออเดอร์เข้า</h2>
              {orders.length > 0 ? (
                <span className="ml-auto inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {orders.length} รายการ
                </span>
              ) : null}
            </div>
          </div>

          {orders.length > 0 ? (
            <>
              <div className="divide-y divide-slate-300 md:hidden">
                {orders.map((order) => {
                  const { cls, label } = STATUS_MAP[order.status];
                  return (
                    <IncomingOrderOpenCard
                      key={order.id}
                      href={buildExpandedHref(order.id)}
                      orderNumber={order.orderNumber}
                      customerName={order.customerName}
                      customerCode={order.customerCode}
                      channelLabel={order.channelLabel}
                      createdAtText={formatDateTime(order.createdAt)}
                      totalAmountText={`${formatCurrency(order.totalAmount)} ฿`}
                      statusClassName={cls}
                      statusLabel={label}
                    />
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto px-6 py-6 md:block">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-4 text-sm font-semibold text-slate-500">เลขออเดอร์</th>
                      <th className="px-4 py-4 text-sm font-semibold text-slate-500">ร้านค้า</th>
                      <th className="px-4 py-4 text-sm font-semibold text-slate-500">ช่องทาง</th>
                      <th className="px-4 py-4 text-sm font-semibold text-slate-500">เวลา</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold text-slate-500">รายการสินค้า</th>
                      <th className="px-4 py-4 text-sm font-semibold text-slate-500">สถานะ</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold text-slate-500">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((order) => {
                      const { cls, label } = STATUS_MAP[order.status];
                      const isExpanded = expandedOrderId === order.id;
                      return (
                        <Fragment key={order.id}>
                          <tr className="align-middle">
                            <td className="px-4 py-4">
                              <IncomingOrderToggleButton
                                href={buildExpandedHref(isExpanded ? null : order.id)}
                                expanded={isExpanded}
                                orderNumber={order.orderNumber}
                              />
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-medium text-slate-950">
                                {order.customerCode} {order.customerName}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{order.channelLabel}</td>
                            <td className="px-4 py-4 text-slate-700">
                              <span className="inline-flex items-center gap-2">
                                <Clock3 className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
                                {formatDateTime(order.createdAt)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              {order.productCount > 0 ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                  <Package2 className="h-3 w-3" strokeWidth={2.4} />
                                  {order.productCount} รายการ
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
                                {label}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-semibold text-slate-950">
                              {formatCurrency(order.totalAmount)} บาท
                            </td>
                          </tr>

                          {isExpanded && expandedDetail ? (
                            <tr>
                              <td colSpan={7} className="bg-slate-50 px-4 py-5">
                                <DesktopOrderDetail
                                  detail={expandedDetail}
                                  date={orderDate}
                                  searchTerm={searchTerm}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-slate-950">ยังไม่มีออเดอร์เข้าในวันที่เลือก</p>
              <p className="mt-2 text-sm text-slate-500">
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
          searchTerm={searchTerm}
        />
      ) : null}
    </SettingsShell>
  );
}
