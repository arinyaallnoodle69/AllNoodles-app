create or replace function public.capture_fresh_reserve_stock_special()
returns trigger language plpgsql security definer set search_path='' as $$
declare g record; r record; d numeric; balance numeric; effective timestamptz;
begin
 if TG_OP='UPDATE' and (old.entry_date,old.entry_type,old.vehicle_id,old.product_id,old.quantity) is not distinct from
 (new.entry_date,new.entry_type,new.vehicle_id,new.product_id,new.quantity) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('special-orders:'||coalesce(new.organization_id,old.organization_id)::text,0));
 for r in select org,entry_day,kind,vehicle,product,source,actor,sum(qty*multiplier) qty from (
 select old.organization_id org,old.entry_date entry_day,old.entry_type kind,old.vehicle_id vehicle,old.product_id product,old.quantity qty,old.id source,old.created_by actor,-1 multiplier where TG_OP<>'INSERT'
 union all
 select new.organization_id,new.entry_date,new.entry_type,new.vehicle_id,new.product_id,new.quantity,new.id,new.created_by,1 where TG_OP<>'DELETE') changes group by org,entry_day,kind,vehicle,product,source,actor having sum(qty*multiplier)<>0 loop
 if r.qty>0 and r.kind in ('remaining','office') and exists(
 select 1 from public.fresh_reserve_stock_groups a
 join public.product_warehouse_fulfillment_modes m on m.organization_id=a.organization_id and m.warehouse_id=a.warehouse_id and m.supplier_id=a.supplier_id and m.product_id=r.product and m.mode='fresh'
 where a.organization_id=r.org and a.vehicle_id=r.vehicle and r.entry_day>=a.start_date
 and not exists(select 1 from public.fresh_reserve_stock_openings o where o.group_id=a.id and o.product_id=r.product))
 then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดสต็อคสำรอง กรุณาตั้งยอดสินค้าก่อนบันทึกรายการ'; end if;
 for g in select a.* from public.fresh_reserve_stock_groups a join public.fresh_reserve_stock_openings o on o.group_id=a.id and o.product_id=r.product
 where a.organization_id=r.org and a.vehicle_id=r.vehicle and r.entry_day>=a.start_date and r.kind in ('remaining','office') loop
 d:=r.qty*case when r.kind='remaining' then -1 else 1 end;
 effective:=case when r.kind='office' then greatest(clock_timestamp(),(r.entry_day+1)::timestamp at time zone 'Asia/Bangkok') else clock_timestamp() end;
 insert into public.fresh_reserve_stock_movements(group_id,product_id,special_item_id,quantity_delta,reason,effective_at,created_by)
 values(g.id,r.product,r.source,d,r.kind,effective,r.actor);
 end loop;
 end loop;
 -- Check the final row change, not the transient undo/reapply amounts during edits.
 for g in select a.id from public.fresh_reserve_stock_groups a where a.organization_id=coalesce(new.organization_id,old.organization_id) loop
 select min(b.qty) into balance from (
 select o.quantity+coalesce(sum(m.quantity_delta) filter(where m.effective_at<=clock_timestamp()),0) qty
 from public.fresh_reserve_stock_openings o left join public.fresh_reserve_stock_movements m on m.group_id=o.group_id and m.product_id=o.product_id
 where o.group_id=g.id group by o.product_id,o.quantity) b;
 if balance<0 then raise exception 'ของสำรองไม่พอ หรือรายการรับเข้าที่แก้ถูกใช้ไปแล้ว กรุณาตรวจยอดคงเหลือ'; end if;
 end loop;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
