# Customer replacement shipments

Approved design: reuse the creation product picker on desktop and mobile; replacement lines are free outbound shipments, not returns.

- [ ] Test normal and replacement lines stay separate at the shared merge boundary.
- [ ] Add a backward-compatible order_items.is_replacement flag, default false, and database guard keeping replacement prices zero.
- [ ] Reuse the existing picker with replacement mode, hiding prices, and prevent customer-price writes.
- [ ] Persist separate lines; preserve classification during edits and consolidation; label delivery print lines.
- [ ] Verify focused tests, lint and TypeScript/build. Do not repair historical data or change warehouse stock algorithms.

Deployment: apply additive SQL migration before using replacement shipments. Fail closed if the column is unavailable; do not silently save them as ordinary lines.
