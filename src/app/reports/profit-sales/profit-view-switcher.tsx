"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ProfitView = "daily" | "monthly";

export function ProfitViewSwitcher({
  fromDate,
  toDate,
  view,
  warehouseId,
}: {
  fromDate: string;
  toDate: string;
  view: ProfitView;
  warehouseId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeView(nextView: ProfitView) {
    if (nextView === view || isPending) return;

    const params = new URLSearchParams({
      from: fromDate,
      to: toDate,
      view: nextView,
    });
    if (warehouseId) {
      params.set("warehouse", warehouseId);
    }

    startTransition(() => {
      router.push(`/reports/profit-sales?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="relative flex w-full border-y border-[#8E24AA] bg-white text-base font-bold shadow-sm sm:w-auto sm:overflow-hidden sm:rounded-md sm:border sm:text-xs">
      {isPending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-[#8E24AA] backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.4} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => changeView("daily")}
        disabled={isPending}
        className={`flex min-h-11 flex-1 items-center justify-center px-4 py-2.5 text-center transition sm:min-h-0 sm:flex-initial sm:py-2 ${
          view === "daily" ? "bg-[#8E24AA] text-white" : "text-[#8E24AA] hover:bg-slate-50"
        }`}
      >
        รายวัน
      </button>
      <button
        type="button"
        onClick={() => changeView("monthly")}
        disabled={isPending}
        className={`flex min-h-11 flex-1 items-center justify-center border-l border-[#8E24AA] px-4 py-2.5 text-center transition sm:min-h-0 sm:flex-initial sm:py-2 ${
          view === "monthly" ? "bg-[#8E24AA] text-white" : "text-[#8E24AA] hover:bg-slate-50"
        }`}
      >
        รายเดือน
      </button>
    </div>
  );
}
