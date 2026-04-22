"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";

type OrderDailyMobileCardProps = {
  href: string;
  isExpanded: boolean;
  customerName: string;
  customerCode: string;
  orderRounds: number;
  shortageProductCount: number;
  totalAmountText: string;
};

export function OrderDailyMobileCard({
  href,
  customerName,
  customerCode,
  orderRounds,
  shortageProductCount,
  totalAmountText,
}: OrderDailyMobileCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function openDetail() {
    if (isPending) return;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={openDetail}
      disabled={isPending}
      aria-busy={isPending}
      className="group relative block w-full bg-white p-4 transition active:bg-slate-50 disabled:opacity-90"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-[#003366] bg-[#003366]/10 px-1.5 py-0.5 rounded">
              {customerCode}
            </span>
            <h3 className="truncate text-base font-bold text-slate-900 group-active:text-[#003366] transition-colors">
              {customerName}
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              {orderRounds} รอบออเดอร์
            </span>
            {shortageProductCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                  <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                  สินค้าขาด {shortageProductCount} รายการ
                </span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-black tracking-tight text-slate-950">
            {totalAmountText}
            <span className="ml-0.5 text-xs font-bold text-slate-400">฿</span>
          </p>
          <div className="mt-2 flex justify-end">
            {isPending ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#003366]/5 px-3 py-1 text-[11px] font-bold text-[#003366]">
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                กำลังโหลด...
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 group-hover:bg-[#003366]/10 group-hover:text-[#003366] transition-all">
                กดเพื่อดูรายละเอียด
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
