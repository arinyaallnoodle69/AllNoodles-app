import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDeliveryNotePrintData, type DeliveryNotePrintData } from "@/lib/delivery/print";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { PrintButton } from "./print-button";

export const metadata = { title: "พิมพ์ใบส่งของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    customer_ids?: string;
  }>;
};

export default async function DeliveryNotePreviewPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date;
  const customerIdsStr = params.customer_ids;

  if (!date || !customerIdsStr) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-bold text-slate-900">ไม่มีข้อมูลสำหรับพิมพ์</p>
        <a href="/orders/incoming" className="mt-4 inline-block text-[#003366] font-bold">กลับหน้าออเดอร์</a>
      </div>
    );
  }

  const customerIds = customerIdsStr.split(",");
  const supabase = getSupabaseAdmin();

  // Fetch all delivery notes for these customers on this date
  const { data: dns, error } = await supabase
    .from("delivery_notes")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("delivery_date", date)
    .in("customer_id", customerIds)
    .neq("status", "cancelled")
    .order("customer_id", { ascending: true });

  if (error || !dns || dns.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-bold text-slate-900">ไม่พบใบส่งของสำหรับร้านที่เลือกในวันที่ {date}</p>
        <p className="mt-2 text-sm text-slate-500">โปรดยืนยันออเดอร์เพื่อสร้างใบส่งของก่อนพิมพ์</p>
        <a href="/orders/incoming" className="mt-4 inline-block text-[#003366] font-bold">กลับหน้าออเดอร์</a>
      </div>
    );
  }

  // Fetch full print data for each DN
  const printDataResults = await Promise.all(
    dns.map((dn) => getDeliveryNotePrintData(session.organizationId, dn.id))
  );

  const validPrintData = printDataResults.filter((d): d is DeliveryNotePrintData => d !== null);

  if (validPrintData.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-bold text-slate-900">ไม่สามารถโหลดข้อมูลการพิมพ์ได้</p>
        <a href="/orders/incoming" className="mt-4 inline-block text-[#003366] font-bold">กลับหน้าออเดอร์</a>
      </div>
    );
  }

  return (
    <>
      <div className="no-print flex items-center gap-3 p-4 bg-white border-b sticky top-0 z-50">
        <div className="rounded-xl bg-[#003366]/10 px-4 py-2 text-sm font-bold text-[#003366]">
          พิมพ์ใบส่งของ - {validPrintData.length} ร้านค้า
        </div>
        <PrintButton />
        <a href="/orders/incoming" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95">
          กลับ
        </a>
      </div>

      <div className="bg-slate-50 min-h-screen py-10 print:py-0 print:bg-white">
        <DeliveryNoteLayout dns={validPrintData} showIntermediateFooter />
      </div>
    </>
  );
}
