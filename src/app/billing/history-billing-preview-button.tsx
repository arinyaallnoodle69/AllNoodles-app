"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import type { BillingRecord } from "@/lib/billing/billing-statement";
import { BillingDocumentActions } from "@/components/print/billing-document-actions";
import { BILLING_INVOICE_STYLES, BillingInvoicePage, buildBillingInvoicePages } from "@/components/print/billing-statement-layout";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";

export function HistoryBillingPreviewButton({ history }: { history: BillingRecord[] }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const root = rootRef.current;
    const resize = () => setScale(Math.min(1, Math.max(1, root.clientWidth - 32) / (210 * 96 / 25.4)));
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => {
      observer.disconnect();
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  const pages = useMemo(() => history.flatMap(record => buildBillingInvoicePages({
    customer: { id: record.customer_id, code: record.customer_code, name: record.customer_name, address: null, phone: null },
    organization: { name: PRINT_ORGANIZATION_NAME, address: "-", phone: "-" },
    billingDate: record.created_at || record.billing_date,
    fromDate: record.from_date,
    toDate: record.to_date,
    billingNumber: record.billing_number,
    isLocked: true,
    grandTotal: record.total_amount,
    rows: record.snapshot_rows,
  })).map((page, index) => ({ ...page, key: `history-${index}` })), [history]);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4A148C] px-4 py-2 text-sm font-bold text-white"><FileText className="h-4 w-4" />ดูบิลทั้งหมด ({history.length} ใบ)</button>
    {open ? createPortal(<div role="dialog" aria-modal="true" aria-label="ใบวางบิลทั้งหมดจากประวัติ" className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10]">
      <style dangerouslySetInnerHTML={{ __html: BILLING_INVOICE_STYLES }} />
      <header className="flex shrink-0 items-center justify-between gap-3 bg-[#12151c] px-4 py-3 text-white"><h2 className="font-bold">ใบวางบิลจากประวัติ · {history.length} ใบ · {pages.length} หน้า</h2><button type="button" aria-label="ปิด" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10"><X /></button></header>
      <BillingDocumentActions rootRef={rootRef} fileName="ใบวางบิลจากประวัติทั้งหมด" />
      <div ref={rootRef} className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-fit flex-col gap-6">{pages.map(page => <div key={page.key} style={{ width: `${210 * scale}mm`, height: `${297 * scale}mm`, overflow: "hidden" }}><div style={{ width: "210mm", transform: `scale(${scale})`, transformOrigin: "top left" }}><BillingInvoicePage page={page} /></div></div>)}</div>
      </div>
    </div>, document.body) : null}
  </>;
}
