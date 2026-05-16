"use client";

import { LayoutList } from "lucide-react";
import { useState } from "react";

export function PrintPackingListButton({ date, endDate }: { date: string; endDate?: string }) {
  const [loading, setLoading] = useState(false);

  function handlePrint() {
    if (loading) return;

    setLoading(true);
    const printUrl = `/orders/packing-list?date=${date}${endDate ? `&endDate=${endDate}` : ""}&autoprint=1`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = printUrl;
    document.body.appendChild(iframe);

    const done = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setLoading(false);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        done();
        return;
      }
      win.addEventListener("afterprint", done, { once: true });
    };
    iframe.onerror = done;
    setTimeout(done, 120000);
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#003366]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#003366] shadow-sm transition hover:bg-[#003366]/5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 print:hidden md:gap-2 md:px-6 md:py-2.5 md:text-sm"
    >
      <LayoutList className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
      {loading ? "กำลังโหลด..." : "พิมพ์ใบจัดของ"}
    </button>
  );
}
