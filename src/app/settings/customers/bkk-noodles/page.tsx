import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isBangkokVehicleGroup, isBkkNoodleStore } from "@/components/print/packing-list-bkk-split";
import { BkkNoodlesClient, type BkkNoodleStore } from "./bkk-noodles-client";

export const metadata = { title: "ใบออเดอร์ รถกรุงเทพบะหมี่" };


function extractPackingListGroup(meta: unknown): string | null {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const val = (meta as Record<string, unknown>).packing_list_group;
    if (typeof val === "string") return val;
  }
  return null;
}

export default async function BkkNoodlesPage() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const [{ data: vehicles }, { data: customers }] = await Promise.all([
    admin.from("vehicles").select("id, name").eq("organization_id", session.organizationId),
    admin
      .from("customers")
      .select("id, customer_code, name, sort_order, default_vehicle_id, metadata")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const bkkVehicleIds = new Set(
    (vehicles ?? []).filter((v) => isBangkokVehicleGroup(v.id, v.name)).map((v) => v.id),
  );

  const stores: BkkNoodleStore[] = (customers ?? [])
    .filter((c) => c.default_vehicle_id && bkkVehicleIds.has(c.default_vehicle_id))
    .map((c) => {
      const group = extractPackingListGroup(c.metadata);
      return {
        id: c.id,
        code: c.customer_code,
        name: c.name,
        selected: isBkkNoodleStore({ id: c.customer_code, packingListGroup: group }),
      };
    });

  return (
    <SettingsShell
      title="ใบออเดอร์ รถกรุงเทพบะหมี่"
      description="เลือกร้านที่จะแยกไปอยู่ใบที่ 2 ของรถกรุงเทพ มีผลเฉพาะใบออเดอร์"
      current="customers"
      floatingSubmit={false}
    >
      <BkkNoodlesClient stores={stores} />
    </SettingsShell>
  );
}
