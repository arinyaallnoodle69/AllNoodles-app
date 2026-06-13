"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, PencilLine, Save, Warehouse, X } from "lucide-react";
import { createWarehouseAction, updateWarehouseAction } from "@/app/settings/warehouses/actions";
import type { WarehouseActionState } from "@/app/settings/warehouses/actions";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
} from "@/components/settings/settings-ui";

import { CustomerAddressFields } from "@/components/settings/customer-address-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export type WarehouseMetadata = {
  address?: {
    street?: {
      details?: string;
    };
    districtCode?: string;
    postalCode?: string;
    provinceCode?: string;
    subdistrictCode?: string;
  };
};

export type WarehouseFormItem = {
  id: string;
  isActive: boolean;
  name: string;
  slug: string;
  sortOrder: number;
  address?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  metadata?: WarehouseMetadata | null;
};

type WarehouseFormProps = {
  initialWarehouse?: WarehouseFormItem;
  returnHref: string;
};

const initialState: WarehouseActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

export function WarehouseForm({ initialWarehouse, returnHref }: WarehouseFormProps) {
  const router = useRouter();
  const action = initialWarehouse
    ? updateWarehouseAction.bind(null, initialWarehouse.id)
    : createWarehouseAction;
  const [actionState, formAction, isPending] = useActionState(action, initialState);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const hasSubmittedRef = useRef(false);

  const fieldErrors =
    actionState && typeof actionState === "object" && "fieldErrors" in actionState
      ? (actionState.fieldErrors ?? initialState.fieldErrors)
      : initialState.fieldErrors;
  const message =
    actionState && typeof actionState === "object" && "message" in actionState
      ? (actionState.message ?? initialState.message)
      : initialState.message;
  const status =
    actionState && typeof actionState === "object" && "status" in actionState
      ? (actionState.status ?? initialState.status)
      : initialState.status;

  const state = {
    fieldErrors,
    message,
    status,
  };

  const isEditMode = Boolean(initialWarehouse);

  function closeModal() {
    router.replace(returnHref);
  }

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (state.status === "success") {
      handleSuccess();
    }
  }, [state.status]);

  const showFeedback = hasSubmitted && state.status !== "idle";
  const showFieldErrors = hasSubmitted && state.status === "error";

  const initialAddressDraft = initialWarehouse?.metadata?.address
    ? {
        addressDetails: initialWarehouse.metadata.address.street?.details ?? "",
        districtCode: initialWarehouse.metadata.address.districtCode ?? "",
        postalCode: initialWarehouse.metadata.address.postalCode ?? "",
        provinceCode: initialWarehouse.metadata.address.provinceCode ?? "",
        subdistrictCode: initialWarehouse.metadata.address.subdistrictCode ?? "",
      }
    : initialWarehouse?.address
      ? {
          addressDetails: initialWarehouse.address,
          districtCode: "",
          postalCode: initialWarehouse.postalCode ?? "",
          provinceCode: "",
          subdistrictCode: "",
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-[0_8px_24px_rgba(26,26,26,0.12)] animate-fade-in">
        <div className="flex items-start justify-between gap-4 border-b border-[#e8e8e8] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.7px] text-[#636363]">
              {isEditMode ? "แก้ไขคลัง" : "เพิ่มคลัง"}
            </p>
            <div className="mt-1.5 flex items-center gap-2.5 text-[#1a1a1a]">
              {isEditMode ? (
                <PencilLine className="h-6 w-6 text-[#8E24AA]" strokeWidth={2} />
              ) : (
                <CirclePlus className="h-6 w-6 text-[#8E24AA]" strokeWidth={2} />
              )}
              <h3 className="text-2xl font-semibold tracking-tight">
                {isEditMode ? "แก้ไขข้อมูลคลัง" : "คลังใหม่"}
              </h3>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={closeModal}
            className="h-10 w-10 rounded-md border border-[#e8e8e8] text-[#636363] hover:bg-[#f7f7f7] hover:text-[#1a1a1a] transition"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </Button>
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
                className={`rounded-md border px-4 py-3 text-sm ${
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-6">
              <SettingsPanel className="border-[#e8e8e8] shadow-none">
                <SettingsPanelHeader
                  icon="warehouse"
                  title="ข้อมูลคลัง"
                  description={isEditMode && initialWarehouse ? `คลังรหัส ${initialWarehouse.slug.toUpperCase()}` : "กรอกชื่อคลังสินค้า โดยระบบจะสร้างรหัสคลังให้อัตโนมัติ (เช่น WH01, WH02)"}
                />
                <SettingsPanelBody className="grid grid-cols-1 gap-5">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="warehouse-name" className="text-[#3d3d3d] text-sm font-semibold">
                      ชื่อคลัง
                    </Label>
                    <div className="relative">
                      <Warehouse className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#c2c2c2]" />
                      <Input
                        id="warehouse-name"
                        name="name"
                        required
                        defaultValue={initialWarehouse?.name ?? ""}
                        placeholder="เช่น คลังหลัก, คลังต่างจังหวัด"
                        className={`pl-10 h-11 rounded-md bg-white border-[#e8e8e8] focus-visible:ring-2 focus-visible:ring-[#8E24AA]/20 focus-visible:border-[#8E24AA] text-sm text-[#1a1a1a] placeholder:text-[#c2c2c2] ${
                          showFieldErrors && fieldErrors?.name ? "border-red-300 focus-visible:ring-red-200 focus-visible:border-red-500" : ""
                        }`}
                      />
                    </div>
                    {showFieldErrors && fieldErrors?.name ? (
                      <p className="text-xs text-red-500">{fieldErrors.name}</p>
                    ) : null}
                  </div>
                </SettingsPanelBody>
              </SettingsPanel>

              <Separator className="bg-[#e8e8e8]" />

              <CustomerAddressFields
                addressError={fieldErrors?.address}
                initialAddress={initialAddressDraft}
                showFieldErrors={showFieldErrors}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#e8e8e8] bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={closeModal}
              className="h-11 rounded-md border border-[#e8e8e8] text-[#636363] hover:bg-[#f7f7f7] transition px-5 font-semibold text-sm tracking-[0.5px] uppercase"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={isPending}
              className="h-11 inline-flex items-center gap-2 rounded-md bg-[#8E24AA] hover:bg-[#8E24AA] text-white px-6 font-semibold text-sm tracking-[0.7px] uppercase shadow-[0_2px_8px_rgba(142, 36, 170,0.18)] transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4.5 w-4.5" strokeWidth={2} />
              {isEditMode ? "บันทึกการแก้ไข" : "บันทึกคลัง"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
