import "server-only";

import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { getSessionSecret } from "@/lib/supabase/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const STALE_DELIVERY_MESSAGE = "ออเดอร์หรือบิลเปลี่ยนแล้ว กรุณาโหลดข้อมูลและสร้าง PDF ใหม่ก่อนส่งลูกค้า";

type ExportVersion = { id: string; version: string; valid: boolean };
type ExportToken = { organizationId: string; noteIds: string; version: string; expiresAt: number; fileHash?: string };

export async function getDeliveryExportVersions(organizationId: string, noteIds?: string[]) {
  const { data, error } = await getSupabaseAdmin().rpc("delivery_export_versions", {
    p_organization_id: organizationId,
    p_note_ids: noteIds,
  });
  if (error) throw new Error("ตรวจสอบออเดอร์กับบิลไม่สำเร็จ: " + error.message);
  return data ?? [];
}

export function assertDeliveryExportVersions(before: ExportVersion[], current: ExportVersion[], ids: string[]) {
  if (ids.length === 0) throw new Error("ไม่พบบิลสำหรับพิมพ์");
  const previous = new Map(before.map((row) => [row.id, row]));
  const latest = new Map(current.map((row) => [row.id, row]));
  for (const id of new Set(ids)) {
    const a = previous.get(id);
    const b = latest.get(id);
    if (!a?.valid || !b?.valid || a.version !== b.version) throw new Error(STALE_DELIVERY_MESSAGE);
  }
}

function signature(value: string) {
  return createHmac("sha256", getSessionSecret()).update("delivery-export:" + value).digest();
}

function versionDigest(versions: ExportVersion[]) {
  return createHash("sha256").update(JSON.stringify(
    [...new Map(versions.map((row) => [row.id, row])).values()]
      .sort((a, b) => a.id.localeCompare(b.id)).map((row) => [row.id, row.version]),
  )).digest("hex");
}

export function createDeliveryExportToken(organizationId: string, versions: ExportVersion[], file?: Uint8Array) {
  const payload: ExportToken = {
    organizationId,
    // Pack UUIDs to keep batch export tokens within HTTP header limits.
    noteIds: Buffer.from([...new Set(versions.map((row) => row.id))].sort().join("").replaceAll("-", ""), "hex").toString("base64url"),
    version: versionDigest(versions),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    ...(file ? { fileHash: createHash("sha256").update(file).digest("hex") } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + signature(encoded).toString("base64url");
}

export async function validateDeliveryExportToken(token: string, organizationId: string, file?: Uint8Array) {
  const [encoded, signed, extra] = token.split(".");
  if (!encoded || !signed || extra) throw new Error(STALE_DELIVERY_MESSAGE);
  const actual = Buffer.from(signed, "base64url");
  const expected = signature(encoded);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error(STALE_DELIVERY_MESSAGE);
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ExportToken;
  if (payload.organizationId !== organizationId || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) throw new Error(STALE_DELIVERY_MESSAGE);
  if (file && (!payload.fileHash || payload.fileHash !== createHash("sha256").update(file).digest("hex"))) throw new Error("ไฟล์ PDF ไม่ตรงกับฉบับที่ตรวจสอบแล้ว");
  const packedIds = Buffer.from(payload.noteIds, "base64url");
  if (!packedIds.length || packedIds.length % 16 !== 0) throw new Error(STALE_DELIVERY_MESSAGE);
  const ids: string[] = [];
  for (let offset = 0; offset < packedIds.length; offset += 16) {
    const hex = packedIds.subarray(offset, offset + 16).toString("hex");
    ids.push(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
  }
  const current = await getDeliveryExportVersions(organizationId, ids);
  assertDeliveryExportVersions(current, current, ids);
  if (versionDigest(current) !== payload.version) throw new Error(STALE_DELIVERY_MESSAGE);
  return current;
}
