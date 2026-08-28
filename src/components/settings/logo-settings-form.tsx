"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Save, Trash2, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateLogoSettingsAction, type LogoSettingsActionState } from "@/app/settings/logo/actions";

type LogoSettingsFormProps = {
  initialLogoUrl: string | null;
};

const initialState: LogoSettingsActionState = {
  logoUrl: null,
  message: "",
  status: "idle",
};

export function LogoSettingsForm({ initialLogoUrl }: LogoSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateLogoSettingsAction, initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialLogoUrl || "/api/brand/logo");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state message changes
  useEffect(() => {
    if (state.status === "success") {
      const timer = setTimeout(() => {
        setLocalError(null);
        setLogoData(null);
        // Force refresh preview cache with timestamp
        setPreviewUrl(`/api/brand/logo?v=${Date.now()}`);
      }, 0);
      return () => clearTimeout(timer);
    } else if (state.status === "error") {
      const timer = setTimeout(() => {
        setLocalError(state.message);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setLocalError(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processImageFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setLocalError("กรุณาเลือกไฟล์ที่เป็นรูปภาพเท่านั้น");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 512;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setLocalError("ระบบเบราว์เซอร์ไม่สามารถประมวลผลรูปภาพได้");
            return;
          }

          // Calculate square crop from center
          const size = Math.min(img.width, img.height);
          const sourceX = (img.width - size) / 2;
          const sourceY = (img.height - size) / 2;

          // Clear canvas with transparent color
          ctx.clearRect(0, 0, 512, 512);

          // Draw cropped and scaled image
          ctx.drawImage(img, sourceX, sourceY, size, size, 0, 0, 512, 512);

          const croppedDataUrl = canvas.toDataURL("image/png");
          setPreviewUrl(croppedDataUrl);
          setLogoData(croppedDataUrl);
        } catch (err) {
          console.error("Image process error:", err);
          setLocalError("เกิดข้อผิดพลาดในการปรับขนาดรูปภาพ");
        }
      };
      img.onerror = () => {
        setLocalError("รูปภาพที่โหลดเสียหายหรือไม่ถูกต้อง");
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setLocalError("ไม่สามารถอ่านไฟล์ภาพได้");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setPreviewUrl("/brand/512x512.png");
    setLogoData("REMOVE"); // Special value indicating removal of custom logo
    setLocalError(null);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 font-[family:var(--font-noto-sans-thai)]">
      <form action={formAction} id="logo-form" className="space-y-8">
        {/* Hidden input to hold the processed base64 image data */}
        <input type="hidden" name="logoData" value={logoData || ""} />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column - Live Preview */}
          <div className="md:col-span-4 flex flex-col items-center space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 self-start">ตัวอย่างโลโก้</h3>
            
            <div className="relative group w-48 h-48 sm:w-56 sm:h-56 rounded-3xl bg-slate-900 border border-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.4)] overflow-hidden flex items-center justify-center p-3 transition duration-300 hover:border-[#4A148C]/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl || "/brand/512x512.png"}
                alt="Logo preview"
                className="w-full h-full object-contain max-w-full max-h-full rounded-2xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition duration-500 group-hover:scale-105"
              />
              
              {/* Overlay info */}
              <div className="absolute inset-0 bg-[#0a0c10]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-300 backdrop-blur-[2px]">
                <span className="text-xs font-black text-white px-3 py-1.5 rounded-full bg-black/60 border border-white/10">
                  สัดส่วน 1:1 จัตุรัส
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center text-center space-y-1">
              <span className="text-xs font-bold text-slate-400">
                {logoData === "REMOVE" ? "กำลังจะใช้โลโก้เริ่มต้นของระบบ" : logoData ? "โลโก้ที่เลือกใหม่" : "โลโก้ปัจจุบันในระบบ"}
              </span>
              <p className="text-[10px] text-slate-500">
                ขนาดแสดงผลหลัก: 512 x 512 px (PNG)
              </p>
            </div>
          </div>

          {/* Right Column - Upload & Actions */}
          <div className="md:col-span-8 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">อัปโหลดรูปภาพใหม่</h3>

            {/* Drag & Drop Area */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[220px] ${
                dragActive
                  ? "border-[#4A148C] bg-[#EA80FC]/5 scale-[0.99] ring-2 ring-[#EA80FC]/10"
                  : "border-slate-200 bg-white hover:border-[#4A148C]/50 hover:bg-slate-50/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EA80FC]/15 text-[#4A148C] mb-4 shadow-sm group-hover:scale-110 transition duration-300">
                <Upload className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <h4 className="text-base font-black text-slate-800 mb-1">
                คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวางที่นี่
              </h4>
              <p className="text-sm text-slate-400 max-w-sm mb-4">
                ระบบจะตัดครอปภาพเป็นรูปทรงสี่เหลี่ยมจัตุรัสให้โดยอัตโนมัติ เพื่อป้องกันการบีบอัดรูป
              </p>
              
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                  PNG / JPG
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                  สูงสุด 10MB
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-[#4A148C] px-2 py-1 rounded-md">
                  แนะนำ 1024x1024 px
                </span>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={triggerFileInput}
                className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition"
              >
                เลือกรูปภาพใหม่
              </button>
              
              {previewUrl !== "/brand/512x512.png" && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-5 text-sm font-bold text-rose-700 hover:bg-rose-50 hover:border-rose-300 active:scale-[0.98] transition"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                  คืนค่าโลโก้เริ่มต้น
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message and Status Panel */}
        {localError && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-rose-700 flex items-start gap-3 text-sm animate-in slide-in-from-bottom-2 duration-300">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="font-semibold">{localError}</div>
          </div>
        )}

        {state.status === "success" && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-emerald-700 flex items-start gap-3 text-sm animate-in slide-in-from-bottom-2 duration-300">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="font-semibold">{state.message}</div>
          </div>
        )}

        {/* Save Button Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 pt-6">
          <button
            type="submit"
            disabled={isPending || (!logoData && logoData !== "REMOVE")}
            className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-8 text-base font-bold text-white shadow-[0_12px_28px_rgba(74,20,140,0.22)] hover:bg-[#4A148C]/95 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>บันทึกโลโก้</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
