# Fast Manual Order Save Design

## Goal

Reduce the time between pressing Save and being able to enter the next customer's order, while preserving the existing business results: the order and its items are stored, same-day orders are merged, the delivery note is synchronized, billing and notifications are updated, and affected cached pages eventually refresh.

## Current bottleneck

`createManualOrderAction` performs the core order write, delivery-note rebuild, document-related work, broad cache invalidation, and then the client refreshes the full incoming-orders route inside the same transition. The Save button remains pending for this entire chain.

## Proposed flow

### Foreground transaction

The Server Action must finish these steps before returning success:

1. Authenticate and validate the customer warehouse.
2. Find or create the customer's order for the selected date and warehouse.
3. Merge and persist all submitted order items.
4. Return the stable order ID and displayed order number.

These are the minimum writes required before the UI may truthfully say the order was saved.

### Immediate client response

After the foreground action succeeds:

1. Stop the Save spinner.
2. Show the short success toast.
3. Reset the form while retaining the selected order date.
4. Open the customer picker for continuous entry.
5. Update the local "ordered today" count.
6. Do not call a blocking full-route `router.refresh()` in the save transition.

### Deferred reconciliation

After the response path, run the existing delivery-note synchronization, order-number reconciliation, billing snapshots, LINE notification, dashboard/report invalidation, and broad cache revalidation. This work remains functionally identical but no longer blocks the operator from entering the next order.

The deferred job must be idempotent: rerunning it for the same order may update/rebuild the same delivery note but must not create duplicate documents, stock movements, or notifications.

## Failure handling

- If the foreground order write fails, keep the form open and show the existing error. Do not report success.
- If deferred reconciliation fails, preserve the saved order, log the failure with the order ID, and expose a retryable warning for document synchronization rather than asking the user to re-enter the order.
- Disable Save while the foreground request is in flight to prevent double submission.

## Cache policy

- Invalidate only the incoming-order data needed for subsequent actions immediately.
- Use stale-while-revalidate (`revalidateTag(tag, "max")`) for reports, stock summaries, billing lists, and dashboards that can refresh after the response.
- Avoid broad `updateTag()` calls in the foreground because Next.js waits for fresh tagged data when immediate read-your-own-writes behavior is requested.

## Verification

1. Measure foreground Server Action duration before and after the split.
2. Verify new orders and same-day merged orders preserve quantities, totals, warehouse, and notes.
3. Verify exactly one correct delivery note is produced after reconciliation.
4. Verify stock effects and billing snapshots match the pre-change behavior.
5. Verify rapid consecutive entry for multiple customers does not duplicate submissions.
6. Run ESLint and the production build.

