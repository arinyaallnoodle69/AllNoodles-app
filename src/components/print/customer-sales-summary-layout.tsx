import { bahtText } from "@/lib/format/baht-text";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";

export type CustomerSalesSummaryStore = {
  customerCode: string;
  customerName: string;
  totalAmount: number;
  orderCount?: number;
};

export type CustomerSalesSummaryData = {
  vehicleId: string;
  vehicleName: string;
  dateLabel: string;
  printedAt: string;
  stores: CustomerSalesSummaryStore[];
  totalAmount: number;
  totalWeightGrams?: number;
  totalOrders?: number;
};

const money = (value: number) => value.toLocaleString("th-TH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function CustomerSalesSummaryLayout({
  data, pageScale = 1,
}: {
  data: CustomerSalesSummaryData;
  pageScale?: number;
}) {
  return (
    <div className="customer-sales-print-container">
      <style>{`
        .customer-sales-print-container { width:fit-content; margin:0 auto; }
        .customer-sales-sheet {
          box-sizing:border-box; width:210mm; padding:10mm 12mm;
          display:block; background:#fff; color:#000;
          font-family:var(--font-sarabun,var(--font-noto-sans-thai,sans-serif)),sans-serif;
          font-size:16px; line-height:1.55; text-align:left;
        }
        .customer-sales-sheet * { box-sizing:border-box; color:#000 !important; font-weight:600 !important; letter-spacing:normal !important; }
        .customer-sales-sheet strong, .customer-sales-sheet th { font-weight:700 !important; }
        .cs-heading { text-align:center; }
        .cs-brand { font-size:25px; font-weight:700 !important; margin-bottom:5px; }
        .customer-sales-sheet h1 { font-size:20px; line-height:1.5; font-weight:700 !important; margin:0; }
        .cs-meta { display:flex; justify-content:space-between; gap:12px; margin:18px 0 12px; padding-top:10px; border-top:1px solid #000; font-size:14px; }
        .cs-meta span { overflow-wrap:anywhere; }
        .cs-meta span:last-child { text-align:right; }
        .cs-table { border-collapse:collapse; table-layout:fixed; width:100%; font-size:16px; line-height:1.55; }
        .cs-table th { border-top:1px solid #000; border-bottom:1px solid #000; font-size:15px; padding:8px; text-align:left; }
        .cs-table td { padding:4px 8px; border-bottom:1px solid #d5d5d5; overflow-wrap:anywhere; vertical-align:top; }
        .cs-table th:first-child,.cs-table td:first-child { text-align:center; }
        .cs-table th:last-child,.cs-table td:last-child { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .cs-table td:last-child { font-weight:700 !important; }
        .cs-table .cs-empty { padding:30px 8px; text-align:center; }
        .cs-footer { margin-top:16px; break-inside:avoid; }
        .cs-summary { display:flex; justify-content:space-between; gap:20px; border-top:3px double #000; padding:12px 0; }
        .cs-summary-detail { flex:1; min-width:0; font-size:14px; overflow-wrap:anywhere; }
        .cs-summary-detail span { display:block; }
        .cs-baht { font-size:14px; margin-top:4px; }
        .cs-total { text-align:right; flex-shrink:0; }
        .cs-total span { display:block; font-size:15px; }
        .cs-total strong { display:block; font-size:25px; line-height:1.5; font-variant-numeric:tabular-nums; }
        .cs-footnote { padding-top:10px; border-top:1px solid #aaa; font-size:13px; }
        @media print {
          @page { size:A4 portrait; margin:0; }
          html,body { height:auto !important; overflow:visible !important; margin:0 !important; padding:0 !important; background:white !important; }
          body:has(.customer-sales-modal)>:not(.customer-sales-modal) { display:none !important; }
          .customer-sales-modal { position:static !important; display:block !important; height:auto !important; overflow:visible !important; background:white !important; animation:none !important; }
          .customer-sales-modal .no-print,.customer-sales-source { display:none !important; }
          .customer-sales-preview-body,.customer-sales-print-area,.customer-sales-print-container { display:block !important; padding:0 !important; margin:0 !important; width:100% !important; max-width:none !important; height:auto !important; overflow:visible !important; }
          .customer-sales-sheet { width:210mm !important; height:297mm !important; padding:10mm 12mm !important; zoom:1 !important; break-after:page; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
          .customer-sales-sheet:last-child { break-after:auto; }
          .cs-header { break-inside:avoid; break-after:avoid; }
          .cs-table thead { display:table-header-group; }
          .cs-table tr { break-inside:avoid; }
        }
      `}</style>
      <section className="customer-sales-sheet" data-customer-sales-report style={{ zoom: pageScale }}>
        <header className="cs-header">
          <div className="cs-heading">
            <div className="cs-brand">{PRINT_ORGANIZATION_NAME}</div>
            <h1>รายงานสรุปยอดขายตามลูกค้า</h1>
          </div>
          <div className="cs-meta">
            <span>วันที่รายการ <strong>{data.dateLabel}</strong></span>
            <span>สายรถ: <strong>{data.vehicleName}</strong> · หน่วย: บาท</span>
          </div>
        </header>
        <table className="cs-table">
          <colgroup><col style={{ width: "8%" }} /><col style={{ width: "18%" }} /><col style={{ width: "50%" }} /><col style={{ width: "24%" }} /></colgroup>
          <thead><tr><th scope="col">ลำดับ</th><th scope="col">รหัสลูกค้า</th><th scope="col">ชื่อลูกค้า</th><th scope="col">ยอดขาย (บาท)</th></tr></thead>
          <tbody>
            {data.stores.length ? data.stores.map((store, index) => (
              <tr key={index} data-store-row>
                <td>{index + 1}</td><td>{store.customerCode}</td><td>{store.customerName}</td><td>{money(store.totalAmount)}</td>
              </tr>
            )) : <tr><td colSpan={4} className="cs-empty">ไม่มีข้อมูลร้านค้าในรายการที่เลือก</td></tr>}
          </tbody>
        </table>
        <footer className="cs-footer">
          <div className="cs-summary">
            <div className="cs-summary-detail">
              <strong>{data.stores.length.toLocaleString("th-TH")} ร้านค้า{data.totalOrders ? ` · ${data.totalOrders.toLocaleString("th-TH")} ออเดอร์` : ""}</strong>
              {data.totalWeightGrams ? <span>น้ำหนักรวม {(data.totalWeightGrams / 1000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} กก.</span> : null}
              <span className="cs-baht">{bahtText(data.totalAmount)}</span>
            </div>
            <div className="cs-total"><span>ยอดขายรวมทั้งสิ้น</span><strong>{money(data.totalAmount)}</strong></div>
          </div>
          <div className="cs-footnote">พิมพ์เมื่อ {data.printedAt}</div>
        </footer>
      </section>
    </div>
  );
}
