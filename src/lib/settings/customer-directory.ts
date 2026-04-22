import "server-only";

import type { Database } from "@/types/database";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CustomerRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  | "created_at"
  | "customer_code"
  | "id"
  | "is_active"
  | "line_user_id"
  | "metadata"
  | "name"
  | "phone"
>;

type LineProfileSnapshot = {
  displayName: string | null;
  pictureUrl: string | null;
};

export type CustomerDirectoryItem = {
  createdAt: string;
  customerCode: string;
  id: string;
  isActive: boolean;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  lineUserId: string;
  name: string;
  phone: string | null;
};

export type CustomerDirectoryData = {
  activeCount: number;
  customers: CustomerDirectoryItem[];
  disabledCount: number;
  totalCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLineProfileSnapshot(metadata: CustomerRow["metadata"]): LineProfileSnapshot {
  if (!isRecord(metadata)) {
    return {
      displayName: null,
      pictureUrl: null,
    };
  }

  const rawLineProfile = metadata.lineProfile;
  if (!isRecord(rawLineProfile)) {
    return {
      displayName: null,
      pictureUrl: null,
    };
  }

  return {
    displayName: getTrimmedString(rawLineProfile.displayName),
    pictureUrl: getTrimmedString(rawLineProfile.pictureUrl),
  };
}

export async function getCustomerDirectoryData(
  organizationId: string,
): Promise<CustomerDirectoryData> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("id, customer_code, name, phone, created_at, is_active, line_user_id, metadata")
    .eq("organization_id", organizationId)
    .not("line_user_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      activeCount: 0,
      customers: [],
      disabledCount: 0,
      totalCount: 0,
    };
  }

  const customers = ((data ?? []) as CustomerRow[])
    .filter((customer) => typeof customer.line_user_id === "string" && customer.line_user_id.trim())
    .map((customer) => {
      const lineProfile = getLineProfileSnapshot(customer.metadata);

      return {
        createdAt: customer.created_at,
        customerCode: customer.customer_code,
        id: customer.id,
        isActive: customer.is_active,
        lineDisplayName: lineProfile.displayName,
        linePictureUrl: lineProfile.pictureUrl,
        lineUserId: customer.line_user_id!.trim(),
        name: customer.name,
        phone: customer.phone,
      } satisfies CustomerDirectoryItem;
    })
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }

      return right.createdAt.localeCompare(left.createdAt);
    });

  return {
    activeCount: customers.filter((customer) => customer.isActive).length,
    customers,
    disabledCount: customers.filter((customer) => !customer.isActive).length,
    totalCount: customers.length,
  };
}
