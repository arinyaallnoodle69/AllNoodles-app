import { Suspense } from "react";
import { Receipt, History, Search } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppRole } from "@/lib/auth/authorization";
import {
  getBillingCandidates,
  getBillingHistory,
  getCustomersForBilling,
  type BillingRecord,
} from "@/lib/billing/billing-statement";
import { BillingForm } from "./billing-form";
import { HistorySearchForm } from "./history-search-form";
import { HistoryTable } from "./history-table";
import { fmt } from "@/components/print/print-shared";

export const metadata = { title: "ใบวางบิล | T&Y Noodles" };

type BillingPageProps = {
  searchParams: Promise<{ 
    from?: string; 
    to?: string;
    h_from?: string;
    h_to?: string;
    h_q?: string;
    h_show?: string;
    h_customers?: string;
  }>;
};

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function isValidDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function fmtBaht(amount: number) {
  return `${fmt(amount)} บาท`;
}


function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-200">
        <History className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-black text-slate-800">ไม่พบประวัติการวางบิล</h3>
      <p className="mt-2 text-sm font-medium text-slate-500">
        เลือกวันที่และร้านค้าเพื่อค้นหาประวัติการวางบิล
      </p>
    </div>
  );
}

async function BillingPageContent({ searchParams }: BillingPageProps) {
  const session = await requireAppRole("admin");
  const params = await searchParams;

  const currentTab = params.h_show === "1" ? "history" : "create";
  
  const from = isValidDate(params.from) ? params.from : daysAgoISO(30);
  const to = isValidDate(params.to) ? params.to : todayISO();

  const h_from = params.h_from || "";
  const h_to = params.h_to || "";
  const h_q = params.h_q || "";
  const h_show = params.h_show;
  const h_customers_raw = params.h_customers;
  const h_customers = h_customers_raw ? h_customers_raw.split(",") : [];

  // Only fetch history if at least one filter is active or 'h_show' was triggered by a search action
  // In our case, we'll check if the user has provided a date range or a search query
  const isSearching = h_from || h_to || h_q || h_customers.length > 0;

  const [candidates, history, allCustomers] = await Promise.all([
    getBillingCandidates(session.organizationId, from, to),
    (h_show === "1" && isSearching)
      ? getBillingHistory(session.organizationId, { from: h_from, to: h_to, query: h_q, customerIds: h_customers })
      : Promise.resolve([] as BillingRecord[]),
    getCustomersForBilling(session.organizationId),
  ]);

  const totalBilled = history.reduce((sum: number, record: BillingRecord) => sum + record.total_amount, 0);

  return (
    <AppSidebarLayout>
      <div className="mx-auto max-w-7xl px-0 md:px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 md:px-0">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center bg-[#003366] text-white shadow-xl shadow-[#003366]/20">
              <Receipt className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">จัดการใบวางบิล</h1>
              <p className="text-slate-500 font-medium">จัดการการออกใบวางบิลและเรียกดูประวัติ</p>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="mb-8 flex border-b border-slate-200 md:px-0">
          <a
            href="/billing"
            className={`flex-1 text-center px-2 md:px-8 py-4 text-sm md:text-base font-bold transition-all border-b-4 ${
              currentTab === "create"
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            ออกใบวางบิลใหม่
          </a>
          <a
            href="/billing?h_show=1"
            className={`flex-1 text-center px-2 md:px-8 py-4 text-sm md:text-base font-bold transition-all border-b-4 ${
              currentTab === "history"
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            ประวัติการวางบิล
          </a>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {currentTab === "create" ? (
            <section>
              <div className="border-y md:border border-slate-200 bg-white p-4 md:p-8 shadow-none md:shadow-md">
                <BillingForm
                  initialFromDate={from}
                  initialToDate={to}
                  candidates={candidates}
                  allCustomers={allCustomers}
                />
              </div>
            </section>
          ) : (
            <section className="space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 rounded-full bg-[#003366]" />
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">ค้นหาประวัติ</h2>
                  </div>
                </div>
                {(isSearching && history.length > 0) && (
                  <div className="border border-emerald-100 bg-emerald-50/50 px-5 py-3 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-600">
                      รวมรายการที่ค้นพบ {history.length} ฉบับ
                    </p>
                    <p className="font-mono text-xl font-extrabold tabular-nums text-[#003366]">
                      {fmtBaht(totalBilled)}
                    </p>
                  </div>
                )}
              </div>

              <HistorySearchForm 
                initialFrom={h_from}
                initialTo={h_to}
                initialQuery={h_q}
                initialCustomers={h_customers}
                allCustomers={allCustomers}
              />

              <div className="min-h-[300px]">
                {!isSearching ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                      <Search className="h-10 w-10" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">ยินดีต้อนรับสู่ระบบค้นหาประวัติ</h3>
                    <p className="mt-2 text-sm font-medium text-slate-500 max-w-sm">
                      กรุณาเลือกช่วงเวลา หรือระบุชื่อร้านค้าที่ต้องการ <br />เพื่อเรียกดูรายการใบวางบิลย้อนหลัง
                    </p>
                  </div>
                ) : history.length === 0 ? (
                  <EmptyHistory />
                ) : (
                  <HistoryTable history={history} />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </AppSidebarLayout>
  );
}



export default function BillingPage(props: BillingPageProps) {
  return (
    <Suspense fallback={null}>
      <BillingPageContent {...props} />
    </Suspense>
  );
}
