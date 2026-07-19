"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Image as ImageIcon, Loader2, X } from "lucide-react";
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
} from "@/components/print/billing-statement-layout";

let cachedFontEmbedCSS: string | null = null;
const CAPTURE_TIMEOUT_MS = 30000;

function isMobileLikeDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 640px), (pointer: coarse)").matches;
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

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(parts[1] ?? "");
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
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

type PreviewImage = {
  dataUrl: string;
  blob: Blob;
  name: string;
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

  // States for pre-capturing images to preserve user gesture sandbox for navigator.share
  const [capturedImages, setCapturedImages] = useState<PreviewImage[] | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingStatus, setPreparingStatus] = useState<string | null>(null);

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

    if (typeof window !== "undefined" && !cachedFontEmbedCSS) {
      const preloadFonts = async () => {
        try {
          await document.fonts.ready;
          const css = await htmlToImage.getFontEmbedCSS(document.body);
          cachedFontEmbedCSS = css;
        } catch (error) {
          console.warn("[FontPreloader:BatchBilling] Failed to preload fonts:", error);
        }
      };
      // Delay slightly to prioritize page load
      const timer = setTimeout(preloadFonts, 500);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, []);

  // Pre-prepare images immediately when the modal is opened
  useEffect(() => {
    if (isOpen) {
      void prepareBillingImages();
    } else {
      // Cleanup on modal close
      setCapturedImages(null);
      setErrorMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const prepareBillingImages = async () => {
    setIsPreparing(true);
    setErrorMessage(null);
    setPreparingStatus("กำลังบันทึกข้อมูล...");

    try {
      // 1. Check if there are unbilled candidates that need to be recorded in DB
      const unbilledCandidates = candidates.filter(
        (c) => !localBillingNumbers[c.customerId]
      );

      if (unbilledCandidates.length > 0) {
        setPreparingStatus(`กำลังบันทึกประวัติการวางบิล ${unbilledCandidates.length} ร้านค้า...`);
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

        // Wait a brief moment to allow UI render cycle to update the billing numbers before html2canvas
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 2. Load Fonts Embed CSS
      let fontEmbedCSS: string | undefined;
      if (cachedFontEmbedCSS) {
        fontEmbedCSS = cachedFontEmbedCSS;
      } else {
        setPreparingStatus("กำลังเตรียมตัวอักษร...");
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Font load timeout")), 2000)),
          ]);
          fontEmbedCSS = await Promise.race([
            htmlToImage.getFontEmbedCSS(document.body),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000)),
          ]);
          cachedFontEmbedCSS = fontEmbedCSS;
        } catch (error) {
          console.warn("Failed to embed fonts, proceeding without embedded fonts:", error);
        }
      }

      // Wait a moment for layout to stabilize
      setPreparingStatus("กำลังเตรียมเอกสารใบวางบิล...");
      await new Promise((resolve) => setTimeout(resolve, 100));

      const targets = document.querySelectorAll(".batch-billing-preview-card-element");
      if (targets.length === 0) {
        throw new Error("ไม่พบพื้นที่ใบวางบิลสำหรับแปลงรูปภาพ");
      }

      const mobileLike = isMobileLikeDevice();

      const capturePromises = Array.from(targets).map(async (target, idx) => {
        const element = target as HTMLElement;
        const captureWidth = element.offsetWidth;
        const captureHeight = element.offsetHeight;

        let dataUrl = "";
        try {
          dataUrl = await withTimeout(
            htmlToImage.toPng(element, {
              backgroundColor: "#ffffff",
              cacheBust: true,
              fontEmbedCSS,
              pixelRatio: mobileLike ? 1.2 : 2,
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
        } catch (captureErr) {
          console.warn("html-to-image failed, falling back to html2canvas:", captureErr);
          const canvas = await html2canvas(element, {
            width: captureWidth,
            height: captureHeight,
            scale: mobileLike ? 1.2 : 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          });
          dataUrl = canvas.toDataURL("image/png");
        }

        const blob = dataUrlToBlob(dataUrl);
        const pageData = pages[idx];
        const custCode = pageData?.customer.code ?? "unknown";
        const fileIdx = pages.length > 1 ? `-page-${idx + 1}` : "";
        const fileName = `billing-${custCode}-${fromDate}-to-${toDate}${fileIdx}.png`;

        return { dataUrl, blob, name: fileName };
      });

      const captured = await Promise.all(capturePromises);
      setCapturedImages(captured);
    } catch (error) {
      console.error("Prepare images error:", error);
      setErrorMessage("เกิดข้อผิดพลาดในการจัดเตรียมรูปภาพใบวางบิล");
    } finally {
      setIsPreparing(false);
      setPreparingStatus(null);
    }
  };

  const saveAllImagesSynchronously = async () => {
    if (!capturedImages || capturedImages.length === 0 || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSavingStatus("กำลังบันทึกภาพ...");

    try {
      const isIOS = typeof navigator !== "undefined" && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      );

      const files = capturedImages.map((item) => new File([item.blob], item.name, { type: "image/png" }));

      if (isIOS && navigator.share && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: "ใบวางบิลทั้งหมด",
          });
          setIsOpen(false);
          router.refresh();
          return;
        } catch (error) {
          console.error("[WebShare:BatchBilling]", error);
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }

      // Fallback or non-iOS behavior (downloads sequentially using dataUrl)
      capturedImages.forEach((item, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = item.dataUrl;
          link.download = item.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 600);
      });

      // Close modal and refresh parent page after downloads
      setTimeout(() => {
        setIsOpen(false);
        router.refresh();
      }, capturedImages.length * 600 + 500);

    } catch (error) {
      console.error("Save all images error:", error);
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

                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={saveAllImagesSynchronously}
                    disabled={isPreparing || isSaving || !capturedImages}
                    className="hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 disabled:opacity-60 sm:flex"
                  >
                    {isSaving ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Download className="h-4.5 w-4.5" strokeWidth={3} />}
                    {isSaving ? (savingStatus ?? "กำลังบันทึก...") : "บันทึกรูปทั้งหมด"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/50 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 sm:h-12 sm:w-12"
                    aria-label="ปิด"
                  >
                    <X className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Preparing / Loading Overlay */}
              {isPreparing && (
                <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center bg-[#0a0c10]/85 backdrop-blur-md animate-in fade-in duration-300">
                  <div className="flex flex-col items-center bg-[#12151c] p-10 rounded-2xl border border-white/5 shadow-2xl">
                    <Loader2 className="h-12 w-12 animate-spin text-[#4A148C] mb-4" strokeWidth={2.5} />
                    <h3 className="text-lg font-black text-white">{preparingStatus ?? "กำลังจัดเตรียมรูปภาพ..."}</h3>
                    <p className="text-xs text-slate-400 mt-2">กรุณารอสักครู่ ระบบกำลังสร้างรูปภาพและบันทึกข้อมูลครับ</p>
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
                  onClick={saveAllImagesSynchronously}
                  disabled={isPreparing || isSaving || !capturedImages}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(16,185,129,0.25)] transition active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" strokeWidth={3} />}
                  {isSaving ? (savingStatus ?? "กำลังบันทึก...") : "บันทึกรูปทั้งหมด"}
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
