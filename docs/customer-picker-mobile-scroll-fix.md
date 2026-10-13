# Mobile customer picker scroll fix

The create-order customer picker now keeps header/search/tabs outside its only vertical scrolling area. Vehicle tabs scroll their own horizontal container instead of calling scrollIntoView on the page's ancestor containers. The page is frozen while create-order is open, preserving/restoring original inline styles and page position. The customer picker follows visualViewport height/offset during keyboard and viewport changes, with listeners cleaned up on close. Customer selection, pricing, order saving and warehouse logic are unchanged.

Validation:
- Three behavioral regression tests exercise actual callbacks extracted from the component: background lock/restoration, viewport resize/listener cleanup, and horizontal-only vehicle scrolling. The existing order-save regression test also passes.
- Production build and repository lint pass.
- Browser diagnostic uses actual picker JSX/classes/effect callbacks and 100 mock shops, with no database writes. At 393×852, scrolling the list to 6,816px keeps the close button at 16.5px and window scroll at zero; clicking close works. At 393×380, dialog height matches the visible viewport and the close button remains visible and works after selecting a vehicle tab.
- Screenshot: output/reserve-stock/customer-picker-after-scroll.png.

Limits: diagnostic binds mock handlers rather than mounting the whole authenticated order flow. No physical iPhone/Safari touch momentum or software keyboard test was available. Not deployed; no SQL or production order changes.
