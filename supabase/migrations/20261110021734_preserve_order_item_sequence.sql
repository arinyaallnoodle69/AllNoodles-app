alter table public.order_items add column item_sequence bigint;
create sequence public.order_items_item_sequence_seq as bigint;
alter sequence public.order_items_item_sequence_seq owned by public.order_items.item_sequence;
alter table public.order_items alter column item_sequence set default nextval('public.order_items_item_sequence_seq');
grant usage on sequence public.order_items_item_sequence_seq to authenticated, service_role;
