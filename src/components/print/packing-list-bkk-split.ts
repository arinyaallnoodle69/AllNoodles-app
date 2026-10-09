export const BKK_NOODLE_GROUP = "bkk_noodle";

export const BKK_NOODLE_CUSTOMER_CODES = new Set([
  "ANS002", "ANS004", "ANS003", "ANS033", "ANS034", "ANS035", "ANS036", "ANS037",
  "ANS038", "ANS006", "ANS005", "ANS007", "ANS039", "ANS040", "ANS009", "ANS042",
  "ANS043", "ANS044", "ANS045", "ANS046", "ANS047", "ANS011", "ANS019", "ANS050",
  "ANS021", "ANS052", "ANS053", "ANS054", "ANS055", "ANS056", "ANS189", "ANS058",
  "ANS026", "ANS028", "ANS060", "ANS061", "ANS062", "ANS063", "ANS064",
]);

export function isBangkokVehicleGroup(vehicleId: string | null, vehicleName: string | null): boolean {
  if (vehicleName && (vehicleName.includes("กรุงเทพ") || vehicleName.toLowerCase().includes("bkk"))) {
    return true;
  }
  if (vehicleId === "67c8b5f9-6cdf-4c83-a464-40827f561939") {
    return true;
  }
  return false;
}

export function isBkkNoodleStore(store: { id: string; packingListGroup?: string | null }): boolean {
  if (store.packingListGroup === BKK_NOODLE_GROUP) {
    return true;
  }
  if (store.packingListGroup === "default") {
    return false;
  }
  const baseCode = (store.id || "").replace(/-R$/, "").trim().toUpperCase();
  return BKK_NOODLE_CUSTOMER_CODES.has(baseCode);
}

export type PackingListStoreLike = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  packingListGroup?: string | null;
};

export type PackingListVehicleLike = {
  id: string;
  name: string;
};

export type VehicleGroup = {
  vehicleId: string | null;
  vehicleName: string | null;
  storeIndices: number[];
  combinedStoreIndices?: number[];
  isBkkMain?: boolean;
  isBkkNoodles?: boolean;
};

export function buildVehicleGroups(data: {
  stores: PackingListStoreLike[];
  vehicles: PackingListVehicleLike[];
}): VehicleGroup[] {
  const groups: VehicleGroup[] = [];

  for (const vehicle of data.vehicles) {
    if (isBangkokVehicleGroup(vehicle.id, vehicle.name)) {
      const allBkkStoreIndices: number[] = [];
      const mainStoreIndices: number[] = [];
      const noodleStoreIndices: number[] = [];

      data.stores.forEach((store, index) => {
        if (store.vehicleId === vehicle.id || isBangkokVehicleGroup(store.vehicleId, store.vehicleName)) {
          allBkkStoreIndices.push(index);
          if (isBkkNoodleStore(store)) {
            noodleStoreIndices.push(index);
          } else {
            mainStoreIndices.push(index);
          }
        }
      });

      if (mainStoreIndices.length > 0) {
        groups.push({
          vehicleId: vehicle.id,
          vehicleName: vehicle.name || "รถกรุงเทพ",
          storeIndices: mainStoreIndices,
          combinedStoreIndices: allBkkStoreIndices,
          isBkkMain: true,
        });
      }

      if (noodleStoreIndices.length > 0) {
        groups.push({
          vehicleId: `${vehicle.id}__noodles`,
          vehicleName: "รถกรุงเทพบะหมี่",
          storeIndices: noodleStoreIndices,
          combinedStoreIndices: allBkkStoreIndices,
          isBkkNoodles: true,
        });
      }
    } else {
      const storeIndices: number[] = [];
      data.stores.forEach((store, index) => {
        if (store.vehicleId === vehicle.id) {
          storeIndices.push(index);
        }
      });
      if (storeIndices.length > 0) {
        groups.push({
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          storeIndices,
        });
      }
    }
  }

  // Any stores not matched above (e.g. unassigned stores)
  const handledIndices = new Set(groups.flatMap((g) => g.storeIndices));
  const unassignedStoreIndices: number[] = [];
  data.stores.forEach((store, index) => {
    if (!handledIndices.has(index)) {
      unassignedStoreIndices.push(index);
    }
  });

  if (unassignedStoreIndices.length > 0) {
    groups.push({
      vehicleId: null,
      vehicleName: null,
      storeIndices: unassignedStoreIndices,
    });
  }

  return groups;
}
