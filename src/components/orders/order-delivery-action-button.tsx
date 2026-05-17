"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, ReceiptText, X } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import { fetchIncomingOrderDetailAction } from "@/app/orders/incoming/actions";
import { RECEIPT_EXPORT_WIDTH } from "@/app/order/customer/components/order-receipt-constants";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";
import { PrintStoreDeliveryButton } from "@/components/orders/print-store-delivery-button";
import type { OrderDetailData } from "@/lib/orders/detail";
import { fmtDateTH } from "@/lib/utils/date";

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

type OrderDeliveryActionButtonProps = {
  customerId: string;
  customerName?: string;
  date: string;
  iconOnly?: boolean;
  label?: string;
  orderId?: string;
};

export function OrderDeliveryActionButton({
  customerId,
  customerName,
  date,
  iconOnly = false,
  label = "ดูใบยืนยัน",
  orderId,
}: OrderDeliveryActionButtonProps) {
  const [isTouchLayout, setIsTouchLayout] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<OrderDetailData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchLayout(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const receiptItems = useMemo(
    () =>
      (detail?.items ?? []).map((item) => ({
        lineTotal: item.lineTotal,
        name: item.productName,
        quantity: item.quantity,
        saleUnitLabel: formatDisplayUnit(item.unit),
        unitPrice: item.unitPrice,
      })),
    [detail],
  );

  async function openReceipt() {
    if (isLoading || !orderId || !customerName) return;

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await fetchIncomingOrderDetailAction(orderId);
      if (result.error || !result.detail) {
        setErrorMessage(result.error ?? "โหลดใบยืนยันคำสั่งซื้อไม่สำเร็จ");
        return;
      }
      setDetail(result.detail);
      setIsOpen(true);
    } catch {
      setErrorMessage("โหลดใบยืนยันคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveReceiptAsImage() {
    if (!receiptCardRef.current || isSaving) return;

    setIsSaving(true);
    let tempContainer: HTMLDivElement | null = null;
    try {
      const outerPadding = 24;
      const target = receiptCardRef.current;

      tempContainer = document.createElement("div");
      tempContainer.style.position = "fixed";
      tempContainer.style.left = "-10000px";
      tempContainer.style.top = "0";
      tempContainer.style.padding = `${outerPadding}px`;
      tempContainer.style.background = "#ffffff";
      tempContainer.style.zIndex = "-1000";
      tempContainer.style.width = `${RECEIPT_EXPORT_WIDTH + outerPadding * 2}px`;

      const clone = target.cloneNode(true) as HTMLDivElement;
      clone.style.width = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.minWidth = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.maxWidth = "none";
      clone.style.margin = "0";
      clone.style.transform = "none";

      tempContainer.appendChild(clone);
      document.body.appendChild(tempContainer);

      await document.fonts.ready;
      const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(document.body);
      const dataUrl = await htmlToImage.toPng(tempContainer, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        fontEmbedCSS,
        pixelRatio: 2,
        width: RECEIPT_EXPORT_WIDTH + outerPadding * 2,
        height: tempContainer.scrollHeight,
      });

      const downloadLink = document.createElement("a");
      downloadLink.href = dataUrl;
      downloadLink.download = `TYNoodle-${detail?.orderNumber ?? "order"}.png`;
      downloadLink.rel = "noopener";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      console.error("Save image error:", error);
      setErrorMessage("บันทึกรูปใบยืนยันไม่สำเร็จ");
    } finally {
      if (tempContainer && document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
      setIsSaving(false);
    }
  }

  if (!isTouchLayout) {
    return (
      <PrintStoreDeliveryButton
        date={date}
        customerId={customerId}
        label="พิมพ์ใบส่งของ"
        iconOnly={iconOnly}
      />
    );
  }

  if (!orderId || !customerName) {
    return (
      <PrintStoreDeliveryButton
        date={date}
        customerId={customerId}
        label="พิมพ์ใบส่งของ"
        iconOnly={iconOnly}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openReceipt}
        disabled={isLoading}
        aria-label={label}
        title={label}
        className={[
          "inline-flex items-center justify-center border border-[#003366] bg-[#003366] text-white transition hover:bg-[#002952] active:scale-95 disabled:opacity-50",
          iconOnly ? "size-10 shrink-0 rounded-full p-0 leading-none" : "min-h-9 w-full gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
        ].join(" ")}
      >
        {isLoading ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
        ) : (
          <ReceiptText className="h-4.5 w-4.5" strokeWidth={2.2} />
        )}
        {iconOnly ? null : isLoading ? "กำลังโหลด..." : label}
      </button>

      {mounted && isOpen && detail
        ? createPortal(
            <div
              className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                className="relative w-full max-w-[480px] animate-in zoom-in-95 duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute -top-10 right-0 z-[510] flex items-center gap-2.5 py-2 text-white transition-opacity hover:opacity-80"
                >
                  <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                  <span className="text-[14px] font-black tracking-tight md:text-[15px]">ปิดหน้าต่าง</span>
                </button>

                <div className="scrollbar-hide max-h-[85vh] overflow-y-auto">
                  <div className="bg-white text-black shadow-2xl" ref={receiptCardRef}>
                    <div className="px-6 py-6">
                      <div className="mb-2 flex justify-end">
                        <Image
                          src="/ty-noodles-logo.png"
                          alt="T&Y Noodle"
                          width={48}
                          height={48}
                          className="object-contain"
                        />
                      </div>

                      <div className="mb-4 text-center">
                        <div className="text-[11px] leading-relaxed text-slate-500">
                          T&Y Noodle - ใบยืนยันคำสั่งซื้อ
                        </div>
                        <div className="mt-0.5 text-[14px] font-black leading-tight">
                          เลขที่ออเดอร์: {detail.orderNumber}
                        </div>
                        <div className="mt-1 text-[12px] leading-relaxed text-slate-500">
                          {fmtDateTH(detail.createdAt)}
                        </div>
                      </div>

                      <div className="mb-4 h-[2px] bg-black" />

                      <div className="mb-3">
                        <span className="text-[12px] font-bold">ชื่อลูกค้า:</span>
                        <span className="text-[12px]"> {customerName}</span>
                      </div>

                      <div className="grid grid-cols-[1fr_45px_40px_65px] gap-2 border-b border-[#cccccc] py-2">
                        <span className="text-left text-[12px] font-black">สินค้า</span>
                        <span className="text-center text-[12px] font-black">จำนวน</span>
                        <span className="text-center text-[12px] font-black">หน่วย</span>
                        <span className="text-right text-[12px] font-black">รวม</span>
                      </div>

                      <div className="divide-y divide-[#cccccc]">
                        {receiptItems.map((item, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-[1fr_45px_40px_65px] items-center gap-2 py-3"
                          >
                            <div className="line-clamp-2 text-[11px] leading-[1.4]">{item.name}</div>
                            <div className="text-center text-[12px] font-medium">
                              {formatQuantity(item.quantity)}
                            </div>
                            <div className="text-center text-[12px] text-slate-500">{item.saleUnitLabel}</div>
                            <div className="text-right text-[12px] font-bold">
                              {formatCurrency(item.lineTotal)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-4 mt-4 h-[1px] bg-[#cccccc]" />

                      <div className="mb-6 flex items-center justify-between px-1">
                        <span className="text-[13px] font-black">ยอดรวมทั้งหมด:</span>
                        <span className="text-[16px] font-black text-[#0051d5] underline decoration-double decoration-slate-300 underline-offset-4">
                          {formatCurrency(detail.totalAmount)}
                        </span>
                      </div>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={saveReceiptAsImage}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#0051d5] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#003d99] disabled:opacity-60"
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          บันทึกรูป
                        </button>
                      </div>

                      {errorMessage ? (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                          {errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
