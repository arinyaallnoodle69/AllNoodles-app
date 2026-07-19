import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const version = searchParams.get("v");
  void version; // Use version query to bust client browser caches
  try {
    const supabase = getSupabaseAdmin();
    // Query the organization logo from metadata
    const { data: organization } = await supabase
      .from("organizations")
      .select("metadata")
      .limit(1)
      .single();

    const metadata = (organization?.metadata as Record<string, unknown>) || {};
    const logoUrl = metadata.logo_url as string | undefined;

    if (logoUrl && logoUrl.startsWith("data:image/")) {
      // Decode data URL to buffer
      const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, "base64");

        return new Response(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
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
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[API:Logo] Error reading fallback logo:", error);
    return new Response("Not Found", { status: 404 });
  }
}
