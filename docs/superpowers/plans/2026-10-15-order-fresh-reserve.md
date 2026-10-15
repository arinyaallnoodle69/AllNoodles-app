# Order fresh reserve implementation plan

Goal: choose fresh reserve in the existing product picker, without double withdrawal or factory ordering.

Architecture: persist a supply source per order item (legacy, factory, reserve). Preserve historical rows; resolve new normal provincial items by their order date. Database transactions serialize changes against the reserve group, validate availability, and record deltas. All documents read the same source. Manual saves use a request ID to make retries safe.

- [x] Add source, database validation, stock views, audited withdrawals and atomic request-deduplicated manual save. Test create/edit/delete/cancel, weekdays, shortage, retry and warehouse isolation before applying.
- [x] Reuse the existing desktop/mobile product picker, loading available reserve for the selected warehouse. Keep quantities in base units; show stock and validate the combined cart.
- [x] Preserve source when editing; reset source when importing an earlier order. Separate factory/reserve merge keys. Exclude reserve from factory demand, retain complete loading/order/customer billing quantities.
- [x] Verify SQL with rollback fixtures, relevant Node tests, TypeScript, lint, build and desktop/mobile fixture render. Regenerate database types from the database. No deployment.

Verification on 2026-10-15: 25 relevant Node checks passed; rollback SQL lifecycle/shortage/retry/weekday/warehouse/unit/deletion checks passed; lint and production build passed. Existing picker rendered at 393x852 and 1280x900 with synthetic data, positive reserve only. Screenshots are in output/order-reserve. Database migrations applied to bfgeoddvcjdcixspgksf; application not deployed. No production orders were created for testing. Bangkok group remains 220 available; provincial negative historical balances remain unchanged and require real stock reconciliation, not an automatic reset.

Safety limits: explicit reserve orders use the detail editor or cancellation for stock restoration. Legacy destructive rebuilds, order-date/warehouse moves and product-mode changes with active reserve rows are rejected rather than silently changing stock accounting. Existing Bangkok remaining entries cannot overlap explicit reserve deductions for the same date/product. Importing history starts a new normal order intent and does not silently reuse the old reserve source. Stock-mode products remain in their original flow.

Supabase security advisors reported no findings naming the new reserve objects or manual-save receipt table. Existing project-wide findings remain outside this feature's scope; this is not a full security audit. Real iPhone gestures and an authenticated end-to-end production order save were not tested.
