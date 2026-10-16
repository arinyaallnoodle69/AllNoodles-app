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

---

# Fresh reserve recent activity

Reference: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-931b1cb3-368c-488a-ac10-6e15e2f60745.png`

Scope: compact movement rows in the existing fresh reserve stock page, full product names, word-labelled arithmetic, current balance separated from pending receipt forecasts. Existing stock rules and history modal retained.

Verification: balance and rendering regression tests; TypeScript and production build. Browser probe uses actual components with simulated data at port 3028.

Visual verification blocked: the in-app browser returned “Local browser use is disabled in Work settings”. No screenshot comparison or mobile viewport inspection was possible. Single-line equations retain horizontal scrolling for unusually long values rather than hiding figures.

final result: blocked

## Permanent scheduling and receipt events / ledger colour cues

Warehouse history now reads a server-only security-invoker event view. Deferred office movements expose a permanent scheduling event at creation time plus a separate receipt event at effective time. Date filters, event counts, stable forward pagination and date grouping follow the event timestamp. The scheduling equation reconstructs the usable balance at the scheduling time, rather than borrowing the product's current balance. The view adds no stock writes. Applied `20261017010000_reserve_history_events.sql` and regenerated database types through Supabase.

Live database checks found four scheduled/received pairs, no duplicated events, and the sum of actual receipt/movement quantities equal to original stock movements. Unit/rendering checks cover the midnight boundary, persistent scheduled status, separate date headings, historical balances, cursor validation and unchanged current stock.

Individual-product ledger headers and nonempty values now use green plus icons for receipts and red minus icons for issues. Returns in the issue column use a plus icon with an explanatory legend. Adjustments remain purple; balance figures are slightly bolder, preserving their original colours and final-cell highlight. Empty cells stay neutral.

Visual verification remains blocked by Work browser settings; real mobile icon spacing and sticky behaviour have not been visually confirmed.

Correction: the selected movement design belongs inside the existing “ประวัติรวม” dialog. The standalone bottom section and its page-level reads have been removed. The dialog now renders the shared compact movement rows, while keeping date filters, pagination, and error states. Regression coverage explicitly opens the history trigger and checks the equations inside that dialog, and checks that the stock page has no separate movement section. Visual inspection remains blocked by Work browser settings.

## Shared stock factory and brand filters

Both `/stock` and `/orders/fresh-reserve-stock` now use `ProductFactoryBrandFilters`: the existing purple underlined horizontal options and label-triggered picker. Reserve stock filters only its existing warehouse/supplier eligibility and preserves catalog product order; brands follow the configured `product_brands.sort_order`. No stock calculations or mutations changed.

Verification: eight filter and history regression checks passed, including selection/reset, missing brands, empty products, horizontal strip handling, and opening/selecting the picker. Mobile/desktop visual comparison remains unverified because local browser use is disabled in Work settings.

## Movement typography and colour correction

Reference: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-e6ace71f-ee13-4e6e-8a31-670b0a4bac7f.png`; reported application mismatch: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-3ec2196d-e957-4df4-b2b1-5fbe9bc81f31.png`.

Removed the history wrapper's universal `font-weight: 500 !important`, which overrode the movement component's bold hierarchy. Product headings now explicitly use dark navy and bold weight; balances use deep purple, equation results vivid purple, receipts green, withdrawals red and pending receipts orange. Updated the movement heading, units and tinted equation backgrounds to follow the selected reference. Existing data, dates, pagination and equations are preserved.

Eight rendering/behaviour checks passed. Visual verification was attempted again: `cua.getState()` returned “Local browser use is disabled in Work settings”. Pixel comparison and real viewport verification remain blocked; no claim of pixel-perfect matching.

final result: blocked

## History chronological order

Warehouse history now queries recording time ascending, with ascending ID as its stable tie-breaker and a matching forward pagination cursor. The timeline displays recording time consistently with its date headings and date filter. Office receipts retain a separate effective-date/time line, so midnight receipts do not look out of order. No stock calculations or stored movements changed.

Twelve action/rendering regression checks passed, including forward cursor bounds, timestamp ties, snapshot/count isolation and separate recording/effective time. Browser visual verification remains blocked by the Work browser setting.

Pending receipt clarification: only rows that are still waiting show the orange pending label, current usable balance, forecast equation and effective-time line. Completed office receipts remain green and no longer show the potentially confusing effective-time line. Recording-time ordering is unchanged. Nine movement/history regression checks passed; browser visual verification remains blocked as recorded above.

## Selected compact individual-product history

Reference: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-096a3e5b-5199-4b82-9aa3-6ca124d0fc9c.png`.

Replaced the tall product/image and balance blocks with compact product identity and side-by-side current balance. The ledger uses five columns: description with time below, office receipts, issues, signed adjustments and remaining. Opening rows now say “ของเหลือ”. Adjustment reasons are available through an accessible information disclosure instead of making every row tall. All five header cells are sticky within the single two-axis scroll container. Pending receipts remain separate and never enter the received column before becoming effective. Returns appear as negative issues; cancelled office receipts appear as negative adjustments.

Nine ledger/rendering tests and production build passed. Visual comparison and real mobile sticky-header behaviour remain unverified because local browser access is disabled in Work settings.

final result: blocked
