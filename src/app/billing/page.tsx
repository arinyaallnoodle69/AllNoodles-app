import { Suspense } from "react";
import BillingLoading from "./loading";
import { requireAnyRole } from "@/lib/auth/authorization";
import {
  getBillingCandidates,
  getCustomersForBilling,
} from "@/lib/billing/billing-statement";
import { BillingDashboardClient } from "./billing-dashboard-client";

export const metadata = { title: "ใบวางบิล | All Noodles" };

type BillingPageProps = {
  searchParams: Promise<{ 
    from?: string; 
    to?: string;
  }>;
};

function getCurrentMonthRangeBangkok() {
  const now = new Date();
  const bangkokDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const [yearStr, monthStr] = bangkokDate.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const from = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function isValidDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function BillingPageContent({ searchParams }: BillingPageProps) {
  const session = await requireAnyRole(["admin", "member"]);
  const params = await searchParams;
  
  const currentMonth = getCurrentMonthRangeBangkok();
  const from = isValidDate(params.from) ? params.from : currentMonth.from;
  const to = isValidDate(params.to) ? params.to : currentMonth.to;

  const [candidates, allCustomers] = await Promise.all([
    getBillingCandidates(session.organizationId, from, to),
    getCustomersForBilling(session.organizationId),
  ]);

  return (
    <>
      <BillingDashboardClient
        organizationId={session.organizationId}
        candidates={candidates}
        allCustomers={allCustomers}
        initialFrom={from}
        initialTo={to}
        canViewAmounts={session.role === "admin"}
      />
    </>
  );
}

export default function BillingPage(props: BillingPageProps) {
  return (
    <Suspense fallback={<BillingLoading />}>
      <BillingPageContent {...props} />
    </Suspense>
  );
}
