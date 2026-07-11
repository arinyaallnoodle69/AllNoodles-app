# Batch Vehicle Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every active order from one vehicle to another for one date in one operation and keep every print output consistent.

**Architecture:** Store a nullable order-level vehicle override and expose a transaction-safe PostgreSQL RPC that updates matching orders and delivery notes together. Resolve effective vehicles through a shared precedence rule and expose a small responsive client dialog on the incoming-order page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Tailwind CSS, Node test runner.

## Global Constraints

- Do not modify customer default vehicles.
- Do not change products, quantities, prices, stock, billing, or unrelated pages.
- Move only non-cancelled orders for one organization and one exact date.
- Hide the action when no date has at least two represented vehicles.
- Use one database RPC and one page refresh per transfer.

---

### Task 1: Vehicle transfer domain helper

**Files:**
- Create: `src/lib/orders/vehicle-transfer.ts`
- Create: `src/lib/orders/vehicle-transfer.test.ts`

**Interfaces:**
- Produces: `buildVehicleTransferDates(orders, vehicles, fromDate, toDate): VehicleTransferDateOption[]`.
- Produces: `isVehicleTransferInput(input): boolean` for client-side form gating.

- [ ] Write Node tests for single-vehicle hiding, two-vehicle eligibility, date-range grouping, and source order counts.
- [ ] Run `node --experimental-strip-types --test src/lib/orders/vehicle-transfer.test.ts` and verify failure because the helper does not exist.
- [ ] Implement the minimal pure helper.
- [ ] Rerun the test and verify it passes.

### Task 2: Transactional persistence

**Files:**
- Create: `supabase/migrations/202607100900_batch_order_vehicle_transfer.sql`
- Modify: `src/app/orders/incoming/actions.ts`

**Interfaces:**
- Database RPC: `move_orders_between_vehicles(p_organization_id uuid, p_order_date date, p_from_vehicle_id uuid, p_to_vehicle_id uuid)` returning moved order and delivery-note counts.
- Server action: `moveIncomingOrdersVehicleAction(input)` returning `{ success: true; movedOrderCount: number } | { error: string }`.

- [ ] Add `orders.assigned_vehicle_id`, its foreign key/index, and the guarded RPC.
- [ ] Add authenticated server validation and invoke the RPC once.
- [ ] Invalidate only order, delivery, billing, report, and dashboard caches already used by this flow.
- [ ] Run targeted ESLint on the action.

### Task 3: Shared effective vehicle reads

**Files:**
- Modify: `src/lib/orders/detail.ts`
- Modify: `src/lib/orders/sync-delivery-note.ts`
- Modify: `src/app/orders/packing-list/page.tsx`
- Modify: `src/lib/orders/vehicle-product-summary.ts`
- Modify: `src/app/delivery/print/page.tsx`
- Modify: `src/lib/delivery/print.ts`

**Interfaces:**
- Effective order vehicle: active delivery note, then `assigned_vehicle_id`, then customer default.
- Delivery bill vehicle: delivery note vehicle, then order override, then customer default.

- [ ] Select the new override and delivery-note vehicle where needed.
- [ ] Apply the same precedence in every consumer.
- [ ] Preserve the override during later delivery-note synchronization.
- [ ] Run targeted ESLint and TypeScript checks.

### Task 4: Responsive transfer dialog

**Files:**
- Create: `src/components/orders/incoming-orders-vehicle-transfer.tsx`
- Modify: `src/app/orders/incoming/page.tsx`
- Modify: `src/components/orders/incoming-orders-desktop-table.tsx`
- Modify: `src/components/orders/incoming-orders-mobile-list.tsx`

**Interfaces:**
- Consumes the pure date options from Task 1 and the server action from Task 2.
- Produces a compact trigger and portal dialog shared by desktop and mobile list headers.

- [ ] Add trigger visibility based on eligible dates.
- [ ] Add date/source/destination selectors, live order count, pending state, and inline error.
- [ ] Call the server action once and refresh once after success.
- [ ] Confirm modal dimensions, scroll locking, Escape/close behavior, and mobile safe-area padding.

### Task 5: Remove obsolete print-only merge

**Files:**
- Modify: `src/components/orders/pending-orders-section.tsx`

- [ ] Remove temporary merge state, controls, and effective-store remapping.
- [ ] Keep all existing search, tabs, selection, PDF, and print behavior unchanged.
- [ ] Run targeted ESLint.

### Task 6: Verification

**Files:**
- No production files.

- [ ] Run the helper test.
- [ ] Run ESLint on every modified TypeScript/TSX file.
- [ ] Run `npx tsc --noEmit`.
- [ ] Start the existing dev server or reuse an available port.
- [ ] Verify the incoming-order flow on desktop and mobile with Browser tooling: page identity, no error overlay, console health, modal interaction, responsive screenshot, and post-transfer refresh.
