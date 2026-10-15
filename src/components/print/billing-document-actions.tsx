"use client";

import { useState, type RefObject } from "react";
import { FileText, Loader2, Printer } from "lucide-react";
import { DeliveryPdfPreviewModal } from "./delivery-pdf-preview-modal";
import { exportBillingDocument } from "./billing-document-export";
import type { PackingListPdfPreview } from "./share-packing-list-pdf";

export function BillingDocumentActions({ rootRef, fileName, disabled = false }: {
  rootRef: RefObject<HTMLDivElement | null>;
  fileName: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<"print" | "pdf" | null>(null);
  const [preview, setPreview] = useState<PackingListPdfPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(mode: "print" | "pdf") {
    if (busy || disabled || !rootRef.current) return;
    setBusy(mode);
    setError(null);
    try {
      const result = await exportBillingDocument(rootRef.current, mode, fileName);
      if (result) setPreview(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "ส่งออกใบวางบิลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }
  return <>
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-white/10 bg-[#12151c] px-4 py-3 sm:px-8">
      <button type="button" disabled={disabled || !!busy} onClick={() => run("print")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:flex-none">
        {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}พิมพ์ใบวางบิล
      </button>
      <button type="button" disabled={disabled || !!busy} onClick={() => run("pdf")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#4A148C] disabled:opacity-50 sm:flex-none">
        {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-rose-600" />}{busy === "pdf" ? "กำลังสร้าง PDF…" : "ส่งออก PDF"}
      </button>
      {error ? <p role="alert" className="w-full text-sm text-rose-300">{error}</p> : null}
    </div>
    {preview ? <DeliveryPdfPreviewModal file={preview.file} previewImages={preview.previewImages} title="ตัวอย่าง PDF ใบวางบิล" onClose={() => setPreview(null)} /> : null}
  </>;
}
