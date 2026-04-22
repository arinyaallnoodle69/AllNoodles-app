"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type IncomingOrderToggleButtonProps = {
  href: string;
  expanded: boolean;
  orderNumber: string;
};

export function IncomingOrderToggleButton({
  href,
  expanded,
  orderNumber,
}: IncomingOrderToggleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      disabled={isPending}
      aria-busy={isPending}
      className="inline-flex items-center gap-2 font-semibold text-slate-950 transition hover:text-[#003366] disabled:opacity-85"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
      ) : expanded ? (
        <ChevronUp className="h-4 w-4" strokeWidth={2.2} />
      ) : (
        <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
      )}
      {orderNumber}
    </button>
  );
}
