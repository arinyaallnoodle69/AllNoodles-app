import { cacheLife, cacheTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readFile } from "fs/promises";
import { join } from "path";

const LOGO_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

async function getCachedLogoData() {
  "use cache";
  cacheLife({ revalidate: 300, expire: 3600 });
  cacheTag("brand-logo");

  const supabase = getSupabaseAdmin();
  const { data: organization } = await supabase
    .from("organizations")
    .select("metadata")
    .limit(1)
    .single();

  const metadata = (organization?.metadata as Record<string, unknown>) || {};
  const logoUrl = metadata.logo_url as string | undefined;
  const match = logoUrl?.match(/^data:([^;]+);base64,(.+)$/);

  return match ? { contentType: match[1], data: match[2] } : null;
}

export async function GET() {
  try {
    const logo = await getCachedLogoData();
    if (logo) {
      return new Response(Buffer.from(logo.data, "base64"), {
        headers: {
          "Content-Type": logo.contentType,
          "Cache-Control": LOGO_CACHE_CONTROL,
        },
      });
    }
  } catch (error) {
    console.error("[API:Logo] Error fetching custom logo:", error);
  }

  // Fallback to static public/brand/logo1.png
  try {
    const filePath = join(process.cwd(), "public", "brand", "logo1.png");
    const buffer = await readFile(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": LOGO_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("[API:Logo] Error reading fallback logo:", error);
    return new Response("Not Found", { status: 404 });
  }
}
