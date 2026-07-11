# Batch Vehicle Transfer Design

## Goal

Allow staff to move every active order assigned to one vehicle onto another vehicle for one delivery date, with one confirmation and one database transaction. The move must affect the incoming-order list, packing list, vehicle summary, and delivery bill without changing the customer's default vehicle for future dates.

## Scope

- Add a nullable order-level vehicle override (`orders.assigned_vehicle_id`).
- Add one transactional database function that moves matching active orders and their non-cancelled delivery notes from a source vehicle to a destination vehicle.
- Add a responsive `ย้ายรถ` dialog to the incoming orders page.
- Show the action only when at least one visible date has orders assigned to two or more vehicles.
- Remove the temporary print-modal-only vehicle merge UI.
- Do not change customer default vehicles, order products, quantities, prices, stock, billing, or unrelated pages.

## Vehicle Resolution

The effective vehicle for an order is resolved in this order:

1. An active delivery note's `vehicle_id`.
2. The order's `assigned_vehicle_id`.
3. The customer's `default_vehicle_id`.

The batch transfer writes both `orders.assigned_vehicle_id` and active `delivery_notes.vehicle_id`. Future delivery-note synchronization uses the order override before the customer default, so editing an order cannot silently revert a completed move.

## Interaction

The incoming-order page shows a compact `ย้ายรถ` action beside the vehicle list controls. Opening it presents:

- Delivery date (fixed for a single-day view; selectable when the page contains multiple eligible dates).
- Source vehicle, limited to vehicles that currently have orders on that date.
- Destination vehicle, limited to other vehicles that currently have orders on that date.
- A live count of orders that will move.
- A single confirmation button that is disabled for invalid or in-flight states.

The dialog is centered on desktop and behaves as a bottom sheet on mobile. It renders through a portal so parent width and overflow rules cannot clip it. On success it closes and refreshes the current route; on failure it remains open and shows the server error.

## Data Integrity

The database function validates organization ownership, ISO date input, active source/destination vehicles, and different source/destination IDs. It matches only non-cancelled orders whose current effective order assignment is the source vehicle. Updating orders and delivery notes happens within one PostgreSQL function call and therefore one transaction.

## Performance

- One RPC call performs the write; there is no client loop and no request per order.
- An index on organization, order date, and assigned vehicle supports future lookups.
- Date/vehicle/count options are derived once from data already loaded by the page.
- The list refreshes once after success.

## Verification

- Unit-test eligibility grouping and moved-order counts with Node's built-in test runner.
- Run targeted ESLint and TypeScript checks.
- Verify desktop and mobile dialog layout, disabled states, and a successful interaction when a local authenticated environment is available.
