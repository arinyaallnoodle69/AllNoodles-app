"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isBangkokVehicleGroup } from "@/components/print/packing-list-bkk-split";

type CustomersTable = {
  update(values: { packing_list_group: string | null }): {
    eq(column: string, value: string): {
      in(column: string, values: string[]): Promise<{ error: { message?: string } | null }>;
    };
  };
};

export async function saveBkkNoodleCustomersAction(
  customerIds: string[],
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const selected = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))];

  const [{ data: vehicles }, { data: customers }] = await Promise.all([
    admin.from("vehicles").select("id, name").eq("organization_id", session.organizationId),
    admin
      .from("customers")
      .select("id, default_vehicle_id")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
  ]);

  const bkkVehicleIds = new Set(
    (vehicles ?? []).filter((v) => isBangkokVehicleGroup(v.id, v.name)).map((v) => v.id),
  );
  const eligibleIds = (customers ?? [])
    .filter((c) => c.default_vehicle_id && bkkVehicleIds.has(c.default_vehicle_id))
    .map((c) => c.id);
  const eligible = new Set(eligibleIds);

  if (selected.some((id) => !eligible.has(id))) {
    return { error: "มีร้านที่ไม่ได้อยู่ในรถกรุงเทพ กรุณารีเฟรชหน้าแล้วลองใหม่" };
  }

  const table = admin.from("customers") as unknown as CustomersTable;
  const selectedSet = new Set(selected);
  const unselected = eligibleIds.filter((id) => !selectedSet.has(id));

  const results = await Promise.all([
    unselected.length
      ? table.update({ packing_list_group: null }).eq("organization_id", session.organizationId).in("id", unselected)
      : Promise.resolve({ error: null }),
    selected.length
      ? table
          .update({ packing_list_group: "bkk_noodle" })
          .eq("organization_id", session.organizationId)
          .in("id", selected)
      : Promise.resolve({ error: null }),
  ]);

  if (results.some((r) => r.error)) {
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  revalidatePath("/orders/packing-list");
  revalidatePath("/settings/customers/bkk-noodles");
  return {};
}
