import type { CSSProperties, RefObject } from "react";
import type { ReceiptItem } from "@/app/order/customer/order-client-types";

const RECEIPT_DISPLAY_MAX_WIDTH = 620;

export function OrderReceiptCard({
  receiptRef,
  orderNumber,
  orderDate,
  storeName,
  items,
  totalAmount,
}: {
  receiptRef?: RefObject<HTMLDivElement | null>;
  orderNumber: string;
  orderDate: string;
  storeName: string;
  items: ReceiptItem[];
  totalAmount: number;
}) {
  void totalAmount;

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
      hour12: false,
    }).format(new Date(iso));

  const FONT = "'Sarabun','Noto Sans Thai',sans-serif";
  const COL = "1fr 60px 48px";
  const SIDE_PADDING = "20px";
  const RULE_MARGIN = "0 16px";
  const LINE: CSSProperties = { borderTop: "1px solid #cccccc", margin: RULE_MARGIN };
  const LINE_THICK: CSSProperties = { borderTop: "2px solid #000000", margin: RULE_MARGIN };

  return (
    <div
      ref={receiptRef}
      style={{
        width: "100%",
        minWidth: 0,
        maxWidth: `min(calc(100vw - 24px), ${RECEIPT_DISPLAY_MAX_WIDTH}px)`,
        flexShrink: 0,
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        fontFamily: FONT,
        color: "#000000",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/512x512.png"
          alt="All Noodles"
          style={{ objectFit: "contain", display: "inline-block", width: "56px", height: "56px" }}
        />
      </div>

      <div style={{ textAlign: "center", padding: `0 ${SIDE_PADDING} 10px` }}>
        <div style={{ fontSize: "12px", lineHeight: 1.6 }}>All Noodles - ใบยืนยันคำสั่งซื้อ</div>
        <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.3, marginTop: "2px" }}>
          เลขที่ใบจัดส่ง: {orderNumber}
        </div>
        <div style={{ fontSize: "13px", marginTop: "4px", lineHeight: 1.6 }}>
          {fmtDate(orderDate)} | {fmtTime(orderDate)}
        </div>
      </div>

      <div style={LINE_THICK} />

      <div style={{ padding: `10px ${SIDE_PADDING} 12px` }}>
        <span style={{ fontWeight: 700, fontSize: "14px" }}>ร้านค้า:</span>
        <span style={{ fontSize: "14px" }}> {storeName}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: COL, padding: `6px ${SIDE_PADDING}`, gap: "0 8px" }}>
        {(["สินค้า", "จำนวน", "หน่วย"] as const).map((label, index) => (
          <span
            key={label}
            style={{
              fontSize: "14px",
              fontWeight: 800,
              textAlign: index === 0 ? "left" : "right",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div style={LINE} />

      {items.map((item, index) => (
        <div key={`${item.name}-${item.saleUnitLabel}-${index}`}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: COL,
              padding: `10px ${SIDE_PADDING}`,
              gap: "0 8px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                lineHeight: 1.4,
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflow: "visible",
              }}
            >
              {item.name}
            </div>
            <div style={{ fontSize: "14px", textAlign: "right" }}>
              {item.quantity.toLocaleString("th-TH")}
            </div>
            <div style={{ fontSize: "14px", textAlign: "right" }}>
              {item.saleUnitLabel}
            </div>
          </div>
          <div style={LINE} />
        </div>
      ))}

      <div style={{ padding: `36px ${SIDE_PADDING} 32px`, textAlign: "center" }}>
        <div style={{ fontSize: "14px", fontWeight: 800, lineHeight: 1.6 }}>All Noodles</div>
        <div style={{ fontSize: "13px", marginTop: "2px", lineHeight: 1.6 }}>ขอบคุณสำหรับการสั่งซื้อครับ</div>
      </div>
    </div>
  );
}
