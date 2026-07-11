export type VehicleTransferOrder = {
  orderDate: string;
  status: string;
  vehicleId: string | null;
};

export type VehicleTransferVehicle = {
  id: string;
  name: string;
};

export type VehicleTransferDateOption = {
  date: string;
  vehicles: Array<VehicleTransferVehicle & { orderCount: number }>;
};

export type VehicleTransferInput = {
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
    input.fromVehicleId !== input.toVehicleId
  );
}

export function buildVehicleTransferDates(
  orders: VehicleTransferOrder[],
  vehicles: VehicleTransferVehicle[],
  fromDate: string,
  toDate: string,
): VehicleTransferDateOption[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const countsByDate = new Map<string, Map<string, number>>();

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

    const dateCounts = countsByDate.get(order.orderDate) ?? new Map<string, number>();
    dateCounts.set(order.vehicleId, (dateCounts.get(order.vehicleId) ?? 0) + 1);
    countsByDate.set(order.orderDate, dateCounts);
  }

  return Array.from(countsByDate.entries())
    .filter(([, dateCounts]) => dateCounts.size >= 2)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, dateCounts]) => ({
      date,
      vehicles: vehicles.flatMap((vehicle) => {
        const orderCount = dateCounts.get(vehicle.id);
        return orderCount ? [{ ...vehicle, orderCount }] : [];
      }),
    }));
}
