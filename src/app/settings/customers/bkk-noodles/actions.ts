"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isBangkokVehicleGroup } from "@/components/print/packing-list-bkk-split";
import type { Json } from "@/types/database";

type CustomerMetaRow = {
  id: string;
  default_vehicle_id: string | null;
  metadata: unknown;
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
      .select("id, default_vehicle_id, metadata")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
  ]);

  const bkkVehicleIds = new Set(
    (vehicles ?? []).filter((v) => isBangkokVehicleGroup(v.id, v.name)).map((v) => v.id),
  );
  const eligibleCustomers = ((customers ?? []) as CustomerMetaRow[]).filter(
    (c) => c.default_vehicle_id && bkkVehicleIds.has(c.default_vehicle_id),
  );
  const eligibleIds = new Set(eligibleCustomers.map((c) => c.id));

  if (selected.some((id) => !eligibleIds.has(id))) {
    return { error: "มีร้านที่ไม่ได้อยู่ในรถกรุงเทพ กรุณารีเฟรชหน้าแล้วลองใหม่" };
  }

  const selectedSet = new Set(selected);
  const updates: Promise<{ error: { message?: string } | null }>[] = [];

  for (const customer of eligibleCustomers) {
    const isSelected = selectedSet.has(customer.id);
    const currentMeta =
      customer.metadata && typeof customer.metadata === "object" && !Array.isArray(customer.metadata)
        ? { ...(customer.metadata as Record<string, unknown>) }
        : {};
    const targetGroup = isSelected ? "bkk_noodle" : "default";

    if (currentMeta.packing_list_group !== targetGroup) {
      currentMeta.packing_list_group = targetGroup;
      updates.push(
        (async () => {
          const { error } = await admin
            .from("customers")
            .update({ metadata: currentMeta as Json })
            .eq("organization_id", session.organizationId)
            .eq("id", customer.id);
          return { error };
        })(),
      );
    }
  }

  if (updates.length > 0) {
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
  }

  revalidatePath("/orders/packing-list");
  revalidatePath("/settings/customers/bkk-noodles");
  return {};
}
