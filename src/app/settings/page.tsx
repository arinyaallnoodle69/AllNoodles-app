import Link from "next/link";
import { ArrowRight, Clock3, MessageCircleMore, Package2, Store, Truck, Factory } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";

const options = [
  {
    description: "เพิ่มสินค้าใหม่ อัปเดตรหัสสินค้า รูปสินค้า และต้นทุน",
    href: "/settings/products",
    icon: Package2,
    label: "จัดการสินค้า",
  },
  {
    description: "เพิ่มร้านค้า จัดการข้อมูลหน้าร้าน ที่อยู่ และเลือกรถประจำร้าน",
    href: "/settings/customers",
    icon: Store,
    label: "จัดการร้านค้า",
  },
  {
    description: "เพิ่มรายชื่อผู้ขายหรือโรงงานที่คุณสั่งซื้อสินค้า เพื่อใช้บันทึกรับเข้าสต็อก",
    href: "/settings/suppliers",
    icon: Factory,
    label: "จัดการผู้ขาย",
  },
  {
    description: "ดูชื่อ LINE รูปโปรไฟล์ สถานะการใช้งาน และจัดการสิทธิ์ลูกค้าที่เข้ามาผ่าน LINE",
    href: "/settings/customer-data",
    icon: MessageCircleMore,
    label: "ข้อมูลลูกค้า",
  },
  {
    description: "เพิ่มรถส่งของแบบง่าย เพื่อเอาไปผูกร้านค้าและใช้ต่อยอดกับงานจัดส่ง",
    href: "/settings/vehicles",
    icon: Truck,
    label: "จัดการรถ",
  },
  {
    description: "ตั้งเวลาเปิด-ปิดรับออเดอร์ และจัดการแจ้งเตือนออเดอร์ใหม่ของอุปกรณ์นี้ได้ในหน้าเดียว",
    href: "/settings/order-window",
    icon: Clock3,
    label: "เวลารับออเดอร์และแจ้งเตือน",
  },
] as const;

export default async function SettingsIndexPage() {
  await requireAppRole("admin");

  return (
    <SettingsShell
      title="ตั้งค่า"
      description="เลือกหมวดการตั้งค่าที่ต้องการจัดการต่อได้จากหน้านี้"
      floatingSubmit={false}
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {options.map((option) => {
          const Icon = option.icon;

          return (
            <Link
              key={option.href}
              href={option.href}
              className="group rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#003366]/30 hover:shadow-[0_24px_60px_rgba(0,51,102,0.10)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
                <Icon className="h-6 w-6" strokeWidth={2.2} />
              </div>

              <h2 className="mt-5 text-xl font-semibold text-slate-950">{option.label}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">{option.description}</p>

              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#003366]">
                ไปยังหน้านี้
                <ArrowRight
                  className="h-4 w-4 transition group-hover:translate-x-1"
                  strokeWidth={2.2}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </SettingsShell>
  );
}
