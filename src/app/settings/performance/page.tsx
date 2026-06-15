import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Gauge, HardDrive, TableProperties, AlertCircle, CheckCircle, Activity } from "lucide-react";

export const metadata = { title: "ประสิทธิภาพระบบ" };

type DbStatRow = {
  schemaname: string;
  table_name: string;
  row_count: number;
  total_size: string;
  size_bytes: number;
  index_scans: number;
  sequential_scans: number;
};

type IndexStatRow = {
  schemaname: string;
  table_name: string;
  index_name: string;
  index_size: string;
  index_scans: number;
};

type VitalsRow = {
  event_name: string;
  duration_ms: number;
};

// Formatter for bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + (sizes[i] ?? "");
}

async function getPerformanceTelemetry() {
  const admin = getSupabaseAdmin();

  const [dbStatsResult, indexStatsResult, vitalsResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin.from("system_database_stats" as any).select("*"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin.from("system_index_stats" as any).select("*"),
    admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("system_performance_logs" as any)
      .select("event_name, duration_ms")
      .eq("event_type", "web_vital")
      .order("created_at", { ascending: false })
      .limit(1200),
  ]);

  return {
    dbStats: (dbStatsResult.data || []) as unknown as DbStatRow[],
    indexStats: (indexStatsResult.data || []) as unknown as IndexStatRow[],
    vitalsData: (vitalsResult.data || []) as unknown as VitalsRow[],
  };
}

export default async function SystemPerformancePage() {
  await requireAppRole("admin");

  const { dbStats, vitalsData } = await getPerformanceTelemetry();

  // 1. Calculate General DB Stats
  const totalSizeBytes = dbStats.reduce((sum, row) => sum + (row.size_bytes || 0), 0);
  const totalRows = dbStats.reduce((sum, row) => sum + (row.row_count || 0), 0);
  const tableCount = dbStats.length;

  const totalIndexScans = dbStats.reduce((sum, row) => sum + (row.index_scans || 0), 0);
  const totalSeqScans = dbStats.reduce((sum, row) => sum + (row.sequential_scans || 0), 0);
  const totalScans = totalIndexScans + totalSeqScans;
  const indexHitRate = totalScans > 0 ? Math.round((totalIndexScans / totalScans) * 100) : 100;

  // 2. Process Client Web Vitals Latencies
  const vitalsAverages: Record<string, { sum: number; count: number; avg: number }> = {};
  vitalsData.forEach((row) => {
    const name = row.event_name;
    if (!vitalsAverages[name]) {
      vitalsAverages[name] = { sum: 0, count: 0, avg: 0 };
    }
    vitalsAverages[name].sum += Number(row.duration_ms);
    vitalsAverages[name].count += 1;
  });

  Object.keys(vitalsAverages).forEach((key) => {
    const item = vitalsAverages[key];
    if (item && item.count > 0) {
      item.avg = Math.round(item.sum / item.count);
    }
  });

  const ttfb = vitalsAverages["TTFB"]?.avg ?? 0;
  const fcp = vitalsAverages["FCP"]?.avg ?? 0;
  const lcp = vitalsAverages["LCP"]?.avg ?? 0;

  // Latency rating text & color
  const getTTFBRating = (ms: number) => {
    if (ms === 0) return { label: "ไม่มีข้อมูล", color: "text-slate-500 bg-slate-100 border-slate-200" };
    if (ms < 200) return { label: "ดีเยี่ยม (เร็วมาก)", color: "text-emerald-700 bg-emerald-50 border-emerald-200/50" };
    if (ms < 500) return { label: "ปกติ (รวดเร็ว)", color: "text-[#4A148C] bg-[#F3E5F5] border-[#EA80FC]/50" };
    return { label: "ควรปรับปรุง (เซิร์ฟเวอร์ตอบสนองช้า)", color: "text-amber-700 bg-amber-50 border-amber-200/50" };
  };

  const getLCPRating = (ms: number) => {
    if (ms === 0) return { label: "ไม่มีข้อมูล", color: "text-slate-500 bg-slate-100 border-slate-200" };
    if (ms < 2500) return { label: "รวดเร็ว (ผู้ใช้เห็นผลลัพธ์ทันใจ)", color: "text-emerald-700 bg-emerald-50 border-emerald-200/50" };
    if (ms < 4000) return { label: "ปกติ", color: "text-[#4A148C] bg-[#F3E5F5] border-[#EA80FC]/50" };
    return { label: "ช้า (หน้าตาเว็บโหลดเสร็จช้า)", color: "text-amber-700 bg-amber-50 border-amber-200/50" };
  };

  return (
    <SettingsShell
      title="ประสิทธิภาพและสุขภาพระบบ"
      description="รายงานสถิติ ความหน่วง และการคิวรีข้อมูลของแอปพลิเคชันเชิงรึก"
      floatingSubmit={false}
    >
      {/* 1. Metric Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {/* DB Size */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500">ขนาดหน่วยความจำ DB</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EA80FC]/30 text-[#4A148C]">
              <HardDrive className="h-5 w-5" strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-950 sm:text-3xl">
              {formatBytes(totalSizeBytes)}
            </h3>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">
              ขนาดรวมของโครงสร้างและข้อมูลทั้งหมด
            </p>
          </div>
        </div>

        {/* Database Index Hit Rate */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500">ดัชนีคิวรีข้อมูล (Index Hit Rate)</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Gauge className="h-5 w-5" strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-emerald-600 sm:text-3xl">
              {indexHitRate}%
            </h3>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">
              {indexHitRate >= 95 ? "ดีเยี่ยม (ระบบไม่หน่วง)" : "ควรเพิ่ม Index ป้องกันความช้า"}
            </p>
          </div>
        </div>

        {/* Avg Response Time */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500">เซิร์ฟเวอร์ตอบสนอง (TTFB)</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EA80FC]/20 text-[#4A148C]">
              <Activity className="h-5 w-5" strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-950 sm:text-3xl">
              {ttfb > 0 ? `${ttfb} ms` : "ไม่มีข้อมูล"}
            </h3>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">
              {ttfb > 0 && ttfb < 300 ? "รวดเร็วมาก" : ttfb > 0 ? "ความเร็วปกติ" : "ไม่มีสถิติวัดผลวันนี้"}
            </p>
          </div>
        </div>

        {/* Active Tables Count */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500">ตารางข้อมูลทั้งหมด (Tables)</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <TableProperties className="h-5 w-5" strokeWidth={2.2} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-950 sm:text-3xl">
              {tableCount} ตาราง
            </h3>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">
              ข้อมูลสะสมรวม {totalRows.toLocaleString("th-TH")} แถว
            </p>
          </div>
        </div>
      </div>

      {/* 2. Web Vitals / Speed Analysis Section */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
        <h2 className="text-base font-bold text-slate-950 sm:text-lg">
          ⚡ วิเคราะห์ความเร็วแอปบนเครื่องของทีมงาน (Core Web Vitals)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          สถิติตามเวลาจริงเก็บจากเบราว์เซอร์ของพนักงานจัดส่ง คลังสินค้า และผู้ดูแลระบบขณะทำงานจริง
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {/* TTFB */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Time To First Byte (TTFB)</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{ttfb > 0 ? `${ttfb}ms` : "-"}</div>
            <div className="mt-1 text-xs text-slate-500">เวลาเริ่มส่งข้อมูลชิ้นแรกจากคลาวด์</div>
            <div className={`mt-3 inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${getTTFBRating(ttfb).color}`}>
              {getTTFBRating(ttfb).label}
            </div>
          </div>

          {/* FCP */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">First Contentful Paint (FCP)</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{fcp > 0 ? `${fcp}ms` : "-"}</div>
            <div className="mt-1 text-xs text-slate-500">เวลาเริ่มแสดงข้อมูลตัวอักษร/รูปภาพแรก</div>
            <div className={`mt-3 inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${getTTFBRating(fcp).color}`}>
              {fcp > 0 && fcp < 1800 ? "รวดเร็วดีเยี่ยม" : fcp > 0 ? "ความเร็วปกติ" : "ไม่มีข้อมูล"}
            </div>
          </div>

          {/* LCP */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Largest Contentful Paint (LCP)</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{lcp > 0 ? `${lcp}ms` : "-"}</div>
            <div className="mt-1 text-xs text-slate-500">หน้าเว็บโหลดสมบูรณ์พร้อมเริ่มตอบสนอง</div>
            <div className={`mt-3 inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${getLCPRating(lcp).color}`}>
              {getLCPRating(lcp).label}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Database Table Diagnostics */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.03)] sm:p-6">
        <h2 className="text-base font-bold text-slate-950 sm:text-lg">
          📁 ตรวจสอบตารางฐานข้อมูลและคอขวด (Database Diagnostics)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          รายการตารางในระบบ ขนาดที่ใช้ และความถี่ในการสแกนคิวรีข้อมูล แนะนำการสร้างดัชนี Index อัตโนมัติเมื่อเกิดการสแกนแบบลำดับจำนวนมาก
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-900">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">ชื่อตาราง (Table Name)</th>
                <th className="px-4 py-3 text-right">จำนวนข้อมูล (Rows)</th>
                <th className="px-4 py-3 text-right">ขนาดรวม (Size)</th>
                <th className="px-4 py-3 text-right">เรียกใช้ดัชนี (Index Scans)</th>
                <th className="px-4 py-3 text-right">ค้นหาเรียงตัว (Seq Scans)</th>
                <th className="px-4 py-3 text-center">คำแนะนำสุขภาพ (Diagnosis)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dbStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-semibold">
                    ไม่มีข้อมูลสถิติตารางฐานข้อมูลในระบบขณะนี้
                  </td>
                </tr>
              ) : (
                dbStats.map((row, index) => {
                  const isLarge = row.row_count > 1000;
                  const needsIndex = isLarge && row.sequential_scans > 200 && row.index_scans < (row.sequential_scans * 0.1);
                  
                  return (
                    <tr key={row.table_name} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3.5 text-xs text-slate-400 font-bold">{index + 1}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">{row.table_name}</td>
                      <td className="px-4 py-3.5 text-right font-semibold">
                        {(row.row_count || 0).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-600">
                        {row.total_size}
                      </td>
                      <td className="px-4 py-3.5 text-right text-emerald-600 font-bold">
                        {(row.index_scans || 0).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-500 font-semibold">
                        {(row.sequential_scans || 0).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {needsIndex ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            ควรเพิ่มดัชนี Index
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <CheckCircle className="h-3 w-3 shrink-0" />
                            ดีเยี่ยม
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SettingsShell>
  );
}
