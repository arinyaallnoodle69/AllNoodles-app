import { Store } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isBangkokVehicleGroup } from "@/components/print/packing-list-bkk-split";
import { BkkNoodlesClient, type BkkNoodleStore } from "./bkk-noodles-client";

export const metadata = { title: "ใบออเดอร์ รถกรุงเทพบะหมี่" };

type CustomerRow = {
  id: string;
  customer_code: string;
  name: string;
  sort_order: number | null;
  default_vehicle_id: string | null;
  packing_list_group: string | null;
};

type CustomersQuery = {
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: boolean): {
        order(column: string, options: { ascending: boolean }): PromiseLike<{ data: CustomerRow[] | null }>;
      };
    };
  };
};

export default async function BkkNoodlesPage() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const [{ data: vehicles }, { data: customers }] = await Promise.all([
    admin.from("vehicles").select("id, name").eq("organization_id", session.organizationId),
    (admin.from("customers") as unknown as CustomersQuery)
      .select("id, customer_code, name, sort_order, default_vehicle_id, packing_list_group")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const bkkVehicleIds = new Set(
    (vehicles ?? []).filter((v) => isBangkokVehicleGroup(v.id, v.name)).map((v) => v.id),
  );

  const stores: BkkNoodleStore[] = (customers ?? [])
    .filter((c) => c.default_vehicle_id && bkkVehicleIds.has(c.default_vehicle_id))
    .map((c) => ({
      id: c.id,
      code: c.customer_code,
      name: c.name,
      selected: c.packing_list_group === "bkk_noodle",
    }));

  return (
    <SettingsShell
      title="ใบออเดอร์ รถกรุงเทพบะหมี่"
      description="เลือกร้านที่จะแยกไปอยู่ใบที่ 2 ของรถกรุงเทพ มีผลเฉพาะใบออเดอร์"
      titleIcon={Store}
      current="customers"
      floatingSubmit={false}
    >
      <BkkNoodlesClient stores={stores} />
    </SettingsShell>
  );
}
