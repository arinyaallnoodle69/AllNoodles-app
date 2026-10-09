-- All changes and stock movements are rolled back; no customer notifications are sent.
begin;
do $$
declare
  o public.orders%rowtype;
  i public.order_items%rowtype;
  item_before jsonb;
  failed boolean;
  number text;
  checked integer := 0;
  original_total numeric;
  stock_before numeric;
  stock_after numeric;
begin
  for o in select distinct on (warehouse_id) * from public.orders
    where status = 'confirmed' and exists(select 1 from public.order_items where order_id = orders.id)
    order by warehouse_id, order_date desc, id loop
    select * into strict i from public.order_items where order_id = o.id order by id limit 1;
    original_total := o.total_amount;
    number := public.save_order_items_and_delivery(o.organization_id, o.id, o.placed_by_user_id,
      o.updated_at, o.notes, '{}', jsonb_build_array(jsonb_build_object(
        'id', i.id, 'order_id', o.id, 'organization_id', o.organization_id,
        'quantity', i.quantity + 1, 'unit_price', i.unit_price, 'sale_unit_ratio', i.sale_unit_ratio)), '[]', '[]', '{}');
    if (select total_amount from public.orders where id = o.id) <> original_total + i.unit_price then
      raise exception 'Order total did not follow increased quantity';
    end if;
    if not (select valid from public.delivery_export_versions(o.organization_id)
      where delivery_number = number) then raise exception 'Bill did not follow increased quantity'; end if;

    select to_jsonb(x) into item_before from public.order_items x where id = i.id;
    select * into o from public.orders where id = o.id;
    failed := false;
    begin
      perform public.save_order_items_and_delivery(o.organization_id, o.id, o.placed_by_user_id,
        o.updated_at, o.notes, '{}', jsonb_build_array(jsonb_build_object(
          'id', i.id, 'order_id', o.id, 'organization_id', o.organization_id,
          'quantity', i.quantity + 2, 'unit_price', i.unit_price, 'sale_unit_ratio', i.sale_unit_ratio)),
        jsonb_build_array(jsonb_build_object('order_id', o.id, 'organization_id', o.organization_id,
          'product_id', gen_random_uuid(), 'quantity', 1, 'unit_price', 1, 'sale_unit_ratio', 1)), '[]', '{}');
    exception when others then failed := true;
    end;
    if not failed or (select to_jsonb(x) from public.order_items x where id = i.id) <> item_before then
      raise exception 'Failed save did not roll back item changes';
    end if;
    if not (select valid from public.delivery_export_versions(o.organization_id)
      where delivery_number = number) then raise exception 'Failed save changed bill'; end if;

    failed := false;
    begin
      perform public.save_order_items_and_delivery(o.organization_id, o.id, o.placed_by_user_id,
        o.updated_at - interval '1 second', o.notes, '{}', '[]', '[]', '[]', '{}');
    exception when others then failed := true;
    end;
    if not failed then raise exception 'Stale order revision was accepted'; end if;

    update public.orders set total_amount = total_amount + 2000 where id = o.id;
    if (select total_amount from public.orders where id = o.id) <> original_total + i.unit_price then
      raise exception 'Header increment corrupted saved item total';
    end if;

    -- A cached lower quantity must not overwrite the canonical bill on reprint.
    update public.delivery_notes set previous_outstanding = 100, installment_paid = 20,
      remaining_outstanding = 80, is_installment_plan = true
      where organization_id = o.organization_id and delivery_number = number;
    perform public.create_store_delivery_note(o.organization_id, array[o.id], o.customer_id,
      o.assigned_vehicle_id, o.order_date, o.notes, o.placed_by_user_id,
      jsonb_build_array(jsonb_build_object('orderItemId', i.id, 'productId', i.product_id,
        'quantityDelivered', 0.1, 'saleUnitRatio', i.sale_unit_ratio, 'unitPrice', i.unit_price)), o.warehouse_id);
    if not (select valid from public.delivery_export_versions(o.organization_id)
      where delivery_number = number) then raise exception 'Cached print payload overwrote canonical items'; end if;
    if (select installment_paid from public.delivery_notes where organization_id = o.organization_id and delivery_number = number) <> 20 then
      raise exception 'Reprint reset the existing installment payment';
    end if;

    -- Exercise stock reductions in each warehouse, without persisting fixtures or movements.
    insert into public.product_warehouse_fulfillment_modes(organization_id, product_id, warehouse_id, mode)
      values(o.organization_id, i.product_id, o.warehouse_id, 'stock')
      on conflict(organization_id, product_id, warehouse_id) do update set mode = 'stock';
    perform public.ensure_product_warehouse_stock(o.organization_id, i.product_id, o.warehouse_id);
    select stock_quantity into stock_before from public.product_warehouse_stocks
      where organization_id = o.organization_id and product_id = i.product_id and warehouse_id = o.warehouse_id for update;
    select * into o from public.orders where id = o.id;
    perform public.save_order_items_and_delivery(o.organization_id, o.id, o.placed_by_user_id,
      o.updated_at, o.notes, '{}', jsonb_build_array(jsonb_build_object(
        'id', i.id, 'order_id', o.id, 'organization_id', o.organization_id,
        'quantity', i.quantity + 0.5, 'unit_price', i.unit_price, 'sale_unit_ratio', i.sale_unit_ratio)),
      '[]', '[]', jsonb_build_object(i.id::text, 0.5 * i.sale_unit_ratio));
    select stock_quantity into stock_after from public.product_warehouse_stocks
      where organization_id = o.organization_id and product_id = i.product_id and warehouse_id = o.warehouse_id;
    if stock_after <> stock_before then raise exception 'Lost reduction incorrectly returned stock'; end if;
    select * into o from public.orders where id = o.id;
    perform public.save_order_items_and_delivery(o.organization_id, o.id, o.placed_by_user_id,
      o.updated_at, o.notes, '{}', jsonb_build_array(jsonb_build_object(
        'id', i.id, 'order_id', o.id, 'organization_id', o.organization_id,
        'quantity', i.quantity + 0.25, 'unit_price', i.unit_price, 'sale_unit_ratio', i.sale_unit_ratio)), '[]', '[]', '{}');
    select stock_quantity into stock_after from public.product_warehouse_stocks
      where organization_id = o.organization_id and product_id = i.product_id and warehouse_id = o.warehouse_id;
    if stock_after <> stock_before + 0.25 * i.sale_unit_ratio then raise exception 'Returned reduction did not restore stock'; end if;

    perform public.merge_order_items_atomic(o.organization_id, o.id, jsonb_build_array(jsonb_build_object(
      'isReplacement', true, 'productId', i.product_id, 'productSaleUnitId', i.product_sale_unit_id,
      'quantity', 2, 'quantityInBaseUnit', 2 * i.sale_unit_ratio, 'saleUnitLabel', i.sale_unit_label,
      'saleUnitRatio', i.sale_unit_ratio, 'unitPrice', 999, 'costPrice', 0)), o.placed_by_user_id, true);
    if exists(select 1 from public.order_items where order_id = o.id and is_replacement and (unit_price <> 0 or line_total <> 0)) then
      raise exception 'Replacement merge became a paid item';
    end if;
    if not (select valid from public.delivery_export_versions(o.organization_id)
      where delivery_number = number) then raise exception 'Replacement merge did not sync bill'; end if;
    checked := checked + 1;
  end loop;
  if checked < 2 then raise exception 'Both warehouses were not tested'; end if;
end $$;
rollback;
select 'atomic edits, rollback, stale revisions/payloads, totals, stock loss/returns and free replacement merge passed for both warehouses' as result;
