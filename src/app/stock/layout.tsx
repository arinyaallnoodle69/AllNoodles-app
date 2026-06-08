"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SettingsShell } from "@/components/settings/settings-shell";
import { PackageCheck } from "lucide-react";

export default function StockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine current tab from searchParams or pathname
  let current: "stock" | "history" | "issues" = "stock";
  const tabParam = searchParams.get("tab");
  if (tabParam === "history" || pathname.includes("/stock/history")) current = "history";
  else if (tabParam === "issues" || pathname.includes("/stock/issues")) current = "issues";
  else current = "stock";

  // Dynamic description based on tab
  const descriptions = {
    stock: "ดูของคงเหลือ จองแล้ว และจัดการสต็อกพื้นฐาน",
    history: "ดูประวัติการรับเข้าสินค้าจากผู้ขาย",
    issues: "ดูประวัติการเบิกสินค้าออกจากคลัง"
  };

  return (
    <SettingsShell
      title="จัดการสต็อก"
      description={descriptions[current]}
      floatingSubmit={false}
      titleIcon={PackageCheck}
      hideHeader
    >
      <div>
        {children}
      </div>
    </SettingsShell>
  );
}
