"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, FolderDown, Image as ImageIcon, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import html2canvas from "html2canvas";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import {
  BILLING_A4_HEIGHT_MM,
  BILLING_A4_WIDTH_MM,
  BILLING_INVOICE_STYLES,
  BillingInvoicePage,
  buildBillingInvoicePages,
  getBillingFontEmbedCSS,
} from "@/components/print/billing-statement-layout";

const CAPTURE_TIMEOUT_MS = 6000;

function isMobileLikeDevice() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isMobileUA || window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function captureElementToBlob(element: HTMLElement, fontEmbedCSS?: string): Promise<Blob> {
  const captureWidth = element.offsetWidth;
  const captureHeight = element.offsetHeight;

  try {
    const blob = await withTimeout(
      htmlToImage.toBlob(element, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        fontEmbedCSS,
        pixelRatio: 2, // 2x for sharp print quality on all screens
        width: captureWidth,
        height: captureHeight,
        style: {
          width: `${captureWidth}px`,
          height: `${captureHeight}px`,
          maxWidth: "none",
          maxHeight: "none",
          margin: "0",
          boxShadow: "none",
          transform: "none",
          transformOrigin: "top left",
        },
      }),
      CAPTURE_TIMEOUT_MS,
      "Billing image capture timeout",
    );

    if (blob) return blob;
    throw new Error("toBlob returned null");
  } catch (captureErr) {
    console.warn("html-to-image failed, falling back to html2canvas:", captureErr);
    const canvas = await html2canvas(element, {
      width: captureWidth,
      height: captureHeight,
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("html2canvas toBlob failed"));
      }, "image/png");
    });
  }
}

type DeliveryItem = {
  number: string;
  date: string;
  amount: number;
  isAlreadyBilled?: boolean;
  billingNumber?: string | null;
};

type BillingPreviewButtonProps = {
  customerName: string;
  customerCode: string;
  fromDate: string;
  toDate: string;
  deliveries: DeliveryItem[];
  totalAmount: number;
  billingNumber?: string | null;
  billingDate?: string;
  className?: string;
  children?: React.ReactNode;
};

export function BillingPreviewButton({
  customerName,
  customerCode,
  fromDate,
  toDate,
  deliveries,
  totalAmount,
  billingNumber,
  billingDate,
  className,
  children,
}: BillingPreviewButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageScale, setPageScale] = useState(1);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  const previewBodyRef = useRef<HTMLDivElement | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const existingBillingNumber = useMemo(() => {
    return billingNumber ?? (deliveries.find((d) => d.billingNumber)?.billingNumber || null);
  }, [billingNumber, deliveries]);

  const pages = useMemo(() => {
    const rows = deliveries.map((item, index) => ({
      lineNumber: index + 1,
      deliveryNumber: item.number,
      deliveryDate: item.date,
      totalAmount: item.amount,
      notes: null,
    }));

    return buildBillingInvoicePages({
      customer: {
        id: "",
        code: customerCode,
        name: customerName,
        address: null,
        phone: null,
      },
      organization: {
        name: PRINT_ORGANIZATION_NAME,
        address: "-",
        phone: "-",
      },
      billingDate: billingDate ?? today,
      fromDate,
      toDate,
      grandTotal: totalAmount,
      billingNumber: existingBillingNumber,
      isLocked: existingBillingNumber !== null,
      rows,
    });
  }, [customerCode, customerName, deliveries, fromDate, toDate, today, totalAmount, billingDate, existingBillingNumber]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !previewBodyRef.current) return;

    const updateScale = () => {
      const container = previewBodyRef.current;
      if (!container) return;

      const dummy = document.createElement("div");
      dummy.style.width = `${BILLING_A4_WIDTH_MM}mm`;
      dummy.style.position = "absolute";
      dummy.style.visibility = "hidden";
      document.body.appendChild(dummy);
      const sheetWidth = dummy.offsetWidth;
      document.body.removeChild(dummy);

      const availableWidth = container.clientWidth - 32;
      setPageScale(availableWidth > 0 && sheetWidth > availableWidth ? availableWidth / sheetWidth : 1);
    };

    const timer = setTimeout(updateScale, 100);
    window.addEventListener("resize", updateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateScale);
    };
  }, [isOpen, pages.length]);

  const hasFSPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const saveAsImage = async (mode: "folder" | "download" | "auto" = "auto") => {
    const targets = document.querySelectorAll(".billing-preview-card-element");
    if (targets.length === 0 || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSavingStatus("กำลังเตรียมตัวอักษร...");
    try {
      const fontEmbedCSS = await getBillingFontEmbedCSS();

      const captured: { blob: Blob; name: string }[] = [];

      for (let i = 0; i < targets.length; i += 1) {
        setSavingStatus(`กำลังแปลงหน้า ${i + 1}/${targets.length}...`);
        await new Promise((resolve) => setTimeout(resolve, 25));

        const target = targets[i] as HTMLElement;
        const blob = await captureElementToBlob(target, fontEmbedCSS);

        const namePrefix = existingBillingNumber
          ? `billing-${existingBillingNumber}`
          : `billing-${customerCode}-${fromDate}-to-${toDate}`;
        const fileName =
          targets.length > 1
            ? `${namePrefix}-page-${i + 1}.png`
            : `${namePrefix}.png`;

        captured.push({ blob, name: fileName });
      }

      const isMobile = isMobileLikeDevice();

      if (isMobile && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
        const files = captured.map((item) => new File([item.blob], item.name, { type: "image/png" }));
        if (navigator.canShare({ files })) {
          try {
            setSavingStatus("กำลังเปิดเมนูแชร์...");
            await navigator.share({
              files,
              title: "ใบวางบิล",
            });
            setIsOpen(false);
            return;
          } catch (error) {
            console.error("[WebShare:Billing]", error);
            if (error instanceof Error && error.name === "AbortError") return;
          }
        }
      }

      if (mode === "folder" && typeof window !== "undefined" && "showDirectoryPicker" in window) {
        try {
          const dirHandle = await (window as unknown as {
            showDirectoryPicker: (options?: { id?: string; mode?: string; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
          }).showDirectoryPicker({
            id: "allnoodles-billing",
            mode: "readwrite",
            startIn: "downloads",
          });

          for (let i = 0; i < captured.length; i += 1) {
            setSavingStatus(`กำลังบันทึกลงโฟลเดอร์ ${i + 1}/${captured.length}...`);
            const fileHandle = await dirHandle.getFileHandle(captured[i].name, { create: true });
            const writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
            await writable.write(captured[i].blob);
            await writable.close();
          }

          setSavingStatus("บันทึกเรียบร้อยแล้ว!");
          await new Promise((r) => setTimeout(r, 600));
          setIsOpen(false);
          return;
        } catch (dirErr) {
          if (dirErr instanceof Error && dirErr.name === "AbortError") return;
          console.warn("Folder picker error, falling back to download:", dirErr);
        }
      }

      for (let i = 0; i < captured.length; i += 1) {
        setSavingStatus(`กำลังดาวน์โหลด ${i + 1}/${captured.length}...`);
        downloadBlob(captured[i].blob, captured[i].name);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      setSavingStatus("ดาวน์โหลดเรียบร้อยแล้ว!");
      await new Promise((r) => setTimeout(r, 600));
      setIsOpen(false);
    } catch (error) {
      console.error("Save image error:", error);
      setErrorMessage("ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
      setSavingStatus(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-full bg-[#4A148C] px-4 py-2 text-xs font-black text-white transition hover:bg-[#4A148C]/90 active:scale-95"
        }
      >
        {children || (
          <>
            <FileText className="h-3.5 w-3.5" />
            <span>ดูใบวางบิล</span>
          </>
        )}
      </button>

      {mounted && isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-300">
              <style dangerouslySetInnerHTML={{ __html: BILLING_INVOICE_STYLES }} />
              <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#12151c]/90 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-[0_0_20px_rgba(74,20,140,0.35)] sm:h-12 sm:w-12">
                    <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black tracking-tight text-white sm:text-xl">ตัวอย่างใบวางบิล</h3>
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 sm:text-xs">
                      {customerCode} {customerName} · {pages.length} หน้า (A4 แนวตั้ง)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  {hasFSPicker && pages.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => saveAsImage("folder")}
                      disabled={isSaving}
                      className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 sm:flex"
                      title="เลือกโฟลเดอร์ในเครื่องเพื่อบันทึกไฟล์ทั้งหมด"
                    >
                      <FolderDown className="h-4.5 w-4.5" strokeWidth={2.5} />
                      <span>บันทึกลงโฟลเดอร์</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => saveAsImage("download")}
                    disabled={isSaving}
                    className="hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 disabled:opacity-60 sm:flex"
                  >
                    {isSaving ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Download className="h-4.5 w-4.5" strokeWidth={3} />}
                    <span>{isSaving ? (savingStatus ?? "กำลังบันทึก...") : pages.length > 1 ? (hasFSPicker ? "ดาวน์โหลดทีละรูป" : "บันทึกทั้งหมด") : "บันทึกรูป"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isSaving && setIsOpen(false)}
                    disabled={isSaving}
                    className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/50 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 disabled:opacity-30 sm:h-12 sm:w-12"
                    aria-label="ปิด"
                  >
                    <X className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div
                ref={previewBodyRef}
                className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(74,20,140,0.08)_0%,transparent_70%)] p-4 pb-28 sm:p-12 sm:pb-12"
              >
                <div className="mx-auto flex w-full max-w-[210mm] flex-col items-center gap-10 sm:gap-16">
                  {pages.map((page, pageIdx) => (
                    <div key={page.key} className="group relative flex w-full flex-col items-center">
                      {pages.length > 1 ? (
                        <div className="mb-3 flex items-center gap-3 self-start sm:absolute sm:-left-16 sm:mb-0 sm:flex-col sm:self-auto">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1f26] text-sm font-black text-white ring-1 ring-white/10 shadow-2xl">
                            {pageIdx + 1}
                          </span>
                          <div className="h-px w-8 bg-white/10 sm:h-12 sm:w-px" />
                        </div>
                      ) : null}

                      <div
                        className="relative overflow-hidden rounded-sm bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/5"
                        style={
                          pageScale < 1
                            ? {
                                width: `${BILLING_A4_WIDTH_MM * pageScale}mm`,
                                height: `${BILLING_A4_HEIGHT_MM * pageScale}mm`,
                                maxWidth: "100%",
                              }
                            : {
                                width: `${BILLING_A4_WIDTH_MM}mm`,
                                maxWidth: "100%",
                              }
                        }
                      >
                        <div
                          style={{
                            transform: pageScale < 1 ? `scale(${pageScale})` : undefined,
                            transformOrigin: "top left",
                            width: `${BILLING_A4_WIDTH_MM}mm`,
                          }}
                        >
                          <BillingInvoicePage
                            page={page}
                            captureClassName="billing-preview-card-element billing-invoice-page"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/5 bg-[#12151c]/90 p-4 pb-safe-offset-4 backdrop-blur-xl sm:hidden">
                <button
                  type="button"
                  onClick={() => saveAsImage("auto")}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(16,185,129,0.25)] transition active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" strokeWidth={3} />}
                  {isSaving ? (savingStatus ?? "กำลังบันทึก...") : pages.length > 1 ? "บันทึกทั้งหมด" : "บันทึกลงเครื่อง"}
                </button>
              </div>

              {errorMessage ? (
                <div className="absolute bottom-24 left-4 right-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700 sm:bottom-8">
                  {errorMessage}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
