export const BKK_NOODLE_GROUP = "bkk_noodle";

export function isBangkokVehicleGroup(vehicleId: string | null, vehicleName: string | null): boolean {
  if (vehicleName && (vehicleName.includes("กรุงเทพ") || vehicleName.toLowerCase().includes("bkk"))) {
    return true;
  }
  if (vehicleId === "67c8b5f9-6cdf-4c83-a464-40827f561939") {
    return true;
  }
  return false;
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
          if (store.packingListGroup === BKK_NOODLE_GROUP) {
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
