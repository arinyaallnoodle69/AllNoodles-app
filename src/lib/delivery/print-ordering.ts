const customerCodeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function getCodeSequence(code: string) {
  const match = code.trim().match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function compareCustomerCode(leftCode: string, rightCode: string) {
  const leftSequence = getCodeSequence(leftCode);
  const rightSequence = getCodeSequence(rightCode);

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return customerCodeCollator.compare(leftCode.trim(), rightCode.trim());
}

export type DeliveryPrintCustomerOrderRow = {
  created_at?: string | null;
  customer_id: string;
  delivery_date: string;
  customers: {
    customer_code?: string | null;
    name?: string | null;
  };
};

export function sortDeliveryPrintRowsByCustomerOrder<T extends DeliveryPrintCustomerOrderRow>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const dateComparison = left.delivery_date.localeCompare(right.delivery_date);
    if (dateComparison !== 0) return dateComparison;

    const codeComparison = compareCustomerCode(
      left.customers.customer_code ?? "",
      right.customers.customer_code ?? "",
    );
    if (codeComparison !== 0) return codeComparison;

    const nameComparison = (left.customers.name ?? "").localeCompare(right.customers.name ?? "", "th");
    if (nameComparison !== 0) return nameComparison;

    const createdComparison = (left.created_at ?? "").localeCompare(right.created_at ?? "");
    if (createdComparison !== 0) return createdComparison;

    return left.customer_id.localeCompare(right.customer_id);
  });
}

export type DeliveryPrintDataOrderRow = {
  deliveryDate: string;
  customer: {
    code: string;
    name: string;
  };
};

export function sortDeliveryPrintDataByCustomerOrder<T extends DeliveryPrintDataOrderRow>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const dateComparison = left.deliveryDate.localeCompare(right.deliveryDate);
    if (dateComparison !== 0) return dateComparison;

    const codeComparison = compareCustomerCode(left.customer.code, right.customer.code);
    if (codeComparison !== 0) return codeComparison;

    return left.customer.name.localeCompare(right.customer.name, "th");
  });
}
