export type VehicleTransferOrder = {
  customerCode: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: string;
  vehicleId: string | null;
};

export type VehicleTransferVehicle = {
  id: string;
  name: string;
};

export type VehicleTransferStore = {
  customerCode: string;
  customerId: string;
  customerName: string;
  orderCount: number;
};

export type VehicleTransferSourceVehicle = VehicleTransferVehicle & {
  orderCount: number;
  stores: VehicleTransferStore[];
};

export type VehicleTransferDateOption = {
  date: string;
  sourceVehicles: VehicleTransferSourceVehicle[];
  vehicles: VehicleTransferVehicle[];
};

export type VehicleTransferInput = {
  customerIds: string[];
  date: string;
  fromVehicleId: string;
  toVehicleId: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isVehicleTransferInput(input: VehicleTransferInput) {
  return (
    ISO_DATE_PATTERN.test(input.date) &&
    Boolean(input.fromVehicleId) &&
    Boolean(input.toVehicleId) &&
    input.fromVehicleId !== input.toVehicleId &&
    input.customerIds.some((customerId) => customerId.trim().length > 0)
  );
}

export function buildVehicleTransferDates(
  orders: VehicleTransferOrder[],
  vehicles: VehicleTransferVehicle[],
  fromDate: string,
  toDate: string,
): VehicleTransferDateOption[] {
  if (vehicles.length < 2) return [];

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const storesByDateAndVehicle = new Map<string, Map<string, Map<string, VehicleTransferStore>>>();

  for (const order of orders) {
    if (
      order.status === "cancelled" ||
      !order.vehicleId ||
      !vehicleById.has(order.vehicleId) ||
      order.orderDate < fromDate ||
      order.orderDate > toDate
    ) {
      continue;
    }

    const vehiclesForDate = storesByDateAndVehicle.get(order.orderDate) ?? new Map();
    const storesForVehicle = vehiclesForDate.get(order.vehicleId) ?? new Map();
    const currentStore = storesForVehicle.get(order.customerId);
    storesForVehicle.set(order.customerId, currentStore
      ? { ...currentStore, orderCount: currentStore.orderCount + 1 }
      : {
          customerCode: order.customerCode,
          customerId: order.customerId,
          customerName: order.customerName,
          orderCount: 1,
        });
    vehiclesForDate.set(order.vehicleId, storesForVehicle);
    storesByDateAndVehicle.set(order.orderDate, vehiclesForDate);
  }

  return Array.from(storesByDateAndVehicle.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, vehiclesForDate]) => ({
      date,
      sourceVehicles: vehicles.flatMap((vehicle) => {
        const stores = Array.from(vehiclesForDate.get(vehicle.id)?.values() ?? []);
        if (stores.length === 0) return [];
        return [{
          ...vehicle,
          orderCount: stores.reduce((total, store) => total + store.orderCount, 0),
          stores,
        }];
      }),
      vehicles,
    }))
    .filter((option) => option.sourceVehicles.length > 0);
}
