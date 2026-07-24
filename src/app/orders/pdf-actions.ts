"use server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppSession } from "@/lib/auth/session";

const TEMP_PDF_BUCKET = "temp-pdfs";
const TEMP_PDF_MAX_BYTES = 45 * 1024 * 1024;
const TEMP_PDF_TTL_MS = 24 * 60 * 60 * 1000;
const TEMP_PDF_CLEANUP_LIMIT = 100;

async function cleanupOldTempPdfs(
  storage: ReturnType<typeof getSupabaseAdmin>["storage"],
  organizationId: string,
) {
  const { data: files, error } = await storage.from(TEMP_PDF_BUCKET).list(organizationId, {
    limit: TEMP_PDF_CLEANUP_LIMIT,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.warn("[uploadTempPdfAction:cleanup:list]", error);
    return;
  }

  const now = Date.now();
  const stalePaths = (files ?? [])
    .map((file) => {
      const timestamp = Number(file.name.split("-", 1)[0]);
      return Number.isFinite(timestamp) && now - timestamp > TEMP_PDF_TTL_MS
        ? `${organizationId}/${file.name}`
        : null;
    })
    .filter((path): path is string => Boolean(path));

  if (stalePaths.length === 0) {
    return;
  }

  const { error: removeError } = await storage.from(TEMP_PDF_BUCKET).remove(stalePaths);
  if (removeError) {
    console.warn("[uploadTempPdfAction:cleanup:remove]", removeError);
  }
}

export async function uploadTempPdfAction(formData: FormData) {
  try {
    const session = await getAppSession();
    if (!session) {
      return { error: "กรุณาเข้าสู่ระบบใหม่" };
    }

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { error: "ไม่พบไฟล์ PDF สำหรับอัปโหลด" };
    }

    if (file.size > TEMP_PDF_MAX_BYTES) {
      return { error: "ไฟล์ PDF ใหญ่เกินไป กรุณาแบ่งพิมพ์เป็นชุดเล็กลง" };
    }

    const supabase = getSupabaseAdmin();
    
    // Ensure the bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = (buckets ?? []).some((bucket) => bucket.name === TEMP_PDF_BUCKET);
    if (!hasBucket) {
      const { error: bucketError } = await supabase.storage.createBucket(TEMP_PDF_BUCKET, {
        allowedMimeTypes: ["application/pdf"],
        fileSizeLimit: "50MB",
        public: true,
      });
      if (bucketError) {
        console.error("[uploadTempPdfAction:createBucket]", bucketError);
        return { error: `สร้างพื้นที่เก็บไฟล์ชั่วคราวไม่สำเร็จ: ${bucketError.message}` };
      }
    } else {
      const { error: bucketError } = await supabase.storage.updateBucket(TEMP_PDF_BUCKET, {
        allowedMimeTypes: ["application/pdf"],
        fileSizeLimit: "50MB",
        public: true,
      });
      if (bucketError) {
        console.warn("[uploadTempPdfAction:updateBucket]", bucketError);
      }
    }

    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^\w.-]/g, "_");
    const fileName = `${session.organizationId}/${timestamp}-${cleanFileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(TEMP_PDF_BUCKET)
      .upload(fileName, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[uploadTempPdfAction:upload]", uploadError);
      return { error: `อัปโหลดไฟล์ไม่สำเร็จ: ${uploadError.message}` };
    }

    await cleanupOldTempPdfs(supabase.storage, session.organizationId);

    const {
      data: { publicUrl },
    } = supabase.storage.from(TEMP_PDF_BUCKET).getPublicUrl(fileName);

    return { success: true, publicUrl };
  } catch (error) {
    console.error("[uploadTempPdfAction:catch]", error);
    return { error: "เกิดข้อผิดพลาดในการประมวลผลไฟล์บนเซิร์ฟเวอร์" };
  }
}
