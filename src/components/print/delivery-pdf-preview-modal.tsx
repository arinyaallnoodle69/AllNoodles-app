"use client";

import { Download, Loader2, Share2, X, AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  downloadPreparedDeliveryPdf,
  sharePreparedDeliveryPdf,
} from "@/components/print/share-delivery-pdf";
import { uploadTempPdfAction } from "@/app/orders/pdf-actions";

type DeliveryPdfPreviewModalProps = {
  file: File;
  onClose: () => void;
};

export function DeliveryPdfPreviewModal({ file, onClose }: DeliveryPdfPreviewModalProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [isLineBrowser, setIsLineBrowser] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileStandalone, setIsMobileStandalone] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Supabase temp upload states
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isLine = ua.indexOf("line") > -1;
    const isMob = /iphone|ipad|ipod|android/i.test(ua);
    setIsLineBrowser(isLine);
    setIsMobile(isMob);

    // Check for standalone mode (PWA installed on home screen)
    interface NavigatorWithStandalone extends Navigator {
      standalone?: boolean;
    }
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as NavigatorWithStandalone).standalone ||
      document.referrer.includes("android-app://");
    
    setIsMobileStandalone(!!standaloneMode && isMob);

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Handle uploading the PDF file to Supabase in the background
  useEffect(() => {
    let active = true;

    async function uploadPdf() {
      setIsUploading(true);
      setUploadError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const result = await uploadTempPdfAction(formData);
        if (!active) return;

        if (result.error) {
          console.error("PDF upload action error:", result.error);
          setUploadError(result.error);
        } else if (result.publicUrl) {
          setPublicUrl(result.publicUrl);
        }
      } catch (err) {
        console.error("PDF upload error:", err);
        if (active) {
          setUploadError("ไม่สามารถอัปโหลดไฟล์ไปที่เซิร์ฟเวอร์ได้");
        }
      } finally {
        if (active) {
          setIsUploading(false);
        }
      }
    }

    uploadPdf();

    return () => {
      active = false;
    };
  }, [file]);

  function handleCopyLink() {
    // If publicUrl is available, we copy that instead of the current page URL, so they can directly open the PDF!
    const linkToCopy = publicUrl || window.location.href;
    navigator.clipboard
      .writeText(linkToCopy)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy link: ", err);
      });
  }

  function handleDownload() {
    if (publicUrl) {
      window.open(publicUrl, "_blank");
      return;
    }

    if (isMobileStandalone) {
      window.alert(
        isUploading
          ? "ระบบกำลังจัดเตรียมไฟล์ PDF กรุณารอสักครู่..."
          : "ไม่สามารถดาวน์โหลดไฟล์โดยตรงผ่านแอปหน้าจอหลัก (PWA) ได้\n\nกรุณากดปุ่ม 'คัดลอกลิงก์หน้าเว็บ' ด้านล่างเพื่อนำลิงก์ไปเปิดใน Safari/Chrome",
      );
      return;
    }
    if (isLineBrowser) {
      window.alert(
        "เบราว์เซอร์ LINE ไม่รองรับการดาวน์โหลดไฟล์โดยตรง\n\nกรุณากดปุ่มเมนูมุมขวาบน (...) แล้วเลือก 'เปิดในเบราว์เซอร์อื่น' หรือกดปุ่ม 'เปิดด้วย Safari / Chrome' ในหน้าจอ",
      );
      return;
    }
    downloadPreparedDeliveryPdf(file);
  }

  async function handleShare() {
    if (isSharing) return;

    if (publicUrl) {
      setIsSharing(true);
      try {
        if (navigator.share) {
          await navigator.share({
            title: file.name,
            url: publicUrl,
          });
        } else {
          // Fallback if navigator.share is not supported: open in new window
          window.open(publicUrl, "_blank");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("[delivery/share-pdf]", error);
        window.alert("แชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      } finally {
        setIsSharing(false);
      }
      return;
    }

    if (isMobileStandalone) {
      window.alert(
        isUploading
          ? "ระบบกำลังจัดเตรียมไฟล์ PDF กรุณารอสักครู่..."
          : "ไม่สามารถแชร์ไฟล์ผ่านแอปหน้าจอหลัก (PWA) ได้\n\nกรุณากดปุ่ม 'คัดลอกลิงก์หน้าเว็บ' ด้านล่างเพื่อนำลิงก์ไปเปิดใน Safari/Chrome",
      );
      return;
    }

    if (isLineBrowser) {
      window.alert(
        "เบราว์เซอร์ LINE ไม่รองรับการแชร์ไฟล์โดยตรง\n\nกรุณากดปุ่มเมนูมุมขวาบน (...) แล้วเลือก 'เปิดในเบราว์เซอร์อื่น' หรือกดปุ่ม 'เปิดด้วย Safari / Chrome' ในหน้าจอ",
      );
      return;
    }

    setIsSharing(true);
    try {
      await sharePreparedDeliveryPdf(file);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[delivery/share-pdf]", error);
      window.alert("แชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] bg-[#4A148C]/40 p-0 text-[#4A148C] backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white sm:h-[92vh] sm:max-w-[1280px] sm:border sm:border-[#EA80FC]/40">
        <div className="flex h-1 w-full">
          <div className="h-full flex-1 bg-[#4A148C]" />
          <div className="h-full flex-1 bg-[#EA80FC]" />
        </div>

        <div className="border-b border-[#EA80FC]/30 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#EA80FC]/45 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/512x512.png" alt="All Noodles" className="h-9 w-9 object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#EA80FC] sm:text-xs">
                  ALL NOODLES PDF EXPORT
                </p>
                <h3 className="mt-1 truncate text-xl font-black leading-none tracking-[0.01em] text-[#4A148C] sm:text-2xl">
                  ตัวอย่าง PDF บิลส่งของ
                </h3>
                <p className="mt-1 truncate text-[11px] font-semibold text-[#4A148C]/60 sm:text-xs">
                  {file.name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#EA80FC]/45 bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 active:scale-95 sm:hidden"
              aria-label="ปิดตัวอย่าง PDF"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>

          <div className="mt-4 hidden items-center justify-end gap-3 sm:flex">
            <button
              type="button"
              onClick={handleDownload}
              className={`inline-flex h-12 items-center gap-2 bg-[#EA80FC] px-6 text-sm font-black uppercase tracking-[0.14em] text-[#4A148C] transition hover:bg-[#4A148C] active:scale-[0.98] ${
                isMobileStandalone && !publicUrl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <Download className="h-4 w-4" strokeWidth={2.6} />
              ดาวน์โหลด
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className={`inline-flex h-12 items-center gap-2 bg-[#4A148C] px-6 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#4A148C] active:scale-[0.98] disabled:opacity-60 ${
                isMobileStandalone && !publicUrl ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isSharing ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
              ) : (
                <Share2 className="h-4 w-4" strokeWidth={2.4} />
              )}
              แชร์ / LINE
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#EA80FC]/45 bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 active:scale-95"
              aria-label="ปิดตัวอย่าง PDF"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="min-h-0 bg-[#F6F7FA] p-3 sm:p-5">
          <div className="mx-auto grid h-full w-full max-w-[1120px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-[#EA80FC]/30 bg-white">
            <div className="flex items-center justify-between border-b border-[#EA80FC]/25 bg-white px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#EA80FC]" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#4A148C]/75">
                  PDF PREVIEW
                </span>
              </div>
              <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-[#4A148C]/45 sm:inline">
                Download or share after review
              </span>
            </div>
            
            {isMobile ? (
              // On Mobile (including LINE and Standalone PWA)
              isUploading ? (
                <div className="flex flex-col items-center justify-center gap-4 p-6 py-20 text-center bg-white h-full min-h-[62dvh]">
                  <Loader2 className="h-10 w-10 animate-spin text-[#4A148C]" strokeWidth={2.5} />
                  <p className="text-sm font-semibold text-slate-600">กำลังจัดเตรียมไฟล์ PDF ชั่วคราวบนเซิร์ฟเวอร์...</p>
                </div>
              ) : publicUrl ? (
                // Google Docs Viewer renders the PDF beautifully on all mobile views!
                <iframe
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`}
                  title="ตัวอย่าง PDF บิลส่งของ"
                  className="flex-1 min-h-[60dvh] w-full bg-white border-0"
                />
              ) : isMobileStandalone ? (
                // Fallback warning for standalone PWA if upload fails
                <div className="flex flex-col items-center justify-center gap-6 p-6 py-12 text-center bg-white h-full min-h-[62dvh] overflow-y-auto">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 border border-amber-200">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div className="max-w-md">
                    <h4 className="text-lg font-bold text-slate-900">
                      ข้อจำกัดของแอปหน้าจอหลัก (PWA Standalone)
                    </h4>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed font-semibold">
                      ระบบแอปที่ติดตั้งบนหน้าจอมือถือ (PWA) <b>ไม่รองรับการแสดงตัวอย่าง หรือดาวน์โหลด/แชร์ไฟล์ PDF ชั่วคราว</b> เนื่องจากระบบปิดกั้นการเข้าถึงหน่วยความจำภายนอก
                    </p>
                    {uploadError && (
                      <p className="mt-2 text-xs text-red-500 font-semibold">
                        (เกิดข้อผิดพลาดในการอัปโหลดไฟล์: {uploadError})
                      </p>
                    )}
                    <p className="mt-3 text-xs text-amber-600 bg-amber-50/50 border border-amber-100 rounded-lg p-3 text-left">
                      ⚠️ <b>ทำไมถึงเกิดหน้าจอเทา/ค้าง:</b> การกดเปิดหรือพรีวิวไฟล์ในแอปหน้าจอหลักของ iOS/Android จะทำให้ระบบแสดงผลผิดพลาดหรือหน้าจอเทา เนื่องจากแอป PWA ไม่มีโปรแกรมจัดการดาวน์โหลดไฟล์ในตัวเหมือนเบราว์เซอร์ปกติ
                    </p>
                    <p className="mt-4 text-sm text-slate-700">
                      👉 <b>วิธีแก้ไข:</b> กรุณากดปุ่ม <b>&quot;คัดลอกลิงก์หน้าเว็บ&quot;</b> ด้านล่างนี้ แล้วนำไปวางและล็อกอินในเบราว์เซอร์ปกติของเครื่อง (เช่น <b>Safari</b> บน iPhone หรือ <b>Chrome</b> บน Android) เพื่อดาวน์โหลดหรือส่งออกไฟล์ตามปกติ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-8 text-sm font-bold text-white transition hover:bg-[#3b0f70] active:scale-[0.98]"
                  >
                    {isCopied ? "คัดลอกลิงก์สำเร็จ!" : "คัดลอกลิงก์หน้าเว็บ"}
                  </button>
                </div>
              ) : isLineBrowser ? (
                // Fallback warning for LINE browser if upload fails
                <div className="flex flex-col items-center justify-center gap-6 p-6 py-12 text-center bg-white h-full min-h-[62dvh] overflow-y-auto">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 border border-amber-200">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div className="max-w-md">
                    <h4 className="text-lg font-bold text-slate-900">
                      ข้อจำกัดของแอป LINE ในการจัดการ PDF
                    </h4>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                      เบราว์เซอร์ของแอป LINE (In-App Browser) <b>ไม่รองรับการแสดงตัวอย่าง คัดลอก หรือดาวน์โหลดไฟล์ PDF</b> ไปยังเครื่องของคุณโดยตรง
                    </p>
                    <p className="mt-3 text-xs text-amber-600 bg-amber-50/50 border border-amber-100 rounded-lg p-3 text-left">
                      💡 <b>วิธีดาวน์โหลดหรือแชร์:</b> กรุณากดปุ่ม <b>เปิดด้วย Safari / Chrome</b> ด้านล่างนี้ หรือกดสัญลักษณ์จุดสามจุด <b>(...)</b> ที่มุมบนขวาของหน้าจอ LINE แล้วเลือก <b>&quot;เปิดในเบราว์เซอร์อื่น&quot; (Open in default browser)</b>
                    </p>
                  </div>
                  <div className="flex flex-col w-full gap-3 sm:flex-row sm:justify-center">
                    <a
                      href={`${window.location.origin}${window.location.pathname}${window.location.search}${
                        window.location.search ? "&" : "?"
                      }openExternalBrowser=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#06C755] px-6 text-sm font-bold text-white transition hover:bg-[#05B34C] active:scale-[0.98]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      เปิดด้วย Safari / Chrome
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                    >
                      {isCopied ? "คัดลอกลิงก์สำเร็จ!" : "คัดลอกลิงก์หน้าเว็บ"}
                    </button>
                  </div>
                </div>
              ) : (
                // Other mobile browsers fallback
                <div className="relative flex flex-col h-full w-full">
                  <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 text-xs text-amber-800 flex items-start gap-2 shrink-0 font-medium">
                    <span className="font-bold shrink-0">💡 คำแนะนำ:</span>
                    <span>หากตัวอย่าง PDF ไม่แสดงผล (หน้าจอขาว) คุณสามารถกดปุ่ม <b>&quot;ดาวน์โหลด&quot;</b> หรือ <b>&quot;แชร์ / LINE&quot;</b> ด้านล่างเพื่อส่งออกไฟล์ได้ทันที</span>
                  </div>
                  <iframe
                    src={previewUrl}
                    title="ตัวอย่าง PDF บิลส่งของ"
                    className="flex-1 min-h-[60dvh] w-full bg-white border-0"
                  />
                </div>
              )
            ) : (
              // On Desktop (PC Chrome, Safari, etc.)
              <div className="relative flex flex-col h-full w-full">
                <iframe
                  src={previewUrl}
                  title="ตัวอย่าง PDF บิลส่งของ"
                  className="flex-1 min-h-[60dvh] w-full bg-white border-0"
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-[#EA80FC]/30 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
          <button
            type="button"
            onClick={handleDownload}
            className={`inline-flex h-14 items-center justify-center gap-2 bg-[#EA80FC] text-sm font-black uppercase tracking-[0.12em] text-[#4A148C] transition active:scale-95 ${
              isMobileStandalone && !publicUrl ? "opacity-50" : ""
            }`}
          >
            <Download className="h-5 w-5" strokeWidth={2.8} />
            ดาวน์โหลด
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className={`inline-flex h-14 items-center justify-center gap-2 bg-[#4A148C] text-sm font-black uppercase tracking-[0.12em] text-white transition active:scale-95 disabled:opacity-60 ${
              isMobileStandalone && !publicUrl ? "opacity-50" : ""
            }`}
          >
            {isSharing ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.6} />
            ) : (
              <Share2 className="h-5 w-5" strokeWidth={2.6} />
            )}
            แชร์ / LINE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
