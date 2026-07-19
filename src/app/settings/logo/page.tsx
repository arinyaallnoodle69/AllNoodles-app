import { SettingsShell } from "@/components/settings/settings-shell";
import { LogoSettingsForm } from "@/components/settings/logo-settings-form";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = {
  title: "ตั้งค่าโลโก้ร้านค้า",
};

export default async function SettingsLogoPage() {
  const session = await requireAppRole("admin");
  const supabase = getSupabaseAdmin();

  // Load the current logo_url from organization metadata
  const { data: organization } = await supabase
    .from("organizations")
    .select("metadata")
    .eq("id", session.organizationId)
    .single();

  const metadata = (organization?.metadata as Record<string, unknown>) || {};
  const logoUrl = (metadata.logo_url as string) || null;

  return (
    <SettingsShell
      current="logo"
      title="ตั้งค่าโลโก้ร้านค้า"
      description="อัปโหลดและเปลี่ยนรูปโลโก้ของระบบ สำหรับใช้แสดงบนหัวบิล หน้าล็อกอิน และระบบ"
      floatingSubmit={false}
    >
      <LogoSettingsForm initialLogoUrl={logoUrl} />
    </SettingsShell>
  );
}
