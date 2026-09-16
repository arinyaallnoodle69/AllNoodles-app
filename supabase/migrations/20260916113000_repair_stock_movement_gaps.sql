-- Restore the 14 missing stock-ledger links from 14-15 Sep 2026.
-- This repairs audit history only; it never changes product_warehouse_stocks.
begin;

lock table public.inventory_movements in share row exclusive mode;

do $$
declare
  repair_count integer;
begin
  with ordered as (
    select m.*,
      lag(m.id) over stock_order as previous_movement_id,
      lag(m.stock_after) over stock_order as previous_stock_after
    from public.inventory_movements m
    window stock_order as (
      partition by m.organization_id, m.warehouse_id, m.product_id
      order by m.created_at, m.id
    )
  )
  select count(*) into repair_count
  from ordered o
  where o.created_at >= timestamptz '2026-09-13 17:00:00+00'
    and o.created_at < timestamptz '2026-09-15 17:00:00+00'
    and o.previous_movement_id is not null
    and abs(o.stock_before - o.previous_stock_after) >= 0.001
    and coalesce((
      select mode.mode
      from public.product_warehouse_fulfillment_modes mode
      where mode.organization_id = o.organization_id
        and mode.warehouse_id = o.warehouse_id
        and mode.product_id = o.product_id
    ), 'stock') = 'stock'
    and not exists (
      select 1 from public.inventory_movements repaired
      where repaired.metadata ->> 'repair_next_movement_id' = o.id::text
    );
  if repair_count not in (0, 14) then
    raise exception 'ยกเลิกการซ่อม Movement: คาดว่า 14 จุดหรือซ่อมแล้ว 0 จุด แต่พบ % จุด กรุณาตรวจข้อมูลใหม่', repair_count;
  elsif repair_count = 0 then
    raise notice 'Movement ชุดนี้ซ่อมแล้ว ไม่มีรายการต้องเพิ่ม';
  end if;
end;
$$;

with ordered as (
  select m.*,
    lag(m.id) over stock_order as previous_movement_id,
    lag(m.created_at) over stock_order as previous_created_at,
    lag(m.stock_after) over stock_order as previous_stock_after
  from public.inventory_movements m
  window stock_order as (
    partition by m.organization_id, m.warehouse_id, m.product_id
    order by m.created_at, m.id
  )
), movement_gap_repairs as (
  select o.*, o.stock_before - o.previous_stock_after as missing_delta
  from ordered o
  where o.created_at >= timestamptz '2026-09-13 17:00:00+00'
    and o.created_at < timestamptz '2026-09-15 17:00:00+00'
    and o.previous_movement_id is not null
    and abs(o.stock_before - o.previous_stock_after) >= 0.001
    and coalesce((
      select mode.mode
      from public.product_warehouse_fulfillment_modes mode
      where mode.organization_id = o.organization_id
        and mode.warehouse_id = o.warehouse_id
        and mode.product_id = o.product_id
    ), 'stock') = 'stock'
    and not exists (
      select 1 from public.inventory_movements repaired
      where repaired.metadata ->> 'repair_next_movement_id' = o.id::text
    )
)
insert into public.inventory_movements (
  organization_id,
  product_id,
  warehouse_id,
  movement_type,
  quantity_delta,
  stock_before,
  stock_after,
  reference_number,
  notes,
  metadata,
  created_by,
  created_at
)
select
  organization_id,
  product_id,
  warehouse_id,
  'adjustment',
  missing_delta,
  previous_stock_after,
  stock_before,
  'REPAIR-20260914-15',
  'เติมประวัติ Movement ที่หายจากการซิงก์ออเดอร์เดิม (ไม่เปลี่ยนยอดสต็อกปัจจุบัน)',
  jsonb_build_object(
    'source', 'movement_gap_repair',
    'repair_previous_movement_id', previous_movement_id,
    'repair_next_movement_id', id,
    'does_not_change_current_stock', true
  ),
  null,
  previous_created_at + ((created_at - previous_created_at) / 2)
from movement_gap_repairs
order by organization_id, warehouse_id, product_id, created_at, id;

do $$
declare
  remaining_count integer;
begin
  with ordered as (
    select
      m.created_at,
      m.organization_id,
      m.warehouse_id,
      m.product_id,
      m.stock_before,
      lag(m.stock_after) over (
        partition by m.organization_id, m.warehouse_id, m.product_id
        order by m.created_at, m.id
      ) as previous_stock_after
    from public.inventory_movements m
  )
  select count(*) into remaining_count
  from ordered o
  where o.created_at >= timestamptz '2026-09-13 17:00:00+00'
    and o.created_at < timestamptz '2026-09-15 17:00:00+00'
    and o.previous_stock_after is not null
    and abs(o.stock_before - o.previous_stock_after) >= 0.001
    and coalesce((
      select mode.mode
      from public.product_warehouse_fulfillment_modes mode
      where mode.organization_id = o.organization_id
        and mode.warehouse_id = o.warehouse_id
        and mode.product_id = o.product_id
    ), 'stock') = 'stock';

  if remaining_count <> 0 then
    raise exception 'ยกเลิกการซ่อม Movement: ยังเหลือประวัติขาดตอน % จุด', remaining_count;
  end if;
end;
$$;

commit;
