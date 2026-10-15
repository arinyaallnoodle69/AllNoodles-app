-- Request receipts must not prevent the existing normal-order deletion workflow.
alter table public.manual_order_save_requests
  drop constraint manual_order_save_requests_order_id_fkey,
  add constraint manual_order_save_requests_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete cascade;
