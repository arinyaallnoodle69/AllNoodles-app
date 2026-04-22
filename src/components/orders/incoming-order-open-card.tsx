"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2 } from "lucide-react";

type IncomingOrderOpenCardProps = {
  href: string;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  channelLabel: string;
  createdAtText: string;
  totalAmountText: string;
  statusClassName: string;
  statusLabel: string;
};

export function IncomingOrderOpenCard({
  href,
  orderNumber,
  customerName,
  customerCode,
  channelLabel,
  createdAtText,
  totalAmountText,
  statusClassName,
  statusLabel,
}: IncomingOrderOpenCardProps) {
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
      className="block w-full px-4 py-4 text-left transition active:bg-slate-50 disabled:opacity-90"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-slate-950">{orderNumber}</span>
        <div className="flex items-center gap-2">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#003366]" strokeWidth={2.2} />
          ) : null}
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassName}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <p className="mt-1.5 font-medium text-slate-700">
        {customerName}
        <span className="ml-1.5 text-xs text-slate-400">({customerCode})</span>
      </p>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} />
          {channelLabel} · {createdAtText}
        </span>
        <span className="shrink-0 font-semibold text-slate-950">{totalAmountText}</span>
      </div>

      <p className="mt-2 text-right text-xs font-medium text-[#003366]">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
            กำลังเปิดรายละเอียด...
          </span>
        ) : (
          "กดเพื่อดูรายละเอียด →"
        )}
      </p>
    </button>
  );
}
