"use client";

import { useEffect, useRef, useState } from "react";

export function PackingListPrintButton({
  unassignedStores = [],
}: {
  unassignedStores?: string[];
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const fallbackTimerRef = useRef<number | null>(null);

  function handleClick() {
    if (isPrinting) return;

    if (unassignedStores.length > 0) {
      const storeList = unassignedStores.map((s) => `  • ${s}`).join("\n");
      const confirmed = window.confirm(
        `⚠️ ร้านค้าต่อไปนี้ยังไม่ได้ผูกกับรถ (${unassignedStores.length} ร้าน)\n\n${storeList}\n\nต้องการพิมพ์ต่อไหม?`
      );
      if (!confirmed) return;
    }

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
    fallbackTimerRef.current = window.setTimeout(done, 1000);
    window.print();
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPrinting}
      style={{
        background: "#1e3a5f",
        color: "white",
        border: "none",
        padding: "6px 16px",
        borderRadius: "8px",
        cursor: isPrinting ? "not-allowed" : "pointer",
        opacity: isPrinting ? 0.7 : 1,
        fontWeight: 700,
        fontSize: "13px",
        fontFamily: "Sarabun, sans-serif",
      }}
    >
      {isPrinting ? "กำลังพิมพ์..." : "พิมพ์"}
    </button>
  );
}

export function AutoPrint() {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const timer = setTimeout(() => {
      window.print();
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
