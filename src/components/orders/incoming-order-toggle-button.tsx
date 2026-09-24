"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

type IncomingOrderToggleButtonProps = {
  href: string;
  expanded: boolean;
  orderNumber: string;
  iconOnly?: boolean;
};

export function IncomingOrderToggleButton({
  href,
  expanded,
  orderNumber,
  iconOnly = false,
}: IncomingOrderToggleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEffectiveExpanded = isPending ? !expanded : expanded;

  function toggle() {
    if (isPending) return;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-busy={isPending}
      aria-label={isEffectiveExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
      title={isEffectiveExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
      className={[
        "inline-flex items-center justify-center border border-slate-200 bg-white text-slate-900 shadow-sm transition active:scale-95 hover:border-[#4A148C]/30 hover:bg-slate-50 hover:text-[#4A148C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A148C]/20",
        iconOnly ? "size-10 shrink-0 rounded-full p-0 leading-none" : "min-h-9 w-full gap-2 rounded-lg px-3 py-2 text-xs font-semibold",
      ].join(" ")}
    >
      {isEffectiveExpanded ? (
        <ChevronUp className="h-4.5 w-4.5 transition-transform" strokeWidth={2.4} />
      ) : (
        <ChevronDown className="h-4.5 w-4.5 transition-transform" strokeWidth={2.4} />
      )}
      {iconOnly ? <span className="sr-only">{orderNumber}</span> : <span className="font-mono leading-none" translate="no">{orderNumber}</span>}
    </button>
  );
}
