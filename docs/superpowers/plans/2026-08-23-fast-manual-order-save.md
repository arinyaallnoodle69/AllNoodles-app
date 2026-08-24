# Fast Manual Order Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return control to the order-entry operator immediately after the order and items are durably saved, without changing the eventual delivery-note, billing, notification, stock, or cache results.

**Architecture:** Split `createManualOrderAction` into a foreground durable order write and an idempotent deferred reconciliation scheduled with Next.js `after()`. Remove the blocking full-route refresh from the modal and preserve immediate local UI feedback. Record timing at the foreground/reconciliation boundaries for verification.

**Tech Stack:** Next.js 16.1.5 App Router, React 19, TypeScript, Supabase/Postgres, Next.js Server Actions and `after()`.

**Spec:** `docs/superpowers/specs/2026-08-23-fast-manual-order-save-design.md`

## Global Constraints

- The UI may report success only after the order and submitted items are durably stored.
- Delivery-note, billing, notification, stock, and cache outcomes must remain equivalent to the existing successful workflow.
- Save remains disabled while the foreground request is pending.
- Do not block continuous order entry on full-route refresh or document reconciliation.

---

### Task 1: Extract and test reconciliation scheduling boundary

**Files:**
- Modify: `src/app/orders/incoming/actions.ts`
- Test: `src/lib/orders/manual-order-save.test.ts`

**Interfaces:**
- Produces: `runManualOrderReconciliation(input): Promise<void>` for the existing delivery-note synchronization, order-number update, billing/notification work, and invalidation.
- Consumes: saved `orderId`, `organizationId`, `customerId`, `userId`, and fallback order number.

- [ ] Add a focused test proving the foreground result does not await a controllable reconciliation promise.
- [ ] Run the focused test and confirm it fails before extraction.
- [ ] Extract the reconciliation function and schedule it through `after()` only after the core order/item write succeeds.
- [ ] Run the focused test and confirm it passes.

### Task 2: Make the modal complete immediately after the foreground save

**Files:**
- Modify: `src/components/orders/create-order-modal.tsx:2304-2343`

**Interfaces:**
- Consumes: the foreground `ActionResult` from `createManualOrderAction`.
- Produces: immediate toast, local ordered-count update, reset form, and customer picker reopening without a blocking `router.refresh()`.

- [ ] Add a regression assertion that the submit success path no longer invokes a blocking route refresh.
- [ ] Remove `router.refresh()` from the save transition while retaining the existing local count update and form reset.
- [ ] Confirm validation, error display, double-submit prevention, and continuous-entry behavior remain intact.

### Task 3: Verify performance and behavior

**Files:**
- Modify: `src/app/orders/incoming/actions.ts`

**Interfaces:**
- Produces: structured development timing logs for foreground save and deferred reconciliation.

- [ ] Add timing measurements around foreground persistence and deferred reconciliation without logging customer contents or credentials.
- [ ] Run the focused regression checks.
- [ ] Run ESLint for all modified TypeScript files.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Review the final diff to confirm no pricing, merge, warehouse, delivery-note, stock, or billing calculation logic changed.

