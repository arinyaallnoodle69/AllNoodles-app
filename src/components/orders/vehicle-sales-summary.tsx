import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

export type VehicleSalesSummaryItem = {
  href: string;
  id: string;
  name: string;
  orderCount: number;
  salesAmount: number;
  storeCount: number;
  weightGrams: number;
};

type VehicleSalesSummaryProps = {
  allVehiclesHref: string;
  dateLabel: string;
  display?: "all" | "desktop" | "mobile";
  items: VehicleSalesSummaryItem[];
  selectedVehicleId: string;
  totalAmount: number;
  totalOrderCount: number;
  totalWeightGrams: number;
};

function formatAmount(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWeight(value: number) {
  return (value / 1000).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function SalesBagIcon({ mobile = false }: { mobile?: boolean }) {
  const size = mobile ? 36 : 48;

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#EC4899] text-white shadow-[0_5px_14px_rgba(236,72,153,0.24)]"
      style={{ width: size, height: size, minWidth: size }}
    >
      <svg
        aria-hidden="true"
        width={mobile ? 18 : 24}
        height={mobile ? 18 : 24}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <path d="M6.5 8.25H17.5L19 20H5L6.5 8.25Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 9V6.75C9 5.23 10.34 4 12 4C13.66 4 15 5.23 15 6.75V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 12.25C9.75 13 10.75 13.4 12 13.4C13.25 13.4 14.25 13 15 12.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function VehicleSalesSummary({
  allVehiclesHref,
  display = "all",
  items,
  selectedVehicleId,
  totalAmount,
  totalOrderCount,
  totalWeightGrams,
}: VehicleSalesSummaryProps) {
  if (items.length === 0) return null;

  const totalStoreCount = items.reduce((sum, item) => sum + item.storeCount, 0);

  return (
    <section aria-label="สรุปยอดขายรายวันแยกตามรถ" className="-mx-1 lg:mx-0 lg:px-0">
      {display !== "mobile" ? (
      <div className="hidden h-[116px] overflow-hidden rounded-xl border border-[#4A148C]/40 bg-white shadow-[0_4px_14px_rgba(74,20,140,0.06)] lg:flex">
        <Link
          href={allVehiclesHref}
          scroll={false}
          className={`flex w-[290px] shrink-0 items-center gap-3.5 border-r border-slate-200 px-5 py-3 text-left transition-colors hover:bg-[#FFF7FC] ${selectedVehicleId === "__all__" ? "bg-[#FFF7FC]" : "bg-white"}`}
        >
          <SalesBagIcon />
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight text-slate-700">ยอดขายวันนี้</span>
            <strong className="mt-1.5 block whitespace-nowrap text-[26px] font-black leading-none tabular-nums text-[#EC4899]">฿{formatAmount(totalAmount)}</strong>
            <span className="mt-2 block whitespace-nowrap text-[13px] font-black leading-none text-[#4A148C]">
              น้ำหนัก {formatWeight(totalWeightGrams)} กก.
            </span>
            <span className="mt-2 block whitespace-nowrap text-xs font-semibold leading-none text-slate-500">
              {totalStoreCount.toLocaleString("th-TH")} ร้าน · {totalOrderCount.toLocaleString("th-TH")} ออเดอร์
            </span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
          {items.map((item) => {
            const active = selectedVehicleId === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                scroll={false}
                className={`flex min-w-[165px] flex-1 flex-col items-center justify-center border-r border-slate-200 px-3.5 py-3 text-center transition-colors hover:bg-[#FFF7FC] ${active ? "bg-[#FFF1F8]" : "bg-white"}`}
              >
                <span className={`max-w-full truncate text-[15px] font-bold ${active ? "text-[#9D174D]" : "text-slate-600"}`}>{item.name}</span>
                <strong className="mt-2.5 whitespace-nowrap text-[19px] font-black leading-none tabular-nums text-slate-900">฿{formatAmount(item.salesAmount)}</strong>
                <span className="mt-2 whitespace-nowrap text-[19px] font-bold leading-none text-[#4A148C]">
                  น้ำหนัก {formatWeight(item.weightGrams)} กก.
                </span>
              </Link>
            );
          })}
        </div>

        <span className="flex w-[135px] shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 text-sm font-black text-[#EC4899]">
          ดูแยกรถ
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>
      ) : null}

      {display !== "desktop" ? (
      <details className="group overflow-hidden rounded-lg border border-[#EC4899]/55 bg-white shadow-[0_2px_8px_rgba(74,20,140,0.04)] lg:hidden">
        <summary className="flex h-[78px] cursor-pointer list-none items-center gap-2.5 px-3 py-2 text-left marker:hidden [&::-webkit-details-marker]:hidden">
          <SalesBagIcon mobile />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold leading-tight text-slate-600">ยอดขายวันนี้</span>
            <strong className="mt-0.5 block truncate text-base font-black leading-none tabular-nums text-[#EC4899]">฿{formatAmount(totalAmount)}</strong>
            <span className="mt-1.5 block text-[10px] font-black leading-none text-[#4A148C]">
              น้ำหนัก {formatWeight(totalWeightGrams)} กก.
            </span>
            <span className="mt-1.5 block text-[9px] font-medium leading-none text-slate-500">
              {totalStoreCount.toLocaleString("th-TH")} ร้าน · {totalOrderCount.toLocaleString("th-TH")} ออเดอร์
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-black text-[#EC4899]">
            ดูแยกรถ
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" strokeWidth={2.5} />
          </span>
        </summary>

        <div className="border-t border-[#EC4899]/25">
          {items.map((item) => (
            <Link key={item.id} href={item.href} scroll={false} className={`grid min-h-11 grid-cols-[minmax(0,1fr)_108px_82px] items-center border-b border-slate-100 px-4 py-2.5 last:border-b-0 ${selectedVehicleId === item.id ? "bg-[#FFF1F8]" : "bg-white"}`}>
              <span className={`min-w-0 truncate pr-2 text-xs font-bold ${selectedVehicleId === item.id ? "text-[#9D174D]" : "text-slate-700"}`}>{item.name}</span>
              <strong className="whitespace-nowrap text-right text-xs font-black tabular-nums text-slate-900">฿{formatAmount(item.salesAmount)}</strong>
              <span className="ml-2 whitespace-nowrap border-l border-[#EA80FC]/30 pl-2 text-right text-xs font-bold tabular-nums text-[#4A148C]">
                {formatWeight(item.weightGrams)} กก.
              </span>
            </Link>
          ))}
        </div>
      </details>
      ) : null}
    </section>
  );
}
