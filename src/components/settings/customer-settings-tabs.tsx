import Link from "next/link";

export type CustomerSettingsTab = "customers" | "pricing" | "bkk-noodles";

type CustomerSettingsTabsProps = {
  current: CustomerSettingsTab;
  onTabChange?: (tab: CustomerSettingsTab) => void;
};

const tabs = [
  {
    href: "/settings/customers",
    key: "customers",
    label: "รายชื่อร้านค้า",
  },
  {
    href: "/settings/customers?tab=pricing",
    key: "pricing",
    label: "ผูกราคาสินค้า",
  },
  {
    href: "/settings/customers/bkk-noodles",
    key: "bkk-noodles",
    label: "รถกรุงเทพบะหมี่",
  },
] as const;

export function CustomerSettingsTabs({ current, onTabChange }: CustomerSettingsTabsProps) {
  return (
    <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      {tabs.map((tab) => {
        const isActive = current === tab.key;

        const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
          if (tab.key === "bkk-noodles") {
            return;
          }
          if (onTabChange) {
            e.preventDefault();
            onTabChange(tab.key);
          }
        };

        return (
          <Link
            key={tab.key}
            href={tab.href}
            onClick={handleClick}
            className={`flex-1 rounded-[1rem] px-2.5 py-2.5 text-center text-xs sm:text-sm font-bold transition sm:px-4 ${
              isActive
                ? "bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(74,20,140,0.24)]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
