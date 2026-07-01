import { Suspense } from "react";
import Link from "next/link";
import { AutoPrint, PackingListPrintButton } from "@/app/orders/packing-list/preview/print-button";
import { PageLoader } from "@/components/page-loader";
import { FactoryOrderSheetLayout } from "@/components/print/factory-order-sheet-layout";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getFactoryOrderSheetData } from "@/lib/orders/vehicle-product-summary";

export const metadata = { title: "พิมพ์ใบสั่งของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
  }>;
};

export default async function FactoryOrderSheetWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <FactoryOrderSheetPage searchParams={searchParams} />
    </Suspense>
  );
}

async function FactoryOrderSheetPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate ?? date;
  const autoprint = params.autoprint === "1";
  const factorySheets = await getFactoryOrderSheetData(session.organizationId, date, endDate);
  const hasData = factorySheets.length > 0;
  const firstSheet = factorySheets[0];
  const dateLabel = firstSheet?.dateLabel ?? (date === endDate ? date : `${date} - ${endDate}`);
  const vehicleCount = new Set(factorySheets.flatMap((sheet) => sheet.vehicles.map((vehicle) => vehicle.id ?? "__unassigned__"))).size;

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <style>{`
        @media screen and (max-width: 767px) {
          .vehicle-summary-toolbar {
            position: sticky !important;
            top: 8px !important;
            left: auto !important;
            transform: none !important;
            z-index: 80 !important;
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            margin: 8px 6px 0 !important;
            padding: 8px 10px !important;
            gap: 8px !important;
            justify-content: space-between !important;
          }

          .vehicle-summary-toolbar__meta {
            display: none !important;
          }

          .vehicle-summary-toolbar__actions {
            min-width: 0;
          }

          .vehicle-summary-page .packing-print-container {
            padding-top: 8px !important;
          }
        }
      `}</style>

      <div
        className="no-print vehicle-summary-toolbar"
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          background: "white",
          padding: "10px 14px",
          borderRadius: "14px",
          boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
          position: "fixed",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif',
          width: "max-content",
          maxWidth: "calc(100vw - 24px)",
          border: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: 800, color: "#4A148C" }}>ใบสั่งของ</span>
        <span className="vehicle-summary-toolbar__meta" style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>
          {dateLabel} · {vehicleCount} รถ · {factorySheets.length} ใบ
        </span>
        <div className="vehicle-summary-toolbar__actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
          <PackingListPrintButton
            unassignedStores={[]}
            dateLabel={dateLabel}
            hidePrintOnMobile={false}
            documentTitle="ใบสั่งของ"
            printButtonText="พิมพ์ใบสั่งของ"
          />
        </div>
        <Link
          href="/orders/incoming"
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#ef4444",
            textDecoration: "none",
            marginLeft: "4px",
            padding: "6px 12px",
            borderRadius: "8px",
            background: "#fef2f2",
          }}
        >
          กลับ
        </Link>
      </div>

      {!hasData ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif',
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีรายการสินค้าผลิตสดสำหรับใบสั่งของนี้</p>
          <Link href="/orders/incoming" style={{ marginTop: "8px", color: "#4A148C", fontSize: "14px" }}>
            กลับหน้ารายการออเดอร์
          </Link>
        </div>
      ) : (
        <div className="vehicle-summary-page packing-print-container">
          {factorySheets.map((sheet, index) => (
            <FactoryOrderSheetLayout key={`${sheet.factoryName ?? "factory"}-${index}`} data={sheet} />
          ))}
        </div>
      )}
    </>
  );
}
