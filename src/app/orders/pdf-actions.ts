"use server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppSession } from "@/lib/auth/session";

const TEMP_PDF_BUCKET = "temp-pdfs";

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

    const supabase = getSupabaseAdmin();
    
    // Ensure the bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = (buckets ?? []).some((bucket) => bucket.name === TEMP_PDF_BUCKET);
    if (!hasBucket) {
      const { error: bucketError } = await supabase.storage.createBucket(TEMP_PDF_BUCKET, {
        allowedMimeTypes: ["application/pdf"],
        fileSizeLimit: "20MB",
        public: true,
      });
      if (bucketError) {
        console.error("[uploadTempPdfAction:createBucket]", bucketError);
        return { error: `สร้างพื้นที่เก็บไฟล์ชั่วคราวไม่สำเร็จ: ${bucketError.message}` };
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

    const {
      data: { publicUrl },
    } = supabase.storage.from(TEMP_PDF_BUCKET).getPublicUrl(fileName);

    return { success: true, publicUrl };
  } catch (error) {
    console.error("[uploadTempPdfAction:catch]", error);
    return { error: "เกิดข้อผิดพลาดในการประมวลผลไฟล์บนเซิร์ฟเวอร์" };
  }
}
