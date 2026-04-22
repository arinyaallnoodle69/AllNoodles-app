import { MessageCircleMore } from "lucide-react";
import { CustomerDataPanel } from "@/components/settings/customer-data-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getCustomerDirectoryData } from "@/lib/settings/customer-directory";

export const metadata = {
  title: "ข้อมูลลูกค้า",
};

export default async function SettingsCustomerDataPage() {
  const session = await requireAppRole("admin");
  const data = await getCustomerDirectoryData(session.organizationId);

  return (
    <SettingsShell
      current="customerData"
      title="ข้อมูลลูกค้า"
      titleIcon={MessageCircleMore}
      description="ตรวจสอบข้อมูลลูกค้าที่เชื่อม LINE กับร้านค้า ดูสถานะการใช้งาน และจัดการสิทธิ์การสั่งซื้อจากหน้านี้"
      floatingSubmit={false}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <CustomerDataPanel data={data} />
      </div>
    </SettingsShell>
  );
}
