import { Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import {
  VehicleCreateButton,
  VehicleModalProvider,
} from "@/components/settings/vehicle-modal";
import { VehicleListPanel } from "@/components/settings/vehicle-list-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการรถ",
};

type SettingsVehiclesPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
    q?: string;
  }>;
};

export default async function SettingsVehiclesPage({
  searchParams,
}: SettingsVehiclesPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsData(session.organizationId);
  const params = await searchParams;
  const searchTerm = params.q?.trim() ?? "";
  const normalizedSearch = searchTerm.toLocaleLowerCase("th");
  const filteredVehicles = normalizedSearch
    ? data.vehicles.filter((vehicle) =>
        [vehicle.name, vehicle.licensePlate, vehicle.driverName]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("th").includes(normalizedSearch)),
      )
    : data.vehicles;

  return (
    <VehicleModalProvider
      vehicles={data.vehicles}
      initialCreate={params.create === "1"}
      initialEditId={params.edit ?? null}
    >
    <SettingsShell
      current="vehicles"
      title="จัดการรถ"
      description="เพิ่มรถส่งของแบบง่ายสำหรับผูกเป็นรถประจำร้าน และเตรียมต่อยอดไปงานจัดส่งในอนาคต"
      floatingSubmit={false}
      hideHeader
    >
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-black text-[#4A148C]">จัดการรถ</p>
            <p className="text-xs font-black text-[#1a1a1a]">
              แสดง {filteredVehicles.length.toLocaleString("th-TH")} จาก {data.vehicles.length.toLocaleString("th-TH")} คัน
            </p>
          </div>

          <form action="/settings/vehicles" method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:w-[48rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อรถ ทะเบียน หรือคนขับ"
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-black text-[#1a1a1a] outline-none transition placeholder:text-[#1a1a1a] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[#4A148C]/20 bg-white px-4 text-sm font-black text-[#1a1a1a] transition hover:border-[#4A148C] hover:bg-[#4A148C]/[0.04] active:scale-[0.98]"
            >
              ค้นหา
            </button>
            <VehicleCreateButton variant="desktop" />
          </form>
        </div>
      </div>

      <MobileSearchDrawer title="ค้นหารถ">
        <form action="/settings/vehicles" method="get" className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={searchTerm}
              placeholder="ค้นหาชื่อรถ ทะเบียน หรือคนขับ"
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-black text-[#1a1a1a] outline-none transition placeholder:text-[#1a1a1a] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#4A148C] px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition active:scale-[0.98]"
          >
            ค้นหา
          </button>
        </form>
      </MobileSearchDrawer>

      <VehicleCreateButton variant="fab" />

      <div className="flex w-full flex-col gap-8">
        <VehicleListPanel vehicles={filteredVehicles} />
      </div>
    </SettingsShell>
    </VehicleModalProvider>
  );
}
