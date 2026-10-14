# Barcode packaging for ANS109

Barcode is a paid packaging variant, not scanner input. Only ANS109 can add barcode lines, for the 14 SKUs in `src/lib/orders/barcode-packaging.ts`. Product IDs, stock mode, sale units and stock movements remain the same; packaging is stored as `order_items.is_barcode` (existing rows default false).

The create-order Tools menu contains Replacement, Barcode and disabled Reserve Stock. Barcode uses the existing product picker, filtered to approved SKUs. Normal and barcode variants can coexist and merge only within the same packaging/unit/replacement group. Edit additions and last-order import retain the packaging flag; switching packaging clears pending picker selection. Server validation and an order-item trigger reject other customers, unapproved SKUs and barcode replacement combinations.

Packing order prints one normal shop row and a separate shop `(บาร์โค้ด)` row, using the same product columns. All barcode products for the shop go into that second row. Barcode-only orders omit the empty normal row. Factory/loading summaries create separate product rows labeled `(บาร์โค้ด)`. Quantity, weight and money totals include both exactly once. Delivery PDFs also keep the two paid variants separate.

ANP136 remains stock in ANS109's warehouse, as explicitly confirmed: it appears in the packing/loading documents and uses the existing stock flow, without creating a fresh factory order.

Migration `20261014164834_order_barcode_packaging.sql` has been applied to project bfgeoddvcjdcixspgksf; generated types refreshed. Original RPC permissions remain service-role-only. No existing order data was changed. Tests use temporary fixture tables and ROLLBACK.

Verification: 19 Node regression cases pass, including paid/replacement isolation, cart packaging identity, packing shop rows, factory/loading split, stock-mode isolation, delivery PDF grouping, and menu positioning. Ten SQL assertions pass for separate/repeated merge, totals, invalid customer/SKU/replacement rollback, edit additions and quantity edits. Mobile renders checked at 393px and 320px, desktop at 1280px. The menu opens above when the totals footer would cover it; Reserve Stock remains disabled. Images in output/reserve-stock/barcode-tools-mobile.png, barcode-tools-desktop.png and barcode-picker-mobile.png use clearly documented mock data and the actual component source.

Limitations: no deployment or authenticated end-to-end order creation performed; no physical iPhone or printer test. Price defaults remain the existing customer/product/unit pricing shared by both packaging variants. Reserve Stock is visual-only and disabled.
