"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type LogoSettingsActionState = {
  logoUrl: string | null;
  message: string;
  status: "idle" | "success" | "error";
};

export async function updateLogoSettingsAction(
  _previousState: LogoSettingsActionState,
  formData: FormData,
): Promise<LogoSettingsActionState> {
  const session = await requireAppRole("admin");
  const logoData = formData.get("logoData") as string | null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: organization, error: loadError } = await supabaseAdmin
    .from("organizations")
    .select("metadata")
    .eq("id", session.organizationId)
    .single();

  if (loadError || !organization) {
    console.error("[updateLogoSettingsAction:loadOrganization]", loadError);
    return {
      logoUrl: null,
      message: "ไม่สามารถโหลดการตั้งค่าปัจจุบันได้",
      status: "error",
    };
  }

  const currentMetadata = (organization.metadata as Record<string, unknown>) || {};
  const nextMetadata = {
    ...currentMetadata,
    logo_url: logoData || null,
  };

  const { error: updateError } = await supabaseAdmin
    .from("organizations")
    .update({ metadata: nextMetadata as Json })
    .eq("id", session.organizationId);

  if (updateError) {
    console.error("[updateLogoSettingsAction:updateOrganization]", updateError);
    return {
      logoUrl: null,
      message: "บันทึกโลโก้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      status: "error",
    };
  }

  revalidateTag(`settings-${session.organizationId}`, "max");
  revalidatePath("/settings");
  revalidatePath("/settings/logo");
  revalidatePath("/delivery/print");
  revalidatePath("/billing/print");

  return {
    logoUrl: logoData,
    message: "บันทึกโลโก้ร้านค้าเรียบร้อยแล้ว",
    status: "success",
  };
}
