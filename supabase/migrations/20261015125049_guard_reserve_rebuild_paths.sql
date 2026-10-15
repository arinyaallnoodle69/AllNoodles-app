create function public.protect_reserved_items_from_rebuild() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.supply_source='reserve' and (TG_OP='DELETE' or (new.quantity,new.quantity_in_base_unit,new.unit_price) is distinct from (old.quantity,old.quantity_in_base_unit,old.unit_price))
    and current_setting('app.reserve_mutation_order',true) is distinct from old.order_id::text then
    raise exception 'กรุณาแก้รายการใช้สำรองผ่านหน้ารายละเอียดออเดอร์ เพื่อบันทึกและคืนยอดพร้อมกัน';
  end if;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger reserve_rebuild_guard_before before update or delete on public.order_items for each row execute function public.protect_reserved_items_from_rebuild();
revoke all on function public.protect_reserved_items_from_rebuild() from public,anon,authenticated;

create function public.protect_reserved_product_mode() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (TG_OP='DELETE' or (new.mode,new.supplier_id,new.warehouse_id,new.product_id) is distinct from (old.mode,old.supplier_id,old.warehouse_id,old.product_id))
    and exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id and o.status in ('submitted','confirmed')
      where i.organization_id=old.organization_id and i.product_id=old.product_id and o.warehouse_id=old.warehouse_id and i.supply_source='reserve')
    then raise exception 'สินค้ามีออเดอร์ใช้สำรองอยู่ กรุณาจัดการรายการสำรองก่อนเปลี่ยนโหมด โรงงาน หรือคลัง'; end if;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger reserve_mode_guard_before before update or delete on public.product_warehouse_fulfillment_modes for each row execute function public.protect_reserved_product_mode();
revoke all on function public.protect_reserved_product_mode() from public,anon,authenticated;

do $patch$
declare definition text; updated text; name regprocedure;
begin
  foreach name in array array['public.merge_order_items_atomic(uuid,uuid,jsonb,uuid,boolean)'::regprocedure,
    'public.save_order_items_and_delivery(uuid,uuid,uuid,timestamptz,text,uuid[],jsonb,jsonb,jsonb,jsonb)'::regprocedure] loop
    definition:=pg_get_functiondef(name);
    updated:=regexp_replace(definition,'\mbegin\M',
      'begin perform pg_catalog.set_config(''app.reserve_mutation_order'',p_order_id::text,true); perform pg_catalog.set_config(''app.reserve_actor'',coalesce(p_user_id::text,''''),true);');
    execute updated;
  end loop;
  definition:=pg_get_functiondef('public.log_fresh_reserve_order_delta(uuid,uuid,uuid,numeric,uuid)'::regprocedure);
  updated:=replace(definition,'p_delta,''order'',clock_timestamp(),p_user,',
    'p_delta,''order'',clock_timestamp(),coalesce(nullif(current_setting(''app.reserve_actor'',true),'''')::uuid,p_user),');
  if updated=definition then raise exception 'Audit definition changed; review required'; end if;
  execute updated;
end $patch$;
