"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Upload, X, Loader2, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { importCustomersAction } from "@/app/settings/customers/actions";
import { useRouter } from "next/navigation";

type CustomerImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ImportState = {
  status: "idle" | "success" | "error";
  message: string;
  errors: string[];
};

const initialState: ImportState = {
  status: "idle",
  message: "",
  errors: [],
};

export function CustomerImportModal({ isOpen, onClose }: CustomerImportModalProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (prevState: ImportState, formData: FormData): Promise<ImportState> => {
      const result = await importCustomersAction(prevState, formData);
      return {
        status: result.status,
        message: result.message,
        errors: result.errors || [],
      };
    },
    initialState
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
      // Wait a moment and close
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.status, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4 animate-fade-in">
      <div className="flex max-h-[96dvh] w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] animate-slide-down-premium">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              นำเข้าข้อมูลร้านค้า
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              <Upload className="h-6 w-6 text-[#082A63]" strokeWidth={2.2} />
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">นำเข้าร้านค้าจากไฟล์ CSV</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            disabled={isPending}
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Download Template Section */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <h4 className="font-bold text-[#082A63] text-sm flex items-center gap-2">
              <Download className="h-4.5 w-4.5" /> แนะนำ: ใช้ไฟล์เทมเพลตมาตรฐาน
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              กรุณาดาวน์โหลดไฟล์เทมเพลต เพื่อกรอกข้อมูลร้านค้าในรูปแบบที่ถูกต้อง โดยคอลัมน์ &quot;ชื่อร้านค้า&quot;, &quot;คลังสินค้าหลัก&quot; และ &quot;ที่อยู่&quot; จำเป็นต้องระบุข้อมูล ห้ามเว้นว่าง
            </p>
            <a
              href="/templates/import_customers_template.csv"
              download="เทมเพลตนำเข้าร้านค้า.csv"
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-[#D4AF37] px-3.5 py-2 text-xs font-bold text-[#082A63] shadow-sm hover:bg-slate-50 transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลดเทมเพลต (.csv)
            </a>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-black text-slate-700">เลือกไฟล์ CSV เพื่อนำเข้า</label>
              <div 
                onClick={() => !isPending && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                  file ? "border-emerald-300 bg-emerald-50/10" : "border-slate-300 hover:border-[#D4AF37]"
                } ${isPending ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="file"
                  name="file"
                  accept=".csv"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) setFile(selectedFile);
                  }}
                />
                <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-600">คลิกเพื่อเลือกไฟล์เทมเพลตที่บันทึกไว้</p>
                    <p className="text-xs text-slate-400 mt-1">รองรับเฉพาะไฟล์ .csv (การเข้ารหัสแบบ UTF-8)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status Feedback */}
            {state.status === "success" && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 animate-in fade-in">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-bold">{state.message}</p>
              </div>
            )}

            {state.status === "error" && (
              <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <p className="text-sm font-bold">{state.message}</p>
                </div>
                {state.errors && state.errors.length > 0 && (
                  <div className="border-t border-red-200/50 pt-2.5 space-y-1 max-h-36 overflow-y-auto">
                    {state.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-700 font-medium">
                        • {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-xl border border-slate-200 px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                disabled={isPending}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isPending || !file}
                className="h-12 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B68B1F] px-8 text-sm font-black text-[#082A63] shadow-[0_12px_26px_rgba(212,175,55,0.2)] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    กำลังนำเข้าข้อมูล...
                  </>
                ) : (
                  "เริ่มนำเข้าข้อมูล"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
