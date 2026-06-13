-- Database performance indexes for faster customer price and order queries.
-- These do not change data or operational logic.

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_lookup 
ON public.customer_product_prices (customer_id, product_id, product_sale_unit_id);

CREATE INDEX IF NOT EXISTS idx_order_items_fk 
ON public.order_items (order_id, product_id);

CREATE INDEX IF NOT EXISTS idx_orders_org_created 
ON public.orders (organization_id, created_at DESC);
