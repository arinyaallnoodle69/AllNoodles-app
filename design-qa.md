# Reserve stock implementation QA

final result: passed

Scope: opening setup for both warehouses, compact reserve overview, and shared balance editor. Passed refers to the rendered components and the approved responsive layout; authenticated production integration remains unverified.

Compared the four approved image references with actual page/component renders in `output/reserve-stock/implementation-comparison.png`. References were normalized to the same mobile comparison region. Catalog images/names differ intentionally: reference products were illustrative, implementation uses existing product assets. The fixture omits the existing authenticated app shell and bottom navigation; neither was changed.

Accepted differences requested by the user: preserve existing app typography/components; province displays remaining quantity only, without supply/order/pending/status columns. Desktop retains the existing table layout.

Resolved findings:
- P1: sticky mobile summary obscured the final input row. Summary now follows all products; desktop keeps its existing sticky footer.
- P2: long placeholder was clipped in the two-column input. Blank-as-zero remains explained above; input placeholder is now `0`.
- P2: unequal product-name lengths moved paired inputs out of alignment. Cards use flex columns with inputs aligned at the bottom.
- P2: primary action and History occupied separate mobile rows. They now share one row.

Evidence: current-bangkok-setup-mobile.png, current-province-setup-mobile.png, current-bangkok-stock-mobile.png, current-province-stock-mobile.png, current-bangkok-setup-desktop.png, current-province-setup-desktop.png, current-province-stock-desktop.png. Browser verified 320px and approximately 393px mobile layouts with no horizontal overflow, 48px opening inputs, and desktop table layout at 1280px.

Behavior verification: 12 Node tests passed, including partial opening quantities, scoped save preservation, failure retaining drafts, provincial shortage snapshots, and factory ordering isolation. Temporary SQL fixtures passed 25 provincial assertions plus 12 Bangkok assertions, rolled back without production data changes. New provincial RPC is service-role-only and checks active organization membership and fresh supplier/warehouse eligibility. Migration applied; generated database types refreshed. Lint and production build passed.

Limits: live app requires PIN login; no actual opening or adjustment was submitted through the browser. There are currently zero eligible provincial fresh Lotus products, so populated province screenshots use clearly labeled fixtures. No deployment performed. Existing project security advisor findings outside this change were left unchanged; the new RPC is not executable by anon/authenticated, and its view uses security_invoker.
