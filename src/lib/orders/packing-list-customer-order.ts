import { isBangkokVehicleGroup, isBkkNoodleStore } from "@/components/print/packing-list-bkk-split";

export type PackingOrderScope = { vehicleId: string; group: "default" | "bkk_noodle" };

export function getCustomerPackingGroup(code: string, metadata: unknown): "default" | "bkk_noodle" {
  const group = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).packing_list_group
    : null;
  return isBkkNoodleStore({ id: code, packingListGroup: typeof group === "string" ? group : null })
    ? "bkk_noodle" : "default";
}

export function getPackingCustomerSortOrder(
  sortOrder: number | null | undefined,
  packingSortOrder: number | null | undefined,
  vehicleId: string | null,
  vehicleName: string | null,
) {
  if (isBangkokVehicleGroup(vehicleId, vehicleName) && packingSortOrder != null) return packingSortOrder;
  return sortOrder ?? Infinity;
}
