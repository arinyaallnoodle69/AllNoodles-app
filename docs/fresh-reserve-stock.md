# Rolling fresh reserve stock

The new page tracks physical Dragon-factory stock in the Bangkok warehouse. It is separate from the existing ANP180–182 production-capacity reserve. Products stay in fresh fulfillment mode.

An administrator/member enters the actual opening quantity for every currently eligible active product once. Start date must be today in Asia/Bangkok. Existing withdrawals are not replayed: they are already reflected in the physical opening count. Outstanding office receipts for today/future dates are carried forward.

Bangkok special items update the stock ledger:

- `remaining`: subtract immediately; editing adjusts only the difference; deletion returns the deducted quantity.
- `office`: add at 00:00 Asia/Bangkok after the item's entry date. Before midnight, edits change the pending amount. After receipt, edits adjust available stock immediately. No scheduled double-posting job is needed; the balance view includes movements once their effective time arrives.
- `claim`, other vehicles and unrelated products do not affect this reserve.

The original factory-order calculations continue. Bangkok office quantities are allocated to the Bangkok fresh fulfillment mode.

Daily special saving is atomic, preserves record IDs, checks the user's loaded snapshot, and rejects insufficient stock without partial changes. The ledger is private; server actions enforce organization and role scope. Display refreshes every 30 seconds and on focus.

Tables are scoped by organization, warehouse and supplier so future provincial/Lotus groups can remain independent. Initialization currently enables only Bangkok/Dragon. Newly added products after opening require an explicit opening workflow before extending this reserve; that workflow and provincial UI are outside this delivery.

Migration: `20261009133427_fresh_reserve_stock.sql`. Regenerate database types after schema changes. Verification: `node scripts/verify-fresh-reserve-stock.mjs` against a disposable local PostgreSQL instance on port 55439; the script rolls back all schema/data fixtures. Never run fixture initialization against production.
