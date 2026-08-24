"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

export function PrintDailyDeliveryButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);

  function handlePrint() {
    if (loading) return;
    setLoading(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = `/delivery/print?date=${date}`;
    document.body.appendChild(iframe);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setLoading(false);
    };
    const safetyTimer = window.setTimeout(finish, 15000);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        window.clearTimeout(safetyTimer);
        finish();
        return;
      }
      win.addEventListener("afterprint", () => {
        window.clearTimeout(safetyTimer);
        finish();
      });
      setTimeout(() => win.print(), 300);
    };
    iframe.onerror = () => {
      window.clearTimeout(safetyTimer);
      finish();
    };
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 print:hidden"
    >
      <Printer className="h-4 w-4" strokeWidth={2.2} />
      {loading ? "กำลังโหลด..." : "พิมพ์บิลส่งของทุกร้านค้า"}
    </button>
  );
}
