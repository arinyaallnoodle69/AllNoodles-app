"use client";

import { Printer } from "lucide-react";
import { useRef, useState } from "react";

export function PrintButton() {
  const [isPrinting, setIsPrinting] = useState(false);
  const fallbackTimerRef = useRef<number | null>(null);

  function handlePrint() {
    if (isPrinting) return;

    setIsPrinting(true);
    const done = () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsPrinting(false);
      window.removeEventListener("afterprint", done);
    };

    window.addEventListener("afterprint", done, { once: true });
    fallbackTimerRef.current = window.setTimeout(done, 10000);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={isPrinting}
      className="flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-slate-500 transition hover:bg-slate-100 print:hidden"
      aria-label="พิมพ์รายงาน"
    >
      <Printer className="h-5 w-5 shrink-0" strokeWidth={2} />
      <span className="hidden text-sm font-semibold sm:inline">{isPrinting ? "กำลังพิมพ์..." : "พิมพ์"}</span>
    </button>
  );
}
