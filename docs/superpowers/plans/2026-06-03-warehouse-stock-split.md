# Warehouse Stock Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add warehouse-aware stock so each customer order, receipt, adjustment, delivery note, and dashboard can use the correct warehouse without silently defaulting missing customers to the main warehouse.

**Architecture:** Introduce `warehouses` and `product_warehouse_stocks` as the source of truth for stock quantities. Store `warehouse_id` snapshots on operational documents (`orders`, `delivery_notes`, receipts, movements) so historical records keep the warehouse used at the time of the transaction.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres migrations/RPC, TypeScript server actions, React client UI.

---

### Task 1: Database Schema Foundation

**Files:**
- Modify: `supabase/migrations/20260603115604_warehouse_stock_split.sql`

- [ ] Create `warehouses`.
- [ ] Seed `main` and `provincial` per existing organization.
- [ ] Add nullable `default_warehouse_id` to `customers`.
- [ ] Add nullable `warehouse_id` to `orders`, `delivery_notes`, `inventory_receipts`, `inventory_receipt_items`, and `inventory_movements`.
- [ ] Create `product_warehouse_stocks`.
- [ ] Backfill current `products.stock_quantity` into the main warehouse stock row for compatibility.

### Task 2: Server Helpers

**Files:**
- Create: `src/lib/warehouses.ts`

- [ ] Add helpers to load active warehouses.
- [ ] Add helper to require a customer warehouse and return an error when missing.
- [ ] Add helper to resolve an order warehouse from `orders.warehouse_id`.

### Task 3: Stock RPCs

**Files:**
- Add SQL in `supabase/migrations/20260603115604_warehouse_stock_split.sql`
- Modify: `src/app/settings/stock/actions.ts`

- [ ] Update `create_inventory_receipt` to require `p_warehouse_id`.
- [ ] Update `adjust_inventory` to require `p_warehouse_id`.
- [ ] Update `update_inventory_receipt` to preserve and adjust by receipt warehouse.
- [ ] Pass warehouse IDs from server actions.

### Task 4: Order And Delivery Stock Mutations

**Files:**
- Add SQL in `supabase/migrations/20260603115604_warehouse_stock_split.sql`
- Modify: `src/app/orders/incoming/actions.ts`
- Modify: `src/lib/orders/sync-delivery-note.ts`

- [ ] Save `orders.warehouse_id` from the customer warehouse during order creation.
- [ ] Block manual order creation when the customer has no warehouse.
- [ ] Update `create_store_delivery_note` to use `product_warehouse_stocks`.
- [ ] Update stock restore paths to restore to the order/delivery warehouse.

### Task 5: UI Warnings And Filters

**Files:**
- Modify customer settings pages/components.
- Modify order list/order modal components.
- Modify stock pages/components.
- Modify dashboard components.

- [ ] Show a clear warning badge when a customer has no warehouse.
- [ ] Add a warehouse selector to customer forms.
- [ ] Add warehouse tabs/filters to stock and order pages.
- [ ] Add dashboard cards for warehouse summaries and missing customer assignments.

### Task 6: Verification

**Commands:**
- `node -e "const fs=require('fs'),path=require('path');let bad=[];function walk(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\\.(ts|tsx|css|js|mjs|json|md|txt|sql)$/.test(e.name)){const s=fs.readFileSync(p,'utf8');if(/[\\u00C2\\u00C3\\u00E0\\uFFFD]/.test(s)||/\\?{3,}/.test(s))bad.push(p)}}}['src','public','supabase/migrations','docs/superpowers/plans'].forEach(walk);console.log('BAD_FILES='+bad.length);if(bad.length)console.log(bad.join('\\n'));"`
- `npx eslint`
- `npm run build`

