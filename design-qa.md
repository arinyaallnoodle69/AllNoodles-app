# Fresh reserve stock design QA

final result: passed

Selected target: `codex-clipboard-ef69cab1-7a78-4688-a8fa-56e2cb1d4a8f.png` (user-approved four-panel mockup).

Rendered route: `/orders/fresh-reserve-stock`, including `?setup=1`. Captured in the in-app browser at 390 × 844 and 1440 × 1024. Combined visual comparisons: `output/reserve-stock/comparison-mobile.png` and `comparison-desktop.png`.

## Findings and resolved issues

- P2, mobile header: the original implementation repeated the page title above the setup heading. Removed the duplicate mobile title and shortened the helper copy. Latest mobile capture shows the original shell title, compact warehouse context, one setup heading, and the first input above the sticky footer.
- Desktop capture initially caught the sidebar padding transition. Recaptured after navigation settled; headings and product labels are fully visible beside the sidebar.
- No horizontal overflow at either tested size. The review CTA remains above the original mobile navigation. Native blank-field validation prevents advancing with unentered quantities.

## Fidelity surfaces

- Typography: reused the installed Thai font and existing app-wide sizing/weights; larger than the isolated mockup, intentionally preserving the familiar system and readability for older users. Names are not truncated.
- Layout: white product rows, mobile stacked name/input or two balance columns, desktop table, lavender helper and totals, persistent primary action. Existing desktop sidebar and mobile navigation are retained rather than replaced with the mockup's decorative sidebar.
- Colors: purple primary action and quantities, navy text, pale lavender panels, green positive and amber empty stock status match the approved direction.
- Assets: original supplied All Noodles logo and installed icon library; no placeholder or recreated logo.
- Copy/content: real eligible catalog contains 35 products, rather than the mock's three example products. Opening inputs are deliberately blank; example 200/80 values were tested only in an unsaved review draft. Date is fixed to the actual starting day, preventing retrospective opening balances.

## Functional evidence and limits

- Unsaved draft: 35 entered quantities, total 280, review/confirmation, and return to edit verified. No production opening was submitted.
- Empty stock page and setup visually checked on desktop/mobile. Initialized positive/pending balances checked by transaction-based database tests; not populated in production merely for screenshots.
- Fresh navigation produced no new browser errors. Earlier retained console entries came from restarting the local build during testing.
- Opening, immediate withdrawal, edit differences, stable record IDs, midnight receipts, returns, shortage rollback, stale-edit rejection and no-op saving passed the isolated PostgreSQL check.
- Lint and production build passed. Real database migration applied; private ledger privileges checked.

P3 follow-up: history's opening date can use a Thai date label. No province/Lotus interface has been added.

Post-delivery logic audit: confirmed a missing-opening gap when adding an eligible product after initialization. Migration `20261009152637_guard_missing_fresh_reserve_opening.sql` now rejects such withdrawals/receipts atomically. The page shows an unset balance rather than a misleading zero. Regression assertions include claim, other vehicles, and missing openings; generated database types remain identical because the existing function signature was preserved.

User-requested product photos: added existing catalog images beside product names in both stock and opening/review screens, reusing the system's image preview. Mobile 390 × 844 and desktop 1440 × 1024 have no horizontal overflow; zoom open/close works and opening inputs remain untouched. The current 35-product catalog has 23 photos; the remaining 12 show the standard package icon. Captures: `output/reserve-stock/mobile-product-images.jpg` and `desktop-product-images.jpg`. Layout and calculation behavior remain unchanged; lint/build pass.
