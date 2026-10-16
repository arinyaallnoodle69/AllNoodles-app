create or replace function public.guard_order_barcode_packaging()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.is_barcode then
    if new.is_replacement or not exists(
      select 1 from public.orders o join public.customers c on c.id=o.customer_id and c.organization_id=o.organization_id
      join public.products p on p.id=new.product_id and p.organization_id=o.organization_id
      where o.id=new.order_id and o.organization_id=new.organization_id and c.customer_code='ANS109'
        and p.sku in ('ANP137','ANP138','ANP139','ANP140','ANP146','ANP115','ANP229','ANP119','ANP136','ANP088','ANP087','ANP052','ANP054','ANP109','ANP097')
    ) then raise exception 'บาร์โค้ดใช้ได้เฉพาะร้าน ANS109 และสินค้าที่กำหนด ไม่ใช่ส่งชดเชย'; end if;
  end if;
  return new;
end $$;
