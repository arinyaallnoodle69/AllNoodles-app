import Link from "next/link";
import { ChevronDown, ChevronRight, Clock3, Layers3 } from "lucide-react";
import { FactoryOrderAdjustmentManager, type FactoryAdjustmentProduct } from "@/components/orders/factory-order-adjustment-manager";
import { IncomingOrderDateFilter } from "@/components/orders/incoming-order-date-filter";

export type FreshReserveRow = FactoryAdjustmentProduct & {
  available: number;
  isConfigured: boolean;
  overCapacity: number;
  percent: number;
  used: number;
};

export type FreshReserveActivity = {
  customerName: string;
  quantity: number;
  sku: string;
  time: string;
};

type Props = {
  activities: FreshReserveActivity[];
  date: string;
  dateLabel: string;
  lastUpdatedLabel: string;
  rows: FreshReserveRow[];
};

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function ReserveRow({ row, mobile = false }: { row: FreshReserveRow; mobile?: boolean }) {
  const status = !row.isConfigured ? "ยังไม่ตั้งยอด" : row.overCapacity > 0 ? `เกิน ${formatQuantity(row.overCapacity)} กก.` : "ปกติ";
  const statusClass = row.isConfigured && row.overCapacity === 0
    ? "bg-emerald-50 text-emerald-700"
    : row.overCapacity > 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";

  if (mobile) {
    return (
      <article className="border-b border-[#E6E9F1] bg-white px-4 py-4 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-black leading-none text-[#14125F]">{row.sku}</h2>
              <ChevronRight className="h-4 w-4 text-[#161472]" strokeWidth={2.5} />
            </div>
            <p className="mt-1 truncate text-[13px] font-medium text-[#33365E]">{row.name}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>
            <span className="h-2 w-2 rounded-full bg-current" />{status}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#202354]">ตั้งต้น {formatQuantity(row.reserveQuantity)} · ใช้ไป {formatQuantity(row.used)}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#E4E7EF]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4220B8] to-[#7839DE]" style={{ width: `${row.percent}%` }} />
            </div>
            <p className="mt-1.5 text-[12px] font-medium text-[#4E5480]">เหลือ {formatQuantity(row.available)} จาก {formatQuantity(row.reserveQuantity)} กก. ({Math.round(row.percent)}%)</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[24px] font-black leading-none tabular-nums text-[#4320D0]">{formatQuantity(row.available)} กก.</p>
            <p className="mt-1 text-[13px] font-medium text-[#555B80]">สั่งได้อีก</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="grid min-h-[122px] grid-cols-[1.05fr_1.3fr_0.68fr_0.7fr] items-center gap-6 border-b border-[#E6E9F1] px-6 py-5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-black text-[#12105C]">{row.sku}</h2>
            <p className="mt-0.5 truncate text-sm font-medium text-[#34375E]">{row.name}</p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 text-[#17147B]" strokeWidth={2.4} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#202354]">ตั้งต้น {formatQuantity(row.reserveQuantity)} · ใช้ไป {formatQuantity(row.used)}</p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#E1E5EE]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#4220B8] to-[#7839DE]" style={{ width: `${row.percent}%` }} />
        </div>
        <p className="mt-2 text-xs font-medium text-[#4E5480]">เหลือ {formatQuantity(row.available)} จาก {formatQuantity(row.reserveQuantity)} กก. ({Math.round(row.percent)}%)</p>
      </div>
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold ${statusClass}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-current" />{status}
        </span>
      </div>
      <div className="text-right">
        <p className="text-2xl font-black tabular-nums text-[#4320D0]">{formatQuantity(row.available)} กก.</p>
        <p className="mt-0.5 text-sm font-medium text-[#555B80]">สั่งได้อีก</p>
      </div>
    </article>
  );
}

function ActivityList({ activities, dateLabel }: { activities: FreshReserveActivity[]; dateLabel: string }) {
  return (
    <div>
      <p className="rounded-md bg-[#F3F5FA] px-2 py-1.5 text-sm font-bold text-[#202354]">{dateLabel}</p>
      {activities.length ? activities.map((activity, index) => (
        <div key={`${activity.time}-${activity.sku}-${index}`} className="grid grid-cols-[48px_12px_1fr] gap-2 py-3 text-sm">
          <span className="font-medium text-[#50577A]">{activity.time}</span>
          <span className="relative mt-1.5 h-3 w-3 rounded-full bg-[#6D28D9] ring-4 ring-[#EEE7FF] after:absolute after:left-1/2 after:top-3 after:h-[calc(100%+36px)] after:w-px after:-translate-x-1/2 after:bg-[#D8DDEF] last:after:hidden" />
          <div className="min-w-0">
            <p className="truncate font-bold text-[#15183E]">{activity.customerName}</p>
            <p className="mt-0.5 text-[#4A5072]">สั่ง {activity.sku} เพิ่ม {formatQuantity(activity.quantity)} กก.</p>
          </div>
        </div>
      )) : <p className="py-5 text-center text-sm font-medium text-[#667085]">ยังไม่มีออเดอร์หลังตั้งยอดสำรอง</p>}
    </div>
  );
}

export function FreshReserveDashboard({ activities, date, dateLabel, lastUpdatedLabel, rows }: Props) {
  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
  const adjustmentProducts = rows.map((row) => ({
    adjustedQuantity: row.adjustedQuantity,
    name: row.name,
    orderDemand: row.orderDemand,
    productId: row.productId,
    remainingQuantity: row.remainingQuantity,
    reserveQuantity: row.reserveQuantity,
    sku: row.sku,
  }));

  return (
    <div className="min-h-[calc(100dvh-4.5rem)] bg-[#F7F8FC] text-[#12143C] lg:min-h-[calc(100dvh-5rem)]">
      <header className="border-b border-[#E1E5EE] bg-white px-4 py-4 lg:px-6 lg:py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-[26px] font-black tracking-tight text-[#13115D] lg:text-3xl">สำรองผลิตสดวันนี้</h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-[190px] [&_button]:h-12 [&_button]:rounded-lg [&_button]:border-[#D7DDEA] [&_button]:bg-white [&_button]:text-[#202354] [&_button]:shadow-sm">
              <IncomingOrderDateFilter id="reserve-date" name="date" defaultValue={date} targetPath="/orders/fresh-reserve" />
            </div>
            <div className="hidden h-7 w-px bg-[#D7DDEA] lg:block" />
            <div className="hidden items-center gap-2 text-sm font-semibold text-[#252958] lg:flex"><Layers3 className="h-5 w-5" /><span>รับเพิ่มได้</span><strong className="text-lg text-[#4720D1]">{formatQuantity(totalAvailable)} กก.</strong></div>
            <div className="hidden h-7 w-px bg-[#D7DDEA] lg:block" />
            <div className="hidden items-center gap-2 text-sm font-semibold text-[#4B5073] lg:flex"><Clock3 className="h-5 w-5 text-[#17146F]" />อัปเดตล่าสุด <strong className="text-[#17143F]">{lastUpdatedLabel}</strong></div>
            <div className="[&_button]:h-12 [&_button]:rounded-lg [&_button]:px-5 lg:[&_button]:w-auto">
              <FactoryOrderAdjustmentManager date={date} dateLabel={dateLabel} products={adjustmentProducts} variant="toolbar" />
            </div>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 bg-white">
          <section className="grid grid-cols-2 gap-3 bg-gradient-to-r from-[#F7EFFF] to-[#F1EBFF] px-4 py-3 lg:hidden">
            <div className="flex items-center gap-3 border-r border-[#D8CEEC] pr-3"><Layers3 className="h-6 w-6 text-[#3C1CA9]" /><div><p className="text-xs font-bold text-[#4A4380]">รับเพิ่มได้</p><p className="text-xl font-black text-[#4820CC]">{formatQuantity(totalAvailable)} กก.</p></div></div>
            <div className="flex items-center justify-center gap-3"><Clock3 className="h-6 w-6 text-[#17146F]" /><div><p className="text-xs font-bold text-[#4A4380]">อัปเดตล่าสุด</p><p className="text-base font-black text-[#17143F]">{lastUpdatedLabel}</p></div></div>
          </section>

          <div className="hidden grid-cols-[1.05fr_1.3fr_0.68fr_0.7fr] gap-6 border-b border-[#E3E6EE] bg-[#FAFBFD] px-6 py-4 text-sm font-black text-[#191B49] lg:grid">
            <span>สินค้า</span><span>สถานะสำรอง</span><span className="text-center">สถานะ</span><span className="text-right">สั่งได้อีก</span>
          </div>
          <div className="hidden lg:block">{rows.map((row) => <ReserveRow key={row.productId} row={row} />)}</div>
          <div className="lg:hidden">{rows.map((row) => <ReserveRow key={row.productId} row={row} mobile />)}</div>
          {!rows.some((row) => row.isConfigured) ? (
            <div className="m-4 rounded-xl border border-dashed border-[#CFC7E2] bg-[#FAF8FF] p-4 text-center text-sm font-semibold text-[#4A4380]">ยังไม่ได้ตั้งยอดสำรองของวันที่เลือก กด “ปรับยอดสั่งผลิต” เพื่อเริ่มต้น</div>
          ) : null}
        </main>

        <aside className="hidden min-h-[calc(100dvh-9rem)] border-l border-[#E1E5EE] bg-white p-5 lg:block">
          <div className="flex items-center justify-between"><h2 className="text-lg font-black text-[#17145B]">รายการล่าสุด</h2><Link href={`/orders/incoming?date=${date}`} className="inline-flex items-center gap-1 text-sm font-bold text-[#4B20C4]">ดูทั้งหมด <ChevronRight className="h-4 w-4" /></Link></div>
          <div className="mt-5"><ActivityList activities={activities} dateLabel={dateLabel} /></div>
        </aside>
      </div>

      <details className="mx-3 mt-3 overflow-hidden rounded-xl border border-[#E0E4ED] bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-base font-black text-[#17145B]">รายการล่าสุด <ChevronDown className="h-5 w-5" /></summary>
        <div className="border-t border-[#E6E9F1] px-4 pb-2"><ActivityList activities={activities} dateLabel={dateLabel} /></div>
      </details>
    </div>
  );
}
