"use client";

import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";

export function ReprintButton({ url, title = "พิมพ์อีกครั้ง" }: { url: string; title?: string }) {
  const [isPrinting, setIsPrinting] = useState(false);

  const handleReprint = () => {
    setIsPrinting(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = url + (url.includes("?") ? "&" : "?") + "autoprint=1";
    document.body.appendChild(iframe);

    const done = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setIsPrinting(false);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return done();
      win.addEventListener("afterprint", done, { once: true });
    };

    iframe.onerror = () => {
      alert("เกิดข้อผิดพลาดในการโหลดหน้าพิมพ์");
      done();
    };

    setTimeout(done, 60000);
  };

  return (
    <button
      type="button"
      onClick={handleReprint}
      disabled={isPrinting}
      className="flex h-10 w-10 items-center justify-center bg-white border border-slate-200 text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-[#003366] hover:border-[#003366] disabled:opacity-50"
      title={title}
    >
      {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-5 w-5" />}
    </button>
  );
}
