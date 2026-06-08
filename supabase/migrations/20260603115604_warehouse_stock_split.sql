-- Warehouse-aware stock foundation.
-- This migration adds warehouses without silently assigning customers to one.
-- Customers must explicitly choose a warehouse before stock-affecting flows run.

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint warehouses_org_slug_unique unique (organization_id, slug),
  constraint warehouses_slug_check check (slug ~ '^[a-z0-9][a-z0-9_-]*$')
);

create index if not exists warehouses_org_active_sort_idx
  on public.warehouses (organization_id, is_active, sort_order, name);

drop trigger if exists warehouses_set_updated_at on public.warehouses;
create trigger warehouses_set_updated_at
before update on public.warehouses
for each row execute function public.set_updated_at();

insert into public.warehouses (organization_id, slug, name, sort_order)
select org.id, 'main', 'คลังหลัก', 10
from public.organizations org
on conflict (organization_id, slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.warehouses (organization_id, slug, name, sort_order)
select org.id, 'provincial', 'คลังต่างจังหวัด', 20
from public.organizations org
on conflict (organization_id, slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.customers
  add column if not exists default_warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.orders
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.delivery_notes
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.inventory_receipts
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.inventory_receipt_items
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.inventory_movements
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

create index if not exists customers_org_default_warehouse_idx
  on public.customers (organization_id, default_warehouse_id);

create index if not exists orders_org_warehouse_date_idx
  on public.orders (organization_id, warehouse_id, order_date desc, created_at desc);

create index if not exists delivery_notes_org_warehouse_date_idx
  on public.delivery_notes (organization_id, warehouse_id, delivery_date desc, created_at desc);

create index if not exists inventory_receipts_org_warehouse_received_idx
  on public.inventory_receipts (organization_id, warehouse_id, received_at desc, created_at desc);

create index if not exists inventory_movements_org_warehouse_created_idx
  on public.inventory_movements (organization_id, warehouse_id, created_at desc);

create table if not exists public.product_warehouse_stocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  stock_quantity numeric(12,3) not null default 0,
  reserved_quantity numeric(12,3) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_warehouse_stocks_unique unique (organization_id, product_id, warehouse_id)
);

create index if not exists product_warehouse_stocks_org_warehouse_product_idx
  on public.product_warehouse_stocks (organization_id, warehouse_id, product_id);

create index if not exists product_warehouse_stocks_org_product_idx
  on public.product_warehouse_stocks (organization_id, product_id);

drop trigger if exists product_warehouse_stocks_set_updated_at on public.product_warehouse_stocks;
create trigger product_warehouse_stocks_set_updated_at
before update on public.product_warehouse_stocks
for each row execute function public.set_updated_at();

insert into public.product_warehouse_stocks (
  organization_id,
  product_id,
  warehouse_id,
  stock_quantity,
  reserved_quantity
)
select
  p.organization_id,
  p.id,
  w.id,
  coalesce(p.stock_quantity, 0),
  coalesce(p.reserved_quantity, 0)
from public.products p
join public.warehouses w
  on w.organization_id = p.organization_id
 and w.slug = 'main'
on conflict (organization_id, product_id, warehouse_id) do update
set stock_quantity = excluded.stock_quantity,
    reserved_quantity = excluded.reserved_quantity;

insert into public.product_warehouse_stocks (
  organization_id,
  product_id,
  warehouse_id,
  stock_quantity,
  reserved_quantity
)
select
  p.organization_id,
  p.id,
  w.id,
  0,
  0
from public.products p
join public.warehouses w
  on w.organization_id = p.organization_id
 and w.slug <> 'main'
on conflict (organization_id, product_id, warehouse_id) do nothing;

alter table public.warehouses enable row level security;
alter table public.product_warehouse_stocks enable row level security;
alter table public.warehouses force row level security;
alter table public.product_warehouse_stocks force row level security;

revoke all on public.warehouses from anon, authenticated;
revoke all on public.product_warehouse_stocks from anon, authenticated;

drop policy if exists warehouses_deny_api_access on public.warehouses;
create policy warehouses_deny_api_access
on public.warehouses as restrictive for all
to anon, authenticated using (false) with check (false);

drop policy if exists product_warehouse_stocks_deny_api_access on public.product_warehouse_stocks;
create policy product_warehouse_stocks_deny_api_access
on public.product_warehouse_stocks as restrictive for all
to anon, authenticated using (false) with check (false);

create or replace function public.recalculate_product_stock_totals(
  p_organization_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products p
  set stock_quantity = coalesce((
        select sum(pws.stock_quantity)
        from public.product_warehouse_stocks pws
        where pws.organization_id = p_organization_id
          and pws.product_id = p_product_id
      ), 0),
      reserved_quantity = coalesce((
        select sum(pws.reserved_quantity)
        from public.product_warehouse_stocks pws
        where pws.organization_id = p_organization_id
          and pws.product_id = p_product_id
      ), 0),
      updated_at = timezone('utc', now())
  where p.id = p_product_id
    and p.organization_id = p_organization_id;
end;
$$;

create or replace function public.ensure_product_warehouse_stock(
  p_organization_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_id uuid;
begin
  if p_warehouse_id is null then
    raise exception 'ต้องระบุคลังก่อนทำรายการสต็อค';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and w.organization_id = p_organization_id
      and w.is_active = true
  ) then
    raise exception 'ไม่พบคลังที่เปิดใช้งานอยู่';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'ไม่พบสินค้าในองค์กรนี้';
  end if;

  insert into public.product_warehouse_stocks (
    organization_id,
    product_id,
    warehouse_id,
    stock_quantity,
    reserved_quantity
  ) values (
    p_organization_id,
    p_product_id,
    p_warehouse_id,
    0,
    0
  )
  on conflict (organization_id, product_id, warehouse_id) do update
  set updated_at = public.product_warehouse_stocks.updated_at
  returning id into v_stock_id;

  return v_stock_id;
end;
$$;

create or replace function public.apply_product_warehouse_stock_delta(
  p_organization_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_notes text default null,
  p_created_by uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_reference_number text default null
)
returns table (
  stock_before numeric,
  stock_after numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
begin
  if p_organization_id is null or p_product_id is null or p_warehouse_id is null then
    raise exception 'ข้อมูลคลังหรือสินค้าไม่ครบ';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'จำนวนปรับสต็อคต้องไม่เป็น 0';
  end if;

  perform public.ensure_product_warehouse_stock(p_organization_id, p_product_id, p_warehouse_id);

  select pws.stock_quantity
    into v_stock_before
  from public.product_warehouse_stocks pws
  where pws.organization_id = p_organization_id
    and pws.product_id = p_product_id
    and pws.warehouse_id = p_warehouse_id
  for update;

  v_stock_after := coalesce(v_stock_before, 0) + p_quantity_delta;

  update public.product_warehouse_stocks
  set stock_quantity = v_stock_after,
      updated_at = now()
  where organization_id = p_organization_id
    and product_id = p_product_id
    and warehouse_id = p_warehouse_id;

  perform public.recalculate_product_stock_totals(p_organization_id, p_product_id);

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
    created_by
  )
  values (
    p_organization_id,
    p_product_id,
    p_warehouse_id,
    p_movement_type,
    p_quantity_delta,
    v_stock_before,
    v_stock_after,
    p_reference_number,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  );

  stock_before := v_stock_before;
  stock_after := v_stock_after;
  return next;
end;
$$;

create or replace function public.create_inventory_receipt(
  p_organization_id uuid,
  p_created_by uuid,
  p_receipt_number text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb,
  p_warehouse_id uuid,
  p_receipt_url text default null,
  p_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
  v_actual_received_at timestamptz;
begin
  if p_warehouse_id is null then
    raise exception 'กรุณาเลือกคลังก่อนรับสินค้าเข้า';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and w.organization_id = p_organization_id
      and w.is_active = true
  ) then
    raise exception 'ไม่พบคลังที่เปิดใช้งานอยู่';
  end if;

  v_actual_received_at := coalesce(p_received_at, timezone('utc', now()));
  v_reference_number := nullif(trim(p_receipt_number), '');
  if v_reference_number is null then
    v_reference_number := public.generate_receipt_number(
      p_organization_id,
      (v_actual_received_at at time zone 'Asia/Bangkok')::date
    );
  end if;

  insert into public.inventory_receipts (
    organization_id,
    warehouse_id,
    receipt_number,
    supplier_name,
    supplier_id,
    received_at,
    notes,
    created_by,
    receipt_url
  ) values (
    p_organization_id,
    p_warehouse_id,
    v_reference_number,
    coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
    p_supplier_id,
    v_actual_received_at,
    nullif(trim(p_notes), ''),
    p_created_by,
    p_receipt_url
  ) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    perform public.ensure_product_warehouse_stock(p_organization_id, v_product_id, p_warehouse_id);

    select pws.stock_quantity
      into v_stock_before
    from public.product_warehouse_stocks pws
    where pws.organization_id = p_organization_id
      and pws.product_id = v_product_id
      and pws.warehouse_id = p_warehouse_id
    for update;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.product_warehouse_stocks
    set stock_quantity = v_stock_after,
        updated_at = now()
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = p_warehouse_id;

    update public.products
    set cost_price = v_unit_cost,
        unit = v_unit,
        updated_at = now()
    where id = v_product_id
      and organization_id = p_organization_id;

    perform public.recalculate_product_stock_totals(p_organization_id, v_product_id);

    insert into public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      warehouse_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) values (
      p_organization_id,
      v_receipt_id,
      v_product_id,
      p_warehouse_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    ) returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      warehouse_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      p_warehouse_id,
      v_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_created_by,
      jsonb_build_object('source', 'inventory_receipt')
    );
  end loop;

  return v_receipt_id;
end;
$$;

create or replace function public.adjust_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_new_stock_quantity numeric,
  p_adjusted_by uuid,
  p_notes text,
  p_warehouse_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stock numeric;
  v_quantity_delta numeric;
begin
  if p_warehouse_id is null then
    raise exception 'กรุณาเลือกคลังก่อนปรับสต็อค';
  end if;

  perform public.ensure_product_warehouse_stock(p_organization_id, p_product_id, p_warehouse_id);

  select pws.stock_quantity
    into v_old_stock
  from public.product_warehouse_stocks pws
  where pws.product_id = p_product_id
    and pws.organization_id = p_organization_id
    and pws.warehouse_id = p_warehouse_id
  for update;

  v_quantity_delta := p_new_stock_quantity - coalesce(v_old_stock, 0);

  if v_quantity_delta <> 0 then
    update public.product_warehouse_stocks
    set stock_quantity = p_new_stock_quantity,
        updated_at = now()
    where product_id = p_product_id
      and organization_id = p_organization_id
      and warehouse_id = p_warehouse_id;

    perform public.recalculate_product_stock_totals(p_organization_id, p_product_id);

    insert into public.inventory_movements (
      organization_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      notes,
      created_by,
      created_at
    ) values (
      p_organization_id,
      p_product_id,
      p_warehouse_id,
      'adjustment',
      v_quantity_delta,
      coalesce(v_old_stock, 0),
      p_new_stock_quantity,
      p_notes,
      p_adjusted_by,
      now()
    );
  end if;
end;
$$;

create or replace function public.update_inventory_receipt(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_received_at timestamptz,
  p_supplier_id uuid,
  p_supplier_name text,
  p_notes text,
  p_items jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference_number text;
  v_receipt_warehouse_id uuid;
  v_item jsonb;
  v_old_item record;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_receipt_item_id uuid;
begin
  if p_receipt_id is null then
    raise exception 'Receipt id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  select receipt_number, warehouse_id
    into v_reference_number, v_receipt_warehouse_id
  from public.inventory_receipts
  where id = p_receipt_id
    and organization_id = p_organization_id
  for update;

  if v_reference_number is null then
    raise exception 'Receipt not found';
  end if;

  if v_receipt_warehouse_id is null then
    raise exception 'ใบรับสินค้านี้ยังไม่ได้ผูกคลัง ไม่สามารถแก้ไขสต็อคได้';
  end if;

  for v_old_item in
    select product_id, quantity_received
    from public.inventory_receipt_items
    where receipt_id = p_receipt_id
      and organization_id = p_organization_id
    order by created_at, id
  loop
    perform public.ensure_product_warehouse_stock(p_organization_id, v_old_item.product_id, v_receipt_warehouse_id);

    select pws.stock_quantity
      into v_stock_before
    from public.product_warehouse_stocks pws
    where pws.id = public.ensure_product_warehouse_stock(
      p_organization_id,
      v_old_item.product_id,
      v_receipt_warehouse_id
    )
    for update;

    v_stock_after := coalesce(v_stock_before, 0) - coalesce(v_old_item.quantity_received, 0);

    update public.product_warehouse_stocks
    set stock_quantity = v_stock_after,
        updated_at = now()
    where organization_id = p_organization_id
      and product_id = v_old_item.product_id
      and warehouse_id = v_receipt_warehouse_id;

    perform public.recalculate_product_stock_totals(p_organization_id, v_old_item.product_id);
  end loop;

  delete from public.inventory_movements
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id
    and movement_type = 'receipt';

  delete from public.inventory_receipt_items
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id;

  update public.inventory_receipts
  set received_at = coalesce(p_received_at, received_at),
      supplier_id = p_supplier_id,
      supplier_name = coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
      notes = nullif(trim(p_notes), '')
  where id = p_receipt_id
    and organization_id = p_organization_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    perform public.ensure_product_warehouse_stock(p_organization_id, v_product_id, v_receipt_warehouse_id);

    select pws.stock_quantity
      into v_stock_before
    from public.product_warehouse_stocks pws
    where pws.organization_id = p_organization_id
      and pws.product_id = v_product_id
      and pws.warehouse_id = v_receipt_warehouse_id
    for update;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.product_warehouse_stocks
    set stock_quantity = v_stock_after,
        updated_at = now()
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = v_receipt_warehouse_id;

    update public.products
    set cost_price = v_unit_cost,
        unit = v_unit,
        updated_at = now()
    where id = v_product_id
      and organization_id = p_organization_id;

    perform public.recalculate_product_stock_totals(p_organization_id, v_product_id);

    insert into public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      warehouse_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) values (
      p_organization_id,
      p_receipt_id,
      v_product_id,
      v_receipt_warehouse_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    )
    returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      warehouse_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      v_receipt_warehouse_id,
      p_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_updated_by,
      jsonb_build_object('source', 'inventory_receipt', 'updated', true)
    );
  end loop;
end;
$$;

create or replace function public.create_store_delivery_note(
  p_organization_id uuid,
  p_order_ids       uuid[],
  p_customer_id     uuid,
  p_vehicle_id      uuid,
  p_delivery_date   date,
  p_notes           text,
  p_created_by      uuid,
  p_items           jsonb,
  p_warehouse_id    uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_date          date := coalesce(p_delivery_date, current_date);
  v_primary_order_id     uuid;
  v_dn_id                uuid;
  v_dn_number            text;
  v_item                 jsonb;
  v_order_item_id        uuid;
  v_product_id           uuid;
  v_product_sale_unit_id uuid;
  v_sale_unit_label      text;
  v_sale_unit_ratio      numeric;
  v_qty_delivered        numeric;
  v_qty_base             numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_stock_before         numeric;
  v_reserved_before      numeric;
  v_stock_after          numeric;
  v_reserved_after       numeric;
  v_total_amount         numeric := 0;
  v_items_processed      integer := 0;
  v_order_id             uuid;
  v_all_delivered        boolean;
  v_any_delivered        boolean;
  v_new_fulfillment      text;
  v_clean_notes          text;
begin
  if p_warehouse_id is null then
    raise exception 'ร้านค้านี้ยังไม่ได้ตั้งคลังประจำ กรุณาตั้งค่าคลังก่อนสร้างใบส่งของ';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and w.organization_id = p_organization_id
      and w.is_active = true
  ) then
    raise exception 'ไม่พบคลังที่เปิดใช้งานอยู่';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    raise exception 'ต้องระบุออเดอร์อย่างน้อย 1 รายการ';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.id = any(p_order_ids)
      and o.organization_id = p_organization_id
      and o.warehouse_id is not null
      and o.warehouse_id <> p_warehouse_id
  ) then
    raise exception 'ออเดอร์บางรายการผูกคนละคลัง ไม่สามารถรวมใบส่งของได้';
  end if;

  v_clean_notes := nullif(trim(p_notes), '');
  v_primary_order_id := p_order_ids[1];

  perform pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':' || p_customer_id::text || ':' || p_warehouse_id::text || ':' || v_target_date::text)
  );

  update public.orders
  set status = 'confirmed',
      warehouse_id = coalesce(warehouse_id, p_warehouse_id)
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and status = 'submitted';

  update public.orders
  set warehouse_id = p_warehouse_id
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and warehouse_id is null;

  select dn.id, dn.delivery_number
    into v_dn_id, v_dn_number
  from public.delivery_notes dn
  where dn.organization_id = p_organization_id
    and dn.customer_id = p_customer_id
    and dn.delivery_date = v_target_date
    and dn.status = 'confirmed'
    and dn.warehouse_id = p_warehouse_id
  order by dn.created_at asc
  limit 1
  for update;

  if v_dn_id is null then
    v_dn_number := public.next_delivery_note_number(p_organization_id, v_target_date);

    insert into public.delivery_notes (
      organization_id,
      order_id,
      customer_id,
      vehicle_id,
      warehouse_id,
      delivery_number,
      delivery_date,
      status,
      notes,
      created_by
    ) values (
      p_organization_id,
      v_primary_order_id,
      p_customer_id,
      p_vehicle_id,
      p_warehouse_id,
      v_dn_number,
      v_target_date,
      'confirmed',
      v_clean_notes,
      p_created_by
    ) returning id into v_dn_id;
  else
    update public.delivery_notes
    set
      vehicle_id = coalesce(public.delivery_notes.vehicle_id, p_vehicle_id),
      warehouse_id = p_warehouse_id,
      notes = case
        when v_clean_notes is null then public.delivery_notes.notes
        when public.delivery_notes.notes is null or trim(public.delivery_notes.notes) = '' then v_clean_notes
        else public.delivery_notes.notes || ' / ' || v_clean_notes
      end
    where id = v_dn_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty_delivered := (v_item->>'quantityDelivered')::numeric;

    if v_qty_delivered is null or v_qty_delivered <= 0 then
      continue;
    end if;

    v_order_item_id        := (v_item->>'orderItemId')::uuid;
    v_product_id           := (v_item->>'productId')::uuid;
    v_product_sale_unit_id := nullif(v_item->>'productSaleUnitId', '')::uuid;
    v_sale_unit_label      := v_item->>'saleUnitLabel';
    v_sale_unit_ratio      := coalesce((v_item->>'saleUnitRatio')::numeric, 1);
    v_unit_price           := coalesce((v_item->>'unitPrice')::numeric, 0);

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    perform public.ensure_product_warehouse_stock(p_organization_id, v_product_id, p_warehouse_id);

    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.product_warehouse_stocks
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = p_warehouse_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสต็อคสินค้าในคลังนี้';
    end if;

    v_stock_after    := v_stock_before - v_qty_base;
    v_reserved_after := greatest(0, v_reserved_before - v_qty_base);

    update public.product_warehouse_stocks
    set stock_quantity = v_stock_after,
        reserved_quantity = v_reserved_after
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = p_warehouse_id;

    perform public.recalculate_product_stock_totals(p_organization_id, v_product_id);

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
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      p_warehouse_id,
      'issue',
      -v_qty_base,
      v_stock_before,
      v_stock_after,
      v_dn_number,
      v_clean_notes,
      p_created_by,
      jsonb_build_object('delivery_note_id', v_dn_id, 'order_id', v_primary_order_id, 'warehouse_id', p_warehouse_id)
    );

    insert into public.delivery_note_items (
      organization_id,
      delivery_note_id,
      order_item_id,
      product_id,
      product_sale_unit_id,
      sale_unit_label,
      sale_unit_ratio,
      quantity_delivered,
      quantity_in_base_unit,
      unit_price,
      line_total
    ) values (
      p_organization_id,
      v_dn_id,
      v_order_item_id,
      v_product_id,
      v_product_sale_unit_id,
      v_sale_unit_label,
      v_sale_unit_ratio,
      v_qty_delivered,
      v_qty_base,
      v_unit_price,
      v_line_total
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    raise exception 'ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ';
  end if;

  update public.delivery_notes
  set total_amount = coalesce(total_amount, 0) + v_total_amount
  where id = v_dn_id;

  foreach v_order_id in array p_order_ids loop
    select
      bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
      bool_or(coalesce(d.delivered_qty, 0) > 0)
    into v_all_delivered, v_any_delivered
    from public.order_items oi
    left join (
      select
        dni.order_item_id,
        sum(dni.quantity_in_base_unit) as delivered_qty
      from public.delivery_note_items dni
      join public.delivery_notes dn on dn.id = dni.delivery_note_id
      where dn.status = 'confirmed'
        and dni.order_item_id in (
          select id from public.order_items where order_id = v_order_id
        )
      group by dni.order_item_id
    ) d on d.order_item_id = oi.id
    where oi.order_id = v_order_id;

    v_new_fulfillment := case
      when v_all_delivered then 'complete'
      when v_any_delivered then 'partial'
      else 'pending'
    end;

    update public.orders
    set fulfillment_status = v_new_fulfillment
    where id = v_order_id;
  end loop;

  return v_dn_number;
end;
$$;
