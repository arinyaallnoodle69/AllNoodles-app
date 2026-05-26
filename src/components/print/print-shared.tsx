import type { CSSProperties } from "react";
import { bahtText } from "@/lib/format/baht-text";

export const PRINT_ORGANIZATION_NAME = "เส้นรังนก (T&Y Noodle)";
export const SHEET_WIDTH_MM = 228.6;
export const SHEET_HEIGHT_MM = 279.4;
export const HALF_SHEET_HEIGHT_MM = 139.7;
export const NOTE_PADDING = "6mm 8mm";

type DividerStyle = "solid" | "dotted" | "none";
type RightMetaItem = { label: string; value: string };

function createDottedEdgeStyle({
  top = false,
  bottom = false,
  color = "black",
}: {
  top?: boolean;
  bottom?: boolean;
  color?: string;
}): CSSProperties {
  const backgrounds: string[] = [];
  const positions: string[] = [];

  if (top) {
    backgrounds.push(`radial-gradient(circle, ${color} 1.1px, transparent 1.25px)`);
    positions.push("left top");
  }

  if (bottom) {
    backgrounds.push(`radial-gradient(circle, ${color} 1.1px, transparent 1.25px)`);
    positions.push("left bottom");
  }

  return {
    backgroundImage: backgrounds.join(", "),
    backgroundPosition: positions.join(", "),
    backgroundRepeat: backgrounds.map(() => "repeat-x").join(", "),
    backgroundSize: backgrounds.map(() => "10px 2px").join(", "),
  };
}

function dottedHorizontalRuleStyle(color: string): CSSProperties {
  return {
    height: "2px",
    width: "100%",
    ...createDottedEdgeStyle({ top: true, color }),
  };
}

export function formatDate(iso: string) {
  if (!iso || iso === "null") return iso;
  try {
    const dateValue = iso.includes("T") ? iso : `${iso}T00:00:00`;
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(dateValue));
  } catch {
    return iso;
  }
}

export function formatDateShort(iso: string) {
  if (!iso || iso === "null") return iso;
  try {
    const dateValue = iso.includes("T") ? iso : `${iso}T00:00:00`;
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(new Date(dateValue));
  } catch {
    return iso;
  }
}

export function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0.00";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

export function chunkItems<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < arr.length; index += size) {
    chunks.push(arr.slice(index, index + size));
  }
  return chunks;
}

export function PrintDocHeader({
  orgName,
  orgAddress,
  orgPhone,
  title,
  docNumber,
  docDate,
  pageLabel,
  extraMeta,
  dividerStyle = "solid",
  docMetaFontSize = "8.8pt",
}: {
  orgName: string;
  orgAddress?: string | null;
  orgPhone?: string | null;
  title: string;
  docNumber?: string;
  docDate: string;
  pageLabel?: string;
  extraMeta?: RightMetaItem[];
  dividerStyle?: DividerStyle;
  docMetaFontSize?: string;
}) {
  const headerStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.5mm",
    paddingBottom: dividerStyle === "none" ? "1.2mm" : "3mm",
  };

  if (dividerStyle === "solid") {
    headerStyle.borderBottom = "1.5px solid black";
  } else if (dividerStyle === "dotted") {
    Object.assign(headerStyle, createDottedEdgeStyle({ bottom: true, color: "black" }));
  }

  return (
    <div style={headerStyle}>
      <div>
        <p style={{ fontWeight: 800, fontSize: "13pt", color: "#1e3a5f", lineHeight: 1.2 }}>
          {orgName}
        </p>
        {orgAddress ? (
          <p style={{ fontSize: "8.2pt", color: "#64748b", marginTop: "1px" }}>{orgAddress}</p>
        ) : null}
        {orgPhone ? (
          <p style={{ fontSize: "8.2pt", color: "#64748b", marginTop: "1px" }}>โทร {orgPhone}</p>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <p style={{ fontSize: "16pt", fontWeight: 900, color: "#1e3a5f", letterSpacing: "0.05em" }}>
          {title}
        </p>
      </div>

      <div style={{ textAlign: "right", minWidth: "95px" }}>
        {docNumber ? (
          <p style={{ fontSize: docMetaFontSize, color: "#1e3a5f", lineHeight: 1.15 }}>
            <span style={{ color: "#64748b" }}>เลขที่ </span>
            <span style={{ fontWeight: 800, fontFamily: "monospace" }}>{docNumber}</span>
          </p>
        ) : null}
        <p
          style={{
            fontSize: docMetaFontSize,
            color: "#1e3a5f",
            lineHeight: 1.15,
            marginTop: docNumber ? "2px" : undefined,
          }}
        >
          <span style={{ color: "#64748b" }}>วันที่ </span>
          <span style={{ fontWeight: 700 }}>{formatDate(docDate)}</span>
        </p>
        {extraMeta?.map((item) => (
          <p key={item.label} style={{ fontSize: "8.2pt", color: "#1e3a5f", marginTop: "2px" }}>
            <span style={{ color: "#64748b" }}>{item.label} </span>
            <span style={{ fontWeight: 700 }}>{item.value}</span>
          </p>
        ))}
        {pageLabel ? (
          <p style={{ fontSize: "7.8pt", color: "#94a3b8", marginTop: "2px" }}>{pageLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

export function PrintCustomerRow({
  customer,
}: {
  customer: { name: string; code: string; address: string };
}) {
  return (
    <div style={{ marginBottom: "1.5mm", padding: "0" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
        <span style={{ fontSize: "13.5pt", color: "black", flexShrink: 0 }}>ลูกค้า</span>
        <span
          style={{ fontFamily: "monospace", fontSize: "13.5pt", color: "black", fontWeight: 700 }}
        >
          {customer.code}
        </span>
        <span style={{ fontWeight: 700, fontSize: "13.5pt", color: "black" }}>{customer.name}</span>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline", marginTop: "1px" }}>
        <span style={{ fontSize: "10.5pt", color: "black", flexShrink: 0 }}>ที่อยู่</span>
        <span style={{ fontSize: "10.5pt", color: "black" }}>{customer.address}</span>
      </div>
    </div>
  );
}

export function PrintTotalRow({
  totalAmount,
  dividerStyle = "solid",
  showBottomBorder = true,
}: {
  totalAmount: number;
  dividerStyle?: Exclude<DividerStyle, "none">;
  showBottomBorder?: boolean;
}) {
  const containerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: "2mm",
    paddingBottom: "2mm",
    marginBottom: "2mm",
  };

  if (dividerStyle === "solid") {
    containerStyle.borderTop = "1.5px solid black";
    if (showBottomBorder) {
      containerStyle.borderBottom = "1.5px solid black";
    }
  } else {
    Object.assign(
      containerStyle,
      createDottedEdgeStyle({
        top: true,
        bottom: showBottomBorder,
        color: "black",
      }),
    );
  }

  return (
    <div style={containerStyle}>
      <p style={{ fontSize: "9.2pt", color: "black" }}>{bahtText(totalAmount)}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6mm" }}>
        <p style={{ fontSize: "9.2pt", fontWeight: 700, color: "black" }}>รวมทั้งสิ้น</p>
        <p style={{ fontSize: "10.8pt", fontWeight: 800, color: "black", fontFamily: "monospace" }}>
          {fmt(totalAmount)}
        </p>
      </div>
    </div>
  );
}

export function PrintSignatureBlock({
  notes,
  leftLabel,
  rightLabel,
  lineStyle = "solid",
}: {
  notes?: string | null;
  leftLabel: string;
  rightLabel: string;
  lineStyle?: Exclude<DividerStyle, "none">;
}) {
  const signatureLineStyle =
    lineStyle === "dotted"
      ? dottedHorizontalRuleStyle("#334155")
      : { borderTop: "1px solid #334155", width: "100%" };

  return (
    <div style={{ display: "flex", gap: "6mm", alignItems: "flex-start" }}>
      <div style={{ flex: 1, minHeight: "14mm", paddingTop: "1mm" }}>
        <p style={{ fontSize: "10.5pt", lineHeight: 1.5, color: "black", fontWeight: 600 }}>
          <span style={{ fontWeight: 700 }}>หมายเหตุ: </span>
          {notes?.trim() ? notes : "-"}
        </p>
      </div>
      <div style={{ width: "1px", background: "#e2e8f0", alignSelf: "stretch" }} />
      <div style={{ flex: 1, display: "flex", gap: "4mm" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: "8.8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>
            {leftLabel}
          </p>
          <div style={signatureLineStyle} />
        </div>
        <div style={{ width: "1px", background: "#e2e8f0" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: "8.8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>
            {rightLabel}
          </p>
          <div style={signatureLineStyle} />
        </div>
      </div>
    </div>
  );
}
