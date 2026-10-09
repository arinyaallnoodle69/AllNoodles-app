-- Read canonical items after acquiring the group lock, including legacy print/create callers.
do $migration$
declare
  definition text;
  marker text := $marker$      update public.orders
      set status = 'confirmed',$marker$;
  canonical text := $canonical$
      if exists(select 1 from unnest(p_order_ids) id where not exists(
        select 1 from public.orders o where o.id = id and o.organization_id = p_organization_id
          and o.customer_id = p_customer_id and o.warehouse_id = p_warehouse_id
          and o.order_date = v_target_date and o.status <> 'cancelled')) then
        raise exception 'ออเดอร์ไม่ตรงกับร้าน วันที่ หรือคลังของบิล กรุณาโหลดข้อมูลใหม่';
      end if;
      perform 1 from public.orders o where o.organization_id = p_organization_id
        and o.customer_id = p_customer_id and o.warehouse_id = p_warehouse_id
        and o.order_date = v_target_date and o.status <> 'cancelled' order by id for update;
      select array_agg(id order by created_at, id) into p_order_ids from public.orders
        where organization_id = p_organization_id and customer_id = p_customer_id
          and warehouse_id = p_warehouse_id and order_date = v_target_date and status <> 'cancelled';
      v_primary_order_id := p_order_ids[1];
      select jsonb_agg(jsonb_build_object('orderItemId', id, 'productId', product_id,
        'productSaleUnitId', product_sale_unit_id, 'quantityDelivered', quantity,
        'saleUnitLabel', sale_unit_label, 'saleUnitRatio', sale_unit_ratio, 'unitPrice', unit_price)
        order by product_id, id) into p_items from public.order_items where order_id = any(p_order_ids);
      if p_items is null then raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ'; end if;
  $canonical$;
begin
  select replace(pg_get_functiondef(oid), chr(13), '') into strict definition
    from pg_proc where proname = 'create_store_delivery_note' and pronamespace = 'public'::regnamespace and pronargs = 12;
  if position(marker in definition) = 0 then raise exception 'Delivery function changed; review migration before applying'; end if;
  definition := replace(definition, marker, canonical || marker);
  definition := replace(definition, 'v_line_total := v_qty_delivered * v_unit_price;',
    'select line_total into strict v_line_total from public.order_items where id = v_order_item_id and organization_id = p_organization_id;');
  execute definition;
end $migration$;
