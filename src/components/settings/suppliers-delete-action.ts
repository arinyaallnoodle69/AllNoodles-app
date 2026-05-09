"use server";

import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function deleteSupplierAction(supplierId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAppRole("admin");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getSupabaseAdmin() as any;

  const { error } = await admin
    .from("suppliers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("organization_id", session.organizationId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}
