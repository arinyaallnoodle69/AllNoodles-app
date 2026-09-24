"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Image as ImageIcon, Loader2, Share2 } from "lucide-react";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import html2canvas from "html2canvas";

const CAPTURE_TIMEOUT_MS = 8000;

function isMobileLikeDevice() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA =
    /Android|webOS|iPhone|iPad|IEMobile|Opera Mini/i.test(ua) ||
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
      "Delivery note image capture timeout",
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

type BatchDeliveryNotesImageButtonProps = {
  className?: string;
  buttonText?: string;
  datePrefix?: string;
  autoStart?: boolean;
};

export function BatchDeliveryNotesImageButton({
  className,
  buttonText = "บันทึกรูปทั้งหมด",
  datePrefix,
  autoStart = false,
}: BatchDeliveryNotesImageButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [readyCaptured, setReadyCaptured] = useState<{ blob: Blob; name: string }[] | null>(null);

  const hasFSPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const handleSave = async (mode: "folder" | "download" | "auto" = "auto") => {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSavingStatus("กำลังค้นหาบิลส่งของ...");
    setSavingProgress(null);

    try {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>("[data-delivery-note-page='true']"),
      );

      if (targets.length === 0) {
        throw new Error("ไม่พบบิลส่งของในหน้านี้สำหรับแปลงรูปภาพ");
      }

      setSavingStatus("กำลังเตรียมตัวอักษร...");
      let fontEmbedCSS: string | undefined;
      try {
        fontEmbedCSS = await Promise.race([
          htmlToImage.getFontEmbedCSS(document.body),
          new Promise<string>((_, reject) =>
            window.setTimeout(() => reject(new Error("Font CSS timeout")), 2000),
          ),
        ]);
      } catch {
        // Continue even if fontEmbedCSS fails
      }

      const total = targets.length;
      const captured: { blob: Blob; name: string }[] = [];
      const today = datePrefix || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

      for (let i = 0; i < total; i += 1) {
        const element = targets[i];
        const percent = Math.round(((i + 1) / total) * 100);
        setSavingProgress({ current: i + 1, total, percent });
        setSavingStatus(`กำลังแปลงรูปภาพความคมชัดสูง ${i + 1}/${total} (${percent}%)...`);

        // Yield to browser event loop so UI updates smoothly
        await new Promise((resolve) => setTimeout(resolve, 25));

        const blob = await captureElementToBlob(element, fontEmbedCSS);

        const custCode = element.dataset.customerCode?.trim() || "";
        const custName = element.dataset.customerName?.trim() || "";
        const delNum = element.dataset.deliveryNumber?.trim() || "";
        const pageIdx = element.dataset.pageIndex?.trim() || `${i + 1}`;
        const totalPages = element.dataset.totalPages?.trim() || "1";

        const identifier = custCode || delNum || custName || `store-${i + 1}`;
        const pageSuffix = totalPages !== "1" ? `-page-${pageIdx}` : total > 1 ? `-${i + 1}` : "";
        const fileName = `delivery-note-${identifier}-${today}${pageSuffix}.png`.replace(/[^\w.-]/g, "_");

        captured.push({ blob, name: fileName });
      }

      const isMobile = isMobileLikeDevice();

      if (isMobile) {
        setReadyCaptured(captured);
        setSavingStatus(null);
        return;
      }

      // Desktop Folder flow (File System Access API)
      if (mode === "folder" || (mode === "auto" && hasFSPicker)) {
        try {
          const dirHandle = await (window as unknown as {
            showDirectoryPicker: (options?: { id?: string; mode?: string; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
          }).showDirectoryPicker({
            id: "allnoodles-delivery-notes",
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
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setIsSaving(false);
          setSavingStatus(null);
          setSavingProgress(null);
          return;
        } catch (dirErr: unknown) {
          if (dirErr instanceof Error && dirErr.name === "AbortError") {
            // User cancelled folder picker
            setIsSaving(false);
            setSavingStatus(null);
            setSavingProgress(null);
            return;
          }
          console.warn("Folder picker error, falling back to sequential download:", dirErr);
        }
      }

      // Default/fallback for desktop: Sequential download
      for (let i = 0; i < captured.length; i += 1) {
        const percent = Math.round(((i + 1) / captured.length) * 100);
        setSavingProgress({ current: i + 1, total: captured.length, percent });
        setSavingStatus(`กำลังดาวน์โหลดรูปที่ ${i + 1}/${captured.length} (${percent}%)...`);
        safeDownloadBlob(captured[i].blob, captured[i].name);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      setSavingStatus("ดาวน์โหลดครบทุกรูปเรียบร้อยแล้ว!");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsSaving(false);
      setSavingStatus(null);
      setSavingProgress(null);
    } catch (error) {
      console.error("Save all delivery notes images error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง",
      );
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (autoStart) {
      const timer = window.setTimeout(() => {
        handleSave("auto");
      }, 600);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const handleMobileSaveTrigger = async () => {
    if (!readyCaptured || readyCaptured.length === 0) return;

    try {
      const files = readyCaptured.map((item) => new File([item.blob], item.name, { type: "image/png" }));

      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: "บิลส่งของทั้งหมด",
          });
          setReadyCaptured(null);
          setIsSaving(false);
          return;
        } catch (shareErr: unknown) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            return;
          }
          console.warn("[WebShare] share error, falling back to safe download:", shareErr);
        }
      }

      // Fallback sequential download
      for (let i = 0; i < readyCaptured.length; i += 1) {
        safeDownloadBlob(readyCaptured[i].blob, readyCaptured[i].name);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      setReadyCaptured(null);
      setIsSaving(false);
    } catch (err) {
      console.error("Mobile save trigger error:", err);
      setErrorMessage("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleSave("auto")}
        disabled={isSaving}
        className={
          className ??
          "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        }
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#4A148C]" strokeWidth={2.3} />
        ) : (
          <ImageIcon className="h-4 w-4 text-emerald-600" strokeWidth={2.3} />
        )}
        <span>{isSaving ? (savingStatus ?? "กำลังบันทึก...") : buttonText}</span>
      </button>

      {/* Progress / Completion Modal */}
      {isSaving && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center bg-[#0a0c10]/90 px-4 backdrop-blur-md animate-in fade-in duration-300">
              <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-[#12151c] p-8 text-center shadow-2xl sm:p-10">
                {readyCaptured ? (
                  <div className="flex w-full flex-col items-center animate-in zoom-in-95 duration-300">
                    <div className="relative mb-5 flex h-20 w-20 animate-bounce items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-400 ring-8 ring-emerald-500/10">
                      <CheckCircle2 className="h-10 w-10 text-emerald-400" strokeWidth={2.5} />
                    </div>

                    <h3 className="text-xl font-black text-white sm:text-2xl">
                      สร้างรูปภาพครบ {readyCaptured.length} ใบแล้ว!
                    </h3>
                    <p className="mb-6 mt-2 text-xs font-bold leading-relaxed text-slate-400">
                      รูปภาพความคมชัดสูงพร้อมบันทึก แตะปุ่มด้านล่างเพื่อบันทึกรูปลงคลังภาพ/เครื่อง
                    </p>

                    <button
                      type="button"
                      onClick={handleMobileSaveTrigger}
                      className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(16,185,129,0.3)] transition hover:bg-emerald-500 active:scale-95"
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
                      className="mt-4 text-xs font-bold text-slate-500 transition-colors hover:text-slate-300"
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

                    <h3 className="text-center text-lg font-black text-white sm:text-xl">
                      {savingStatus ?? "กำลังบันทึกรูปภาพ..."}
                    </h3>

                    {savingProgress && (
                      <div className="mt-5 w-full">
                        <div className="mb-2 flex justify-between text-xs font-bold text-slate-400">
                          <span>ความคืบหน้า</span>
                          <span className="font-black text-emerald-400">
                            {savingProgress.current} จาก {savingProgress.total} ใบ
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-white/10 p-0.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                            style={{ width: `${savingProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
                      ระบบกำลังเรนเดอร์ภาพความคมชัดสูงทีละใบ กรุณารอสักครู่ครับ
                    </p>

                    <button
                      type="button"
                      onClick={() => setIsSaving(false)}
                      className="mt-6 text-xs text-slate-500 hover:text-slate-300"
                    >
                      ยกเลิก
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {errorMessage ? (
        <div className="fixed bottom-6 left-1/2 z-[800] -translate-x-1/2 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-3 text-center text-sm font-semibold text-rose-700 shadow-xl">
          {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-3 font-black text-rose-900 underline"
          >
            ปิด
          </button>
        </div>
      ) : null}
    </>
  );
}
