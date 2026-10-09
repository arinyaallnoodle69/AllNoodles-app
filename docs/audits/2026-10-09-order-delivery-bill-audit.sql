-- Read-only audit used on 2026-10-09. No customer data is changed.
-- Project: bfgeoddvcjdcixspgksf. Current state cannot prove past printed contents.

BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ;
SELECT timezone('Asia/Bangkok', now()) AS checked_at_bangkok,
 (SELECT COUNT(*) FROM orders) AS orders,
 (SELECT COUNT(DISTINCT customer_id) FROM orders) AS customers,
 (SELECT MIN(order_date) FROM orders) AS first_order_date,
 (SELECT MAX(order_date) FROM orders) AS last_order_date,
 (SELECT COUNT(*) FROM order_items) AS order_items,
 (SELECT COUNT(*) FROM delivery_notes) AS delivery_notes,
 (SELECT COUNT(*) FROM delivery_note_items) AS delivery_items,
 (SELECT COUNT(*) FROM billing_records) AS billing_records,
 (SELECT COUNT(*) FROM orders o WHERE o.total_amount IS DISTINCT FROM COALESCE((SELECT SUM(oi.line_total) FROM order_items oi WHERE oi.order_id=o.id),0)) AS order_header_mismatches,
 (SELECT COUNT(*) FROM delivery_notes d WHERE d.total_amount IS DISTINCT FROM COALESCE((SELECT SUM(di.line_total) FROM delivery_note_items di WHERE di.delivery_note_id=d.id),0)) AS delivery_header_mismatches;
COMMIT;

-- Compare customer/date/warehouse header totals.
WITH o AS (
SELECT organization_id, customer_id, order_date AS day, warehouse_id, COUNT(*) AS order_count, SUM(total_amount) AS order_total
FROM orders WHERE status <> 'cancelled' GROUP BY 1,2,3,4),
d AS (SELECT organization_id, customer_id, delivery_date AS day, warehouse_id, COUNT(*) AS note_count, SUM(total_amount) AS delivery_total
FROM delivery_notes WHERE status IN ('confirmed','submitted') GROUP BY 1,2,3,4),
comp AS (SELECT COALESCE(o.organization_id,d.organization_id) AS organization_id, COALESCE(o.customer_id,d.customer_id) AS customer_id,
COALESCE(o.day,d.day) AS day, o.order_count, d.note_count, o.order_total, d.delivery_total
FROM o FULL JOIN d ON o.organization_id=d.organization_id AND o.customer_id=d.customer_id AND o.day=d.day AND o.warehouse_id IS NOT DISTINCT FROM d.warehouse_id)
SELECT COUNT(*) AS customer_date_warehouse_groups, COUNT(*) FILTER (WHERE order_total IS DISTINCT FROM delivery_total) AS mismatch_groups,
COUNT(DISTINCT customer_id) FILTER (WHERE order_total IS DISTINCT FROM delivery_total) AS mismatch_customers,
COUNT(*) FILTER (WHERE order_total > delivery_total) AS underbilled_groups,
COALESCE(SUM(order_total-delivery_total) FILTER (WHERE order_total > delivery_total),0) AS underbilled_difference,
COUNT(*) FILTER (WHERE order_count IS NULL) AS notes_without_order_groups, COUNT(*) FILTER (WHERE note_count IS NULL) AS orders_without_note_groups,
MIN(day) AS start_date,MAX(day) AS end_date FROM comp;

-- Return all order item / delivery item discrepancies (empty at audit time).
WITH d AS (
 SELECT order_item_id, COUNT(*) AS n, SUM(quantity_delivered) AS quantity, SUM(quantity_in_base_unit) AS base_quantity, SUM(line_total) AS line_total,
 MIN(unit_price) AS min_price,MAX(unit_price) AS max_price,MIN(product_id::text) AS product_id,MIN(product_sale_unit_id::text) AS sale_unit_id,MIN(sale_unit_label) AS unit_label,MIN(sale_unit_ratio) AS ratio
 FROM delivery_note_items i JOIN delivery_notes dn ON dn.id=i.delivery_note_id WHERE dn.status IN ('confirmed','submitted') GROUP BY order_item_id
), bad AS (
 SELECT o.id AS order_id,o.customer_id,o.order_date,oi.id AS item_id,oi.product_id, oi.quantity AS order_quantity,d.quantity AS delivered_quantity,oi.unit_price AS order_price,d.min_price AS delivery_price,oi.line_total AS order_line_total,d.line_total AS delivery_line_total,d.n
 FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN d ON d.order_item_id=oi.id WHERE o.status <> 'cancelled'
 AND (d.order_item_id IS NULL OR oi.quantity IS DISTINCT FROM d.quantity OR oi.quantity_in_base_unit IS DISTINCT FROM d.base_quantity
 OR oi.line_total IS DISTINCT FROM d.line_total OR oi.unit_price IS DISTINCT FROM d.min_price OR oi.unit_price IS DISTINCT FROM d.max_price
 OR oi.product_id::text IS DISTINCT FROM d.product_id OR oi.product_sale_unit_id::text IS DISTINCT FROM d.sale_unit_id OR oi.sale_unit_label IS DISTINCT FROM d.unit_label OR oi.sale_unit_ratio IS DISTINCT FROM d.ratio OR d.n<>1)
)
SELECT bad.*,c.name AS customer_name,c.customer_code,p.name AS product_name,p.sku FROM bad JOIN customers c ON c.id=bad.customer_id JOIN products p ON p.id=bad.product_id ORDER BY order_date,c.name,p.sku;

-- Identify order headers that disagree with their own item totals.
SELECT c.customer_code, c.name, o.id, o.order_number, o.order_date,
       o.total_amount AS order_header_total,
       COALESCE(SUM(oi.line_total), 0) AS order_item_total
FROM orders o
JOIN customers c ON c.id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.customer_code, c.name, o.id
HAVING o.total_amount IS DISTINCT FROM COALESCE(SUM(oi.line_total), 0)
ORDER BY o.order_date, c.customer_code;

