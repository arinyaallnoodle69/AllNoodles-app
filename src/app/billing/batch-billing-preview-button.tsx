"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FolderDown, Image as ImageIcon, Loader2, Share2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as htmlToImage from "html-to-image";
import html2canvas from "html2canvas";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import { recordBillingHistoryAction } from "@/lib/billing/actions";
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

function safeDownloadBlob(blob: Blob, fileName: string) {
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
        pixelRatio: 2,
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
  isAlreadyBilled: boolean;
  billingNumber: string | null;
};

type Candidate = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveries: DeliveryItem[];
};

type BatchBillingPreviewButtonProps = {
  organizationId: string;
  candidates: Candidate[];
  fromDate: string;
  toDate: string;
};

export function BatchBillingPreviewButton({
  organizationId,
  candidates,
  fromDate,
  toDate,
}: BatchBillingPreviewButtonProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageScale, setPageScale] = useState(1);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [readyCaptured, setReadyCaptured] = useState<{ blob: Blob; name: string }[] | null>(null);

  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Track billing numbers in local state to update UI immediately on save
  const [localBillingNumbers, setLocalBillingNumbers] = useState<Record<string, string>>({});

  // Sync candidate billing numbers when opened
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      candidates.forEach((c) => {
        const num = c.deliveries.find((d) => d.billingNumber)?.billingNumber;
        if (num) {
          initial[c.customerId] = num;
        }
      });
      setLocalBillingNumbers(initial);
    }
  }, [isOpen, candidates]);

  const pages = useMemo(() => {
    const dataList = candidates.map((c) => {
      const rows = c.deliveries.map((d, index) => ({
        lineNumber: index + 1,
        deliveryNumber: d.number,
        deliveryDate: d.date,
        totalAmount: d.amount,
        notes: null,
      }));

      const grandTotal = c.deliveries.reduce((sum, d) => sum + d.amount, 0);
      const bNum = localBillingNumbers[c.customerId] || null;

      return {
        customer: {
          id: c.customerId,
          code: c.customerCode,
          name: c.customerName,
          address: null,
          phone: null,
        },
        organization: {
          name: PRINT_ORGANIZATION_NAME,
          address: "-",
          phone: "-",
        },
        billingDate: today,
        fromDate,
        toDate,
        grandTotal,
        billingNumber: bNum,
        isLocked: bNum !== null,
        rows,
      };
    });

    return buildBillingInvoicePages(dataList);
  }, [candidates, localBillingNumbers, fromDate, toDate, today]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cleanup on modal close
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setSavingStatus(null);
      setSavingProgress(null);
      setReadyCaptured(null);
    }
  }, [isOpen]);

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

  const handleSave = async (mode: "folder" | "download" | "auto" = "auto") => {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSavingStatus("กำลังเตรียมข้อมูล...");
    setSavingProgress({ current: 0, total: pages.length, percent: 0 });

    try {
      // 1. Check if there are unbilled candidates that need to be recorded in DB
      const unbilledCandidates = candidates.filter(
        (c) => !localBillingNumbers[c.customerId]
      );

      if (unbilledCandidates.length > 0) {
        setSavingStatus(`กำลังบันทึกประวัติการวางบิล ${unbilledCandidates.length} ร้านค้า...`);
        const items = unbilledCandidates.map((c) => ({
          customerId: c.customerId,
          billingDate: today,
          fromDate,
          toDate,
          totalAmount: c.deliveries.reduce((sum, d) => sum + d.amount, 0),
          snapshotRows: c.deliveries.map((d, index) => ({
            lineNumber: index + 1,
            deliveryNumber: d.number,
            deliveryDate: d.date,
            totalAmount: d.amount,
            notes: null,
          })),
        }));

        const result = await recordBillingHistoryAction({ organizationId, items });
        if (!result.success) {
          throw new Error("ไม่สามารถบันทึกประวัติการวางบิลได้");
        }

        // Update local billing numbers map so that the pages render the numbers instantly
        const updatedNums = { ...localBillingNumbers };
        result.results.forEach((r) => {
          updatedNums[r.customerId] = r.billingNumber;
        });
        setLocalBillingNumbers(updatedNums);

        // Wait a brief moment to allow UI render cycle to update the billing numbers before capture
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 2. Prepare font CSS
      setSavingStatus("กำลังเตรียมตัวอักษร...");
      const fontEmbedCSS = await getBillingFontEmbedCSS();

      const targets = document.querySelectorAll(".batch-billing-preview-card-element");
      if (targets.length === 0) {
        throw new Error("ไม่พบพื้นที่ใบวางบิลสำหรับแปลงรูปภาพ");
      }

      // 3. Pipeline: Sequential Capture of each page
      const captured: { blob: Blob; name: string }[] = [];
      const total = targets.length;

      for (let i = 0; i < total; i += 1) {
        const element = targets[i] as HTMLElement;
        const percent = Math.round(((i + 1) / total) * 100);
        setSavingProgress({ current: i + 1, total, percent });
        setSavingStatus(`กำลังแปลงรูปภาพความคมชัดสูง ${i + 1}/${total} (${percent}%)...`);

        // Yield to browser event loop so UI updates smoothly
        await new Promise((resolve) => setTimeout(resolve, 25));

        const blob = await captureElementToBlob(element, fontEmbedCSS);
        const pageData = pages[i];
        const custCode = pageData?.customer.code ?? "unknown";
        const fileIdx = total > 1 ? `-page-${i + 1}` : "";
        const fileName = `billing-${custCode}-${fromDate}-to-${toDate}${fileIdx}.png`;

        captured.push({ blob, name: fileName });
      }

      // 4. Save to device
      const isMobile = isMobileLikeDevice();

      if (isMobile) {
        // Transition to completion screen with direct tap trigger for Web Share API
        setReadyCaptured(captured);
        setSavingStatus(null);
        return;
      }

      // Desktop Folder flow (File System Access API)
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
            const percent = Math.round(((i + 1) / captured.length) * 100);
            setSavingProgress({ current: i + 1, total: captured.length, percent });
            setSavingStatus(`กำลังบันทึกลงโฟลเดอร์ ${i + 1}/${captured.length} (${percent}%)...`);

            const fileHandle = await dirHandle.getFileHandle(captured[i].name, { create: true });
            const writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
            await writable.write(captured[i].blob);
            await writable.close();
          }

          setSavingStatus("บันทึกครบทุกรูปเรียบร้อยแล้ว!");
          await new Promise((resolve) => setTimeout(resolve, 800));
          setIsOpen(false);
          router.refresh();
          return;
        } catch (dirErr: unknown) {
          if (dirErr instanceof Error && dirErr.name === "AbortError") {
            // User cancelled folder picker
            return;
          }
          console.warn("Folder picker error, falling back to sequential download:", dirErr);
        }
      }

      // Default or fallback for desktop: Sequential download to Downloads folder
      for (let i = 0; i < captured.length; i += 1) {
        const percent = Math.round(((i + 1) / captured.length) * 100);
        setSavingProgress({ current: i + 1, total: captured.length, percent });
        setSavingStatus(`กำลังดาวน์โหลดรูปที่ ${i + 1}/${captured.length} (${percent}%)...`);
        safeDownloadBlob(captured[i].blob, captured[i].name);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      setSavingStatus("ดาวน์โหลดครบทุกรูปเรียบร้อยแล้ว!");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Save all images error:", error);
      setErrorMessage("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
    } finally {
      if (!isMobileLikeDevice()) {
        setIsSaving(false);
        setSavingStatus(null);
        setSavingProgress(null);
      }
    }
  };

  const handleMobileSaveTrigger = async () => {
    if (!readyCaptured || readyCaptured.length === 0) return;

    try {
      const files = readyCaptured.map((item) => new File([item.blob], item.name, { type: "image/png" }));

      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: "ใบวางบิลทั้งหมด",
          });
          setReadyCaptured(null);
          setIsSaving(false);
          setIsOpen(false);
          router.refresh();
          return;
        } catch (shareErr: unknown) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            // User cancelled share sheet, keep readyCaptured so they can tap again
            return;
          }
          console.warn("[WebShare] share error, falling back to safe download:", shareErr);
        }
      }

      // Safe fallback download without navigating the page
      for (let i = 0; i < readyCaptured.length; i += 1) {
        safeDownloadBlob(readyCaptured[i].blob, readyCaptured[i].name);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      setReadyCaptured(null);
      setIsSaving(false);
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Mobile save trigger error:", err);
      setErrorMessage("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={candidates.length === 0}
        className="group relative flex h-11 sm:h-12 min-w-[120px] sm:w-[240px] items-center justify-center gap-2 bg-[#4A148C] px-4 sm:px-6 text-sm sm:text-base font-black tracking-wide text-white transition-all hover:bg-[#4A148C]/90 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none rounded-xl sm:rounded-none"
      >
        <ImageIcon className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:-translate-y-0.5" />
        <span>บันทึกรูปทั้งหมด</span>
      </button>

      {mounted && isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-300">
              <style dangerouslySetInnerHTML={{ __html: BILLING_INVOICE_STYLES }} />
              
              {/* Header */}
              <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#12151c]/90 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-[0_0_20px_rgba(74,20,140,0.35)] sm:h-12 sm:w-12">
                    <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black tracking-tight text-white sm:text-xl">ตัวอย่างใบวางบิลทั้งหมด</h3>
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 sm:text-xs">
                      จำนวน {candidates.length} ร้านค้า · ทั้งหมด {pages.length} หน้า
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  {hasFSPicker ? (
                    <button
                      type="button"
                      onClick={() => handleSave("folder")}
                      disabled={isSaving}
                      className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 sm:flex"
                      title="เลือกโฟลเดอร์ในเครื่องเพื่อบันทึกไฟล์ทั้งหมดแยกเป็นรายใบ"
                    >
                      <FolderDown className="h-4.5 w-4.5" strokeWidth={2.5} />
                      <span>บันทึกลงโฟลเดอร์</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleSave("download")}
                    disabled={isSaving}
                    className="hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 disabled:opacity-50 sm:flex"
                  >
                    {isSaving ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Download className="h-4.5 w-4.5" strokeWidth={3} />}
                    <span>{hasFSPicker ? "ดาวน์โหลดทีละรูป" : "บันทึกรูปทั้งหมด"}</span>
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

              {/* Progress Modal Overlay during saving */}
              {isSaving && (
                <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center bg-[#0a0c10]/90 backdrop-blur-md animate-in fade-in duration-300 px-4">
                  <div className="flex flex-col items-center bg-[#12151c] p-8 sm:p-10 rounded-3xl border border-white/10 shadow-2xl w-full max-w-md text-center">
                    {readyCaptured ? (
                      <div className="flex w-full flex-col items-center animate-in zoom-in-95 duration-300">
                        <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-400 ring-8 ring-emerald-500/10 animate-bounce">
                          <CheckCircle2 className="h-10 w-10 text-emerald-400" strokeWidth={2.5} />
                        </div>

                        <h3 className="text-xl sm:text-2xl font-black text-white">
                          สร้างรูปภาพครบ {readyCaptured.length} ใบแล้ว!
                        </h3>
                        <p className="text-xs font-bold text-slate-400 mt-2 mb-6 leading-relaxed">
                          รูปภาพความคมชัดสูงพร้อมบันทึก แตะปุ่มด้านล่างเพื่อบันทึกรูปลงคลังภาพ/เครื่อง
                        </p>

                        <button
                          type="button"
                          onClick={handleMobileSaveTrigger}
                          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 px-6 text-lg font-black text-white shadow-[0_15px_30px_rgba(16,185,129,0.3)] transition hover:bg-emerald-500 active:scale-95"
                        >
                          <Share2 className="h-6 w-6" strokeWidth={2.5} />
                          <span>แตะเพื่อบันทึกรูปภาพ ({readyCaptured.length} ใบ)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReadyCaptured(null);
                            setIsSaving(false);
                          }}
                          className="mt-4 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          ปิดหน้าต่าง
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative mb-6 flex items-center justify-center">
                          <div className="h-16 w-16 rounded-full border-4 border-[#4A148C]/20" />
                          <Loader2 className="absolute h-16 w-16 animate-spin text-[#BA68C8]" strokeWidth={2.5} />
                          <span className="absolute text-xs font-black text-white">
                            {savingProgress ? `${savingProgress.percent}%` : ""}
                          </span>
                        </div>

                        <h3 className="text-lg sm:text-xl font-black text-white text-center">
                          {savingStatus ?? "กำลังบันทึกรูปภาพ..."}
                        </h3>

                        {savingProgress && (
                          <div className="w-full mt-5">
                            <div className="flex justify-between text-xs font-bold text-slate-400 mb-2">
                              <span>ความคืบหน้า</span>
                              <span className="text-emerald-400 font-black">
                                {savingProgress.current} จาก {savingProgress.total} ใบ
                              </span>
                            </div>
                            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                                style={{ width: `${savingProgress.percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-slate-400 mt-5 text-center leading-relaxed">
                          ระบบกำลังเรนเดอร์ภาพความคมชัดสูงทีละใบ กรุณารอสักครู่ครับ
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Preview Body */}
              <div
                ref={previewBodyRef}
                className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(74,20,140,0.08)_0%,transparent_70%)] p-4 pb-28 sm:p-12 sm:pb-12"
              >
                <div className="mx-auto flex w-full max-w-[210mm] flex-col items-center gap-10 sm:gap-16">
                  {pages.map((page, pageIdx) => (
                    <div key={page.key} className="group relative flex w-full flex-col items-center animate-in zoom-in-95 duration-300">
                      <div className="mb-3 flex items-center gap-3 self-start sm:absolute sm:-left-20 sm:mb-0 sm:flex-col sm:self-auto">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1f26] text-sm font-black text-white ring-1 ring-white/10 shadow-2xl">
                          {pageIdx + 1}
                        </span>
                        <div className="h-px w-8 bg-white/10 sm:h-12 sm:w-px" />
                      </div>

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
                            captureClassName="batch-billing-preview-card-element billing-invoice-page"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Footer */}
              <div className="border-t border-white/5 bg-[#12151c]/90 p-4 pb-safe-offset-4 backdrop-blur-xl sm:hidden">
                <button
                  type="button"
                  onClick={() => handleSave("auto")}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(16,185,129,0.25)] transition active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" strokeWidth={3} />}
                  <span>{isSaving ? (savingStatus ?? "กำลังบันทึก...") : `บันทึกรูปทั้งหมด (${pages.length} ใบ)`}</span>
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
