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


## Per-product movement history — 2026-10-15

final result: passed

Scoped comparison, corrections, browser checks, database reconciliation, and limitations are recorded in [output/reserve-history/design-qa.md](output/reserve-history/design-qa.md). Existing overview/setup QA above is retained.


## Compact reserve overview — 2026-10-15

final result: passed

See the compact overview section in output/reserve-history/design-qa.md for reference comparison, full-name adaptation, ordering, dialog checks, and verification limits.

## Warehouse history redesign — selected daily ledger

final result: passed

Source: C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8bb8782c-980d-435f-ace7-4b92490aac89.png (853x1844). Browser implementation: output/reserve-history/warehouse-mobile.png (390x844 CSS viewport, device density normalized to 390x844). Side-by-side full comparison: output/reserve-history/warehouse-comparison.png, source left, implementation right. Full comparison keeps headers, date controls, all six sample rows and footer readable, so no separate focused crop was necessary. Actual application globals.css was loaded.

Reference mapping: compact purple title/close, warehouse and supplier, today/week/custom range controls, four-column 55/15/15/15 table, lavender day groups, full product names and time/reason subtitle, purple per-product balances, outline load-more action and record count. Production omits the sample-data badge. Loading is 50 records per request; fixture uses six of eight for visual comparison. Sorting/filtering follows recording time in Asia/Bangkok, newest first. Pending effective receipts are explicitly labeled and their remaining balance is not presented as available.

Comparison history: first capture revealed a blank title caused by system heading color; explicit white title fixed it. The initial metadata line and row padding made the table too tall; the extra line was removed and cell padding reduced. Post-fix comparison warehouse-comparison.png shows no actionable P0/P1/P2 issues. Remaining P3: flat system purple instead of mock gradient, real Noto Sans Thai differs slightly from the raster mock font, footer can require a short scroll with a reserved desktop-style scrollbar. Native font and actual names are deliberately preserved.

Fidelity surfaces: Noto Sans Thai full names at 16px, metadata at 13px, numeric cells 17px; scoped CSS avoids global mobile type enlargement affecting this dense table. No truncation/clamps. Layout matches primary regions with thin separators and day strips; 320px moves the date range to a separate row. Colors retain #4A148C/#6D28D9 and lavender #F0E9FF. No raster assets are required; installed Lucide building/calendar/close icons match the source. Copy uses live warehouse/supplier names and real counts; current dates derive from Bangkok time. Historical null balances remain dashes; numeric zero remains zero.

Browser evidence: warehouse-mobile.png, warehouse-province-320.png, warehouse-desktop.png (1280x900). Tested today, custom range submission, seven-day reset, load-more 6 to 8, close/reopen, narrow-screen quantities including 1,234.5, no horizontal overflowing cells, error with retry, always-reachable close control. Browser console had no errors. Modal maintains background scroll lock and focus trap; stock adjustment modal behavior remains tested.

Data verification: ten targeted tests passed, including organization boundary rejection, invalid calendar dates, Bangkok midnight/end-date bounds, cursor precision through microseconds, independent full-range counts, late-response rejection, zero/missing/pending distinction and unchanged balance editor protections. Actual server query path was run read-only against both existing warehouse groups: 3 and 5 matching records, with cursor/count checks. No stock/order data or schema changed. Full lint and production build passed before final cursor precision correction; targeted tests and real query checks passed after it, with final lint/build pending below.

Limitations: no physical iPhone or authenticated end-to-end browser session tested. Browser uses actual production components/CSS with mocked read actions; the actual database action was verified separately. No deployment.

Final verification update: final cursor-precision version passed full lint, production build, all ten targeted tests, real read-only queries for both warehouse groups, and git diff --check. Browser also verified an empty custom date range and Escape dismissal. final result: passed.
