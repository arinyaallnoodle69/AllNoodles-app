"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, PencilLine, Save, X } from "lucide-react";
import { createSupplierAction, updateSupplierAction } from "@/app/settings/suppliers/actions";
import type { SupplierActionState } from "@/app/settings/suppliers/actions";
import { CustomerAddressFields } from "@/components/settings/customer-address-fields";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type { SettingsSupplier } from "@/lib/settings/admin";

type SupplierFormProps = {
  defaultCode?: string;
  initialSupplier?: SettingsSupplier;
  returnHref: string;
  onClose?: () => void;
};

const initialState: SupplierActionState = {
  status: "idle",
  message: "",
};

function getInputClass(hasError: boolean) {
  return `${settingsInputClass} ${hasError ? "border-red-300 ring-1 ring-red-200" : ""}`;
}

export function SupplierForm({
  defaultCode = "",
  initialSupplier,
  returnHref,
  onClose,
}: SupplierFormProps) {
  const router = useRouter();
  const isEditMode = Boolean(initialSupplier);
  const action = initialSupplier
    ? updateSupplierAction.bind(null, initialSupplier.id)
    : createSupplierAction;
  const [state, formAction, isPending] = useActionState(
    action,
    initialState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const hasSubmittedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function closeModal() {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      if (onClose) {
        onClose();
      } else {
        router.replace(returnHref);
      }
    }, 380);
  }

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      if (onClose) {
        onClose();
      } else {
        router.replace(returnHref);
      }
      router.refresh();
    });
  });

  useEffect(() => {
    if (state.status === "success") {
      handleSuccess();
    }
  }, [state.status]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const showFeedback = hasSubmitted && state.status !== "idle";

  return (
    <div className={`fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4 ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}>
      <div className={`flex h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.5rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:h-auto sm:max-h-[96dvh] sm:rounded-[1.75rem] ${isClosing ? "animate-slide-up-premium" : "animate-slide-down-premium"}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:gap-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.18em]">
              {isEditMode ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"}
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              {isEditMode ? (
                <PencilLine className="h-5 w-5 text-[#4A148C] sm:h-6 sm:w-6" strokeWidth={2.2} />
              ) : (
                <CirclePlus className="h-5 w-5 text-[#4A148C] sm:h-6 sm:w-6" strokeWidth={2.2} />
              )}
              <h3 className="line-clamp-1 py-0.5 text-xl font-semibold leading-snug tracking-[-0.02em] sm:text-2xl">
                {isEditMode ? initialSupplier?.name : "รายการผู้ขายใหม่"}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 sm:h-10 sm:w-10"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <form
          action={formAction}
          onSubmit={() => {
            if (!hasSubmittedRef.current) {
              hasSubmittedRef.current = true;
              setHasSubmitted(true);
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {showFeedback ? (
            <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6">
            <div className="space-y-4 sm:space-y-8">
              <SettingsPanel>
                <SettingsPanelHeader icon="factory" title="ข้อมูลผู้ขาย" description="" />
                <SettingsPanelBody className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="supplier-code">
                      รหัสผู้ขาย
                    </label>
                    <input
                      id="supplier-code"
                      name="supplierCode"
                      required
                      readOnly
                      defaultValue={initialSupplier?.code ?? defaultCode}
                      className={getInputClass(false)}
                      placeholder="ANV001"
                    />
                    <p className="text-sm text-slate-500">
                      ระบบกำหนดรหัสผู้ขายให้อัตโนมัติตามลำดับถัดไป
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="supplier-name">
                      ชื่อผู้ขาย / บริษัท / โรงงาน
                    </label>
                    <input
                      id="supplier-name"
                      name="name"
                      required
                      defaultValue={initialSupplier?.name ?? ""}
                      className={getInputClass(false)}
                      placeholder="กรอกชื่อผู้ขาย"
                    />
                  </div>
                </SettingsPanelBody>
              </SettingsPanel>

              <CustomerAddressFields
                showFieldErrors={false}
                addressError={undefined}
                initialAddress={initialSupplier?.addressDraft}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={closeModal}
              className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#4A148C] px-5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(142, 36, 170,0.22)] transition hover:bg-[#4A148C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2.2} />
              บันทึกผู้ขาย
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
