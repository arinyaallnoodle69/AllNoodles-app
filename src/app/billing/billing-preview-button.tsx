"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import {
  HALF_SHEET_HEIGHT_MM,
  PRINT_ORGANIZATION_NAME,
  PrintCustomerRow,
  PrintDocHeader,
  PrintSignatureBlock,
  PrintTotalRow,
  SHEET_WIDTH_MM,
  fmt,
  formatDateShort,
} from "@/components/print/print-shared";

type DeliveryItem = {
  number: string;
  date: string;
  amount: number;
};

type BillingPreviewButtonProps = {
  customerName: string;
  customerCode: string;
  fromDate: string;
  toDate: string;
  deliveries: DeliveryItem[];
  totalAmount: number;
};

export function BillingPreviewButton({
  customerName,
  customerCode,
  fromDate,
  toDate,
  deliveries,
  totalAmount,
}: BillingPreviewButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [touchStartDist, setTouchStartDist] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const dummy = document.createElement("div");
      dummy.style.width = `${SHEET_WIDTH_MM}mm`;
      dummy.style.position = "absolute";
      dummy.style.visibility = "hidden";
      document.body.appendChild(dummy);
      const sheetWidth = dummy.offsetWidth;
      document.body.removeChild(dummy);

      if (containerWidth < sheetWidth && sheetWidth > 0) {
        setScale(containerWidth / sheetWidth);
      } else {
        setScale(1);
      }
    };

    const timer = setTimeout(updateScale, 100);
    window.addEventListener("resize", updateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateScale);
    };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY,
      );
      setTouchStartDist(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY,
      );
      const factor = dist / touchStartDist;

      setZoom((prev) => {
        const next = prev * factor;
        return Math.min(Math.max(next, 1), 3);
      });
      setTouchStartDist(dist);
    }
  };

  const handleTouchEnd = () => setTouchStartDist(0);

  const saveAsImage = async () => {
    if (!cardRef.current || isSaving) return;

    setIsSaving(true);
    let cloneHost: HTMLDivElement | null = null;
    try {
      const target = cardRef.current;
      const outerPadding = 24;

      cloneHost = document.createElement("div");
      cloneHost.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `padding:${outerPadding}px`,
        "margin:0",
        "background:#ffffff",
        "z-index:-1",
        "overflow:visible",
        "box-sizing:border-box",
      ].join(";");

      const clone = target.cloneNode(true) as HTMLDivElement;
      clone.style.margin = "0";
      clone.style.boxShadow = "none";
      clone.style.transform = "none";

      cloneHost.appendChild(clone);
      document.body.appendChild(cloneHost);

      const captureWidth = target.offsetWidth + outerPadding * 2;
      const captureHeight = target.offsetHeight + outerPadding * 2;

      await document.fonts.ready;
      const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(document.body);

      const dataUrl = await htmlToImage.toPng(cloneHost, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        fontEmbedCSS,
        pixelRatio: 2,
        width: captureWidth,
        height: captureHeight,
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `billing-${customerCode}-${fromDate}-to-${toDate}.png`;
      a.click();
    } catch (err) {
      console.error("Save image error:", err);
      setErrorMessage("ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
      if (cloneHost && cloneHost.parentNode) {
        cloneHost.parentNode.removeChild(cloneHost);
      }
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const finalScale = scale * zoom;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setZoom(1);
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#003366] px-4 py-2 text-xs font-black text-white transition hover:bg-[#002244] active:scale-95"
      >
        <FileText className="h-3.5 w-3.5" />
        ดูใบวางบิล
      </button>

      {mounted && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                className="relative w-full md:max-w-[900px] animate-in zoom-in-95 duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute -top-10 right-0 z-[510] flex items-center gap-2.5 py-2 text-white transition-opacity hover:opacity-80"
                >
                  <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                  <span className="text-[14px] font-black tracking-tight md:text-[15px]">ปิดหน้าต่าง</span>
                </button>

                <div
                  className="scrollbar-hide flex max-h-[80vh] w-full flex-col items-center overflow-auto"
                  ref={containerRef}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    style={{
                      width: `${SHEET_WIDTH_MM * finalScale}mm`,
                      height: `${HALF_SHEET_HEIGHT_MM * finalScale}mm`,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      ref={cardRef}
                      style={{
                        boxSizing: "border-box",
                        width: `${SHEET_WIDTH_MM}mm`,
                        height: `${HALF_SHEET_HEIGHT_MM}mm`,
                        padding: "6mm 8mm",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        background: "white",
                        transform: `scale(${finalScale})`,
                        transformOrigin: "top left",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    >
                      <PrintDocHeader
                        orgName={PRINT_ORGANIZATION_NAME}
                        orgAddress="-"
                        orgPhone="-"
                        title="ใบวางบิล"
                        docDate={today}
                      />

                      <PrintCustomerRow customer={{ code: customerCode, name: customerName, address: "-" }} />

                      <table
                        style={{
                          width: "100%",
                          tableLayout: "fixed",
                          borderCollapse: "collapse",
                          fontSize: "8.5pt",
                          marginBottom: "1mm",
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                padding: "1mm 2mm",
                                color: "black",
                                borderTop: "1.5px solid black",
                                borderBottom: "1.5px solid black",
                                width: "6%",
                                textAlign: "center",
                              }}
                            >
                              ลำดับ
                            </th>
                            <th
                              style={{
                                padding: "1mm 2mm",
                                color: "black",
                                borderTop: "1.5px solid black",
                                borderBottom: "1.5px solid black",
                                width: "40%",
                                textAlign: "center",
                              }}
                            >
                              เลขที่ใบจัดส่ง
                            </th>
                            <th
                              style={{
                                padding: "1mm 2mm",
                                color: "black",
                                borderTop: "1.5px solid black",
                                borderBottom: "1.5px solid black",
                                width: "21%",
                                textAlign: "center",
                              }}
                            >
                              วันที่
                            </th>
                            <th
                              style={{
                                padding: "1mm 2mm",
                                color: "black",
                                borderTop: "1.5px solid black",
                                borderBottom: "1.5px solid black",
                                width: "18%",
                                textAlign: "right",
                              }}
                            >
                              ยอดรวม
                            </th>
                            <th
                              style={{
                                padding: "1mm 3mm",
                                color: "black",
                                borderTop: "1.5px solid black",
                                borderBottom: "1.5px solid black",
                                width: "15%",
                                textAlign: "left",
                              }}
                            >
                              หมายเหตุ
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.map((item, index) => (
                            <tr key={item.number}>
                              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>{index + 1}</td>
                              <td
                                style={{
                                  padding: "0.8mm 2mm",
                                  textAlign: "center",
                                  fontFamily: "monospace",
                                  fontSize: "8pt",
                                  fontWeight: 700,
                                  color: "#003366",
                                }}
                              >
                                {item.number}
                              </td>
                              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>
                                {formatDateShort(item.date)}
                              </td>
                              <td style={{ padding: "0.8mm 2mm", textAlign: "right", fontWeight: 700, color: "black" }}>
                                {fmt(item.amount)}
                              </td>
                              <td style={{ padding: "0.8mm 3mm", fontSize: "7.5pt", color: "#475569" }}>-</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ flex: 1 }} />
                      <PrintTotalRow totalAmount={totalAmount} />
                      <PrintSignatureBlock leftLabel="ผู้รับวางบิล" rightLabel="ผู้วางบิล" />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={saveAsImage}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0051d5] px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#003d99] disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      บันทึกรูป
                    </button>
                  </div>
                  <span className="text-xs text-white/60">สามารถใช้นิ้วซูมเข้า-ออกได้</span>
                </div>

                {errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
