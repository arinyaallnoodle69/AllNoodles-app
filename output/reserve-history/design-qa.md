# Per-product reserve history — 2026-10-15

final result: passed

Scope: actual history component rendered with mocked read actions, mobile 390x844 and 320x740, desktop 1280x900. SQL read path separately checked against all 44 existing reserve openings; zero reconciliation mismatches. No inventory or order data modified.

Source: user-selected codex-clipboard-7933bfbe-1f1e-4cff-b573-131e91c94359.png (853x1844, approximately 390x844 CSS pixels). Source and implementation were opened together in a single comparison tool result. Evidence: mobile.png and desktop.png in this directory.

Preserved: purple fixed title bar, back/close, product photo/name/SKU/warehouse/supplier, pale balance panel, date-range control, bordered receive/pay/remaining table, date groups and carry rows, purple final balance, earlier-record button. Actual catalog product photo and existing Noto Sans Thai font replace the illustrative image/font. The sample-data badge is intentionally absent in the production component. Desktop centers the same component with internal scrolling. Minor remaining P3: solid system purple instead of the mock's subtle header gradient.

Resolved: mobile transaction labels initially wrapped unnecessarily; customer labels and cell padding now match the compact reference. At 320px, time cells initially exceeded available width by 2px; column proportions were corrected and browser measurement now reports zero overflowing cells, with document width equal to viewport width. Date submission now reads native form values; browser confirmed filtering to Oct 14 only leaves the day's closing balance at 40 while the current balance stays 20.

Browser checks: close/reopen, date selection and apply, earlier-range expansion, error state with retry control, fixed close control, no console errors. Table font is 16px on mobile, 18px on desktop. Data tests cover midnight pending receipts, returns, decimals, historical ending date, empty history, and ranges preceding initialization. History is read-only; legacy provincial entries are explicitly labeled current net order quantities, not fabricated edit logs.

Limitations: authenticated production UI and physical iPhone gestures were not tested. The fixture never calls production mutations. Application not deployed; read-only history RPC migration applied and database types regenerated.


## Compact overview and modal adjustments — 2026-10-15

final result: passed

Source: selected exec-ae2be217-fae5-4da5-9294-459c9a2175a3.png, opened alongside the rendered Bangkok mobile view in one comparison result. Implemented flat image/name/quantity rows, inline purple actions, compact warehouse tabs and toolbar, single-line usable-stock summary, collapsed rules/shortage details, and an all-product movement table modal. Per-product history remains available. Images have no surrounding frame, background panel, radius, or clipping container.

The user's newer full-name requirement takes precedence over the mock's shared title/quantity line: names span the available content width before quantities/actions, without ellipsis or line clamps. All fixture names fit one line at 390px; narrow screens and longer names can wrap naturally. Data preserves catalog order, now using display_order then SKU, matching product management's tie-break order. On sub-360px screens action labels collapse to accessible icons while retaining 44px tap targets.

Browser verified actual components with mocked data/actions at 320px, 390px and 1280px. Initial negative balances compressed SKU text; the fixed SKU column and wrapping quantity/actions resolved this. Final mobile measurements show no overflowing product text. Typical non-shortage product rows are approximately 85px. Both warehouses, adjustment modal open/close, and warehouse table modal were inspected. New dialogs lock background scrolling, trap keyboard focus, and block closing while saving. Existing mutation payload, expected balance, scope, and error retention remain tested.

Evidence: compact-bangkok-mobile.png, compact-province-mobile.png, compact-adjust-mobile.png, compact-province-desktop.png. Twelve targeted tests, lint and production build passed. No SQL changes required for the compact overview. Warehouse overview preserves the existing latest-50 scope; legacy movements lacking a saved remaining balance show a dash rather than an invented number. The separate per-product history continues to use its existing reconstructed balance logic. No real stock adjustment was submitted and no deployment performed.

## Mobile overlap correction

The previous compact fixture omitted application globals.css. Its earlier fixed-SKU-column measurements therefore did not represent the enlarged system mobile typography. The fixture now imports the actual globals.css. SKU occupies its own line; quantities and actions wrap independently without a negative margin. Product names remain unclamped and photos remain frameless.

Rechecked with real system CSS: Bangkok at 375x812 and province at 320x740, with no measured overflowing elements. Both screenshots were visually inspected (overlap-fixed-bangkok.png and overlap-fixed-province.png). Narrow screens use accessible action icons; large shortage quantities can move actions to a separate line. Five targeted editor/history tests, full lint, production build and git diff --check passed. Physical iPhone and authenticated production rendering remain untested. No SQL or stock-data changes were made for this correction.

Warehouse history redesign evidence and latest result are recorded in ../../design-qa.md. Selected source is codex-clipboard-8bb8782c-980d-435f-ace7-4b92490aac89.png; comparison warehouse-comparison.png. No SQL migration needed.
