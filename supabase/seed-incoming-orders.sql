-- Seed data for the incoming orders page only.
-- Safe to run more than once. It creates or updates only demo orders and order items.
-- It uses existing organizations, customers, products, sale units, users, and warehouses.
-- Intended for local or staging databases, not production.
-- Set v_target_org_slug below if you want a specific organization.

begin;

do $$
declare
  v_target_org_slug text := null;

  v_org uuid;
  v_user uuid;
  v_customer_1 uuid;
  v_customer_2 uuid;
  v_customer_3 uuid;
  v_warehouse_1 uuid;
  v_warehouse_2 uuid;

  v_product_1 uuid;
  v_product_2 uuid;
  v_product_3 uuid;
  v_unit_1 uuid;
  v_unit_2 uuid;
  v_unit_3 uuid;
  v_label_1 text;
  v_label_2 text;
  v_label_3 text;
  v_ratio_1 numeric;
  v_ratio_2 numeric;
  v_ratio_3 numeric;
  v_price_1 numeric;
  v_price_2 numeric;
  v_price_3 numeric;
  v_cost_1 numeric;
  v_cost_2 numeric;
  v_cost_3 numeric;

  v_order_1 uuid := '00000000-0000-0000-0000-000000020101';
  v_order_2 uuid := '00000000-0000-0000-0000-000000020102';
  v_order_3 uuid := '00000000-0000-0000-0000-000000020103';
  v_order_4 uuid := '00000000-0000-0000-0000-000000020104';

  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_created_at timestamp with time zone := now();

  v_total_1 numeric;
  v_total_2 numeric;
  v_total_3 numeric;
  v_total_4 numeric;
begin
  select id
    into v_org
    from public.organizations
    where v_target_org_slug is not null
      and slug = v_target_org_slug
      and is_active = true
    limit 1;

  if v_org is null then
    select id
      into v_org
      from public.organizations
      where is_active = true
      order by created_at asc
      limit 1;
  end if;

  if v_org is null then
    raise exception 'Seed needs at least one active organization.';
  end if;

  select id
    into v_user
    from public.app_users
    where organization_id = v_org
      and is_active = true
    order by created_at asc
    limit 1;

  select id
    into v_customer_1
    from public.customers
    where organization_id = v_org
      and is_active = true
    order by created_at asc
    limit 1;

  select id
    into v_customer_2
    from public.customers
    where organization_id = v_org
      and is_active = true
      and id <> v_customer_1
    order by created_at asc
    limit 1;

  select id
    into v_customer_3
    from public.customers
    where organization_id = v_org
      and is_active = true
      and id <> v_customer_1
      and id <> coalesce(v_customer_2, v_customer_1)
    order by created_at asc
    limit 1;

  if v_customer_1 is null then
    raise exception 'Seed needs at least one active customer in the target organization.';
  end if;

  v_customer_2 := coalesce(v_customer_2, v_customer_1);
  v_customer_3 := coalesce(v_customer_3, v_customer_2, v_customer_1);

  select id
    into v_warehouse_1
    from public.warehouses
    where organization_id = v_org
      and is_active = true
    order by sort_order asc, name asc
    limit 1;

  select id
    into v_warehouse_2
    from public.warehouses
    where organization_id = v_org
      and is_active = true
      and id <> v_warehouse_1
    order by sort_order asc, name asc
    limit 1;

  v_warehouse_2 := coalesce(v_warehouse_2, v_warehouse_1);

  create temporary table if not exists seed_incoming_order_products (
    row_number integer primary key,
    product_id uuid not null,
    unit_id uuid,
    unit_label text not null,
    unit_ratio numeric not null,
    unit_price numeric not null,
    cost_price numeric not null
  ) on commit drop;

  truncate table seed_incoming_order_products;

  insert into seed_incoming_order_products (
    row_number,
    product_id,
    unit_id,
    unit_label,
    unit_ratio,
    unit_price,
    cost_price
  )
  select
    row_number() over (
      order by p.created_at asc, p.name asc
    ) as row_number,
    p.id,
    psu.id,
    coalesce(psu.unit_label, nullif(p.unit, ''), 'unit') as unit_label,
    coalesce(psu.base_unit_quantity, 1) as unit_ratio,
    greatest(coalesce(p.cost_price, 0) * 2, 1) as unit_price,
    coalesce(p.cost_price, 0) as cost_price
  from public.products p
  left join lateral (
    select product_sale_units.id, product_sale_units.unit_label, product_sale_units.base_unit_quantity
    from public.product_sale_units
    where product_sale_units.organization_id = p.organization_id
      and product_sale_units.product_id = p.id
      and product_sale_units.is_active = true
    order by product_sale_units.is_default desc, product_sale_units.sort_order asc, product_sale_units.created_at asc
    limit 1
  ) psu on true
  where p.organization_id = v_org
    and p.is_active = true
  order by p.created_at asc, p.name asc
  limit 3;

  select product_id, unit_id, unit_label, unit_ratio, unit_price, cost_price
    into v_product_1, v_unit_1, v_label_1, v_ratio_1, v_price_1, v_cost_1
    from seed_incoming_order_products
    where row_number = 1;

  select product_id, unit_id, unit_label, unit_ratio, unit_price, cost_price
    into v_product_2, v_unit_2, v_label_2, v_ratio_2, v_price_2, v_cost_2
    from seed_incoming_order_products
    where row_number = 2;

  select product_id, unit_id, unit_label, unit_ratio, unit_price, cost_price
    into v_product_3, v_unit_3, v_label_3, v_ratio_3, v_price_3, v_cost_3
    from seed_incoming_order_products
    where row_number = 3;

  if v_product_1 is null then
    raise exception 'Seed needs at least one active product in the target organization.';
  end if;

  v_product_2 := coalesce(v_product_2, v_product_1);
  v_unit_2 := coalesce(v_unit_2, v_unit_1);
  v_label_2 := coalesce(v_label_2, v_label_1);
  v_ratio_2 := coalesce(v_ratio_2, v_ratio_1, 1);
  v_price_2 := coalesce(v_price_2, v_price_1, 1);
  v_cost_2 := coalesce(v_cost_2, v_cost_1, 0);

  v_product_3 := coalesce(v_product_3, v_product_2, v_product_1);
  v_unit_3 := coalesce(v_unit_3, v_unit_2, v_unit_1);
  v_label_3 := coalesce(v_label_3, v_label_2, v_label_1);
  v_ratio_3 := coalesce(v_ratio_3, v_ratio_2, v_ratio_1, 1);
  v_price_3 := coalesce(v_price_3, v_price_2, v_price_1, 1);
  v_cost_3 := coalesce(v_cost_3, v_cost_2, v_cost_1, 0);

  v_total_1 := (5 * v_price_1) + (2 * v_price_2);
  v_total_2 := 3 * v_price_3;
  v_total_3 := 1 * v_price_1;
  v_total_4 := (4 * v_price_2) + (1 * v_price_3);

  insert into public.orders (
    id,
    organization_id,
    customer_id,
    order_number,
    order_date,
    requested_delivery_date,
    status,
    fulfillment_status,
    subtotal_amount,
    total_amount,
    notes,
    placed_by_user_id,
    verified_by_user_id,
    warehouse_id,
    metadata,
    created_at
  )
  values
    (
      v_order_1,
      v_org,
      v_customer_1,
      'ORD-SEED-INCOMING-001',
      v_today,
      v_today,
      'submitted'::public.order_status,
      'pending',
      v_total_1,
      v_total_1,
      'Seed incoming order for the order list page.',
      v_user,
      null,
      v_warehouse_1,
      jsonb_build_object('seed', 'incoming-orders-only', 'source', 'line'),
      v_created_at - interval '40 minutes'
    ),
    (
      v_order_2,
      v_org,
      v_customer_2,
      'ORD-SEED-INCOMING-002',
      v_today,
      v_today,
      'submitted'::public.order_status,
      'pending',
      v_total_2,
      v_total_2,
      'Seed manual order for filter testing.',
      v_user,
      null,
      v_warehouse_2,
      jsonb_build_object('seed', 'incoming-orders-only', 'source', 'manual'),
      v_created_at - interval '25 minutes'
    ),
    (
      v_order_3,
      v_org,
      v_customer_3,
      'ORD-SEED-INCOMING-003',
      v_today,
      v_today,
      'cancelled'::public.order_status,
      'pending',
      v_total_3,
      v_total_3,
      'Seed cancelled order for status testing.',
      v_user,
      null,
      v_warehouse_1,
      jsonb_build_object('seed', 'incoming-orders-only', 'source', 'chat'),
      v_created_at - interval '10 minutes'
    ),
    (
      v_order_4,
      v_org,
      v_customer_1,
      'ORD-SEED-INCOMING-004',
      v_today + 1,
      v_today + 1,
      'submitted'::public.order_status,
      'pending',
      v_total_4,
      v_total_4,
      'Seed next-day order for date range testing.',
      v_user,
      null,
      v_warehouse_2,
      jsonb_build_object('seed', 'incoming-orders-only', 'source', 'line'),
      v_created_at
    )
  on conflict (organization_id, order_number) do update
  set
    customer_id = excluded.customer_id,
    order_date = excluded.order_date,
    requested_delivery_date = excluded.requested_delivery_date,
    status = excluded.status,
    fulfillment_status = excluded.fulfillment_status,
    subtotal_amount = excluded.subtotal_amount,
    total_amount = excluded.total_amount,
    notes = excluded.notes,
    placed_by_user_id = excluded.placed_by_user_id,
    verified_by_user_id = excluded.verified_by_user_id,
    warehouse_id = excluded.warehouse_id,
    metadata = excluded.metadata,
    created_at = excluded.created_at,
    updated_at = now();

  insert into public.order_items (
    id,
    organization_id,
    order_id,
    product_id,
    product_sale_unit_id,
    quantity,
    quantity_in_base_unit,
    sale_unit_label,
    sale_unit_ratio,
    unit_price,
    cost_price,
    line_total,
    notes
  )
  values
    ('00000000-0000-0000-0000-000000020201', v_org, v_order_1, v_product_1, v_unit_1, 5, 5 * v_ratio_1, v_label_1, v_ratio_1, v_price_1, v_cost_1, 5 * v_price_1, null),
    ('00000000-0000-0000-0000-000000020202', v_org, v_order_1, v_product_2, v_unit_2, 2, 2 * v_ratio_2, v_label_2, v_ratio_2, v_price_2, v_cost_2, 2 * v_price_2, null),
    ('00000000-0000-0000-0000-000000020203', v_org, v_order_2, v_product_3, v_unit_3, 3, 3 * v_ratio_3, v_label_3, v_ratio_3, v_price_3, v_cost_3, 3 * v_price_3, null),
    ('00000000-0000-0000-0000-000000020204', v_org, v_order_3, v_product_1, v_unit_1, 1, 1 * v_ratio_1, v_label_1, v_ratio_1, v_price_1, v_cost_1, 1 * v_price_1, null),
    ('00000000-0000-0000-0000-000000020205', v_org, v_order_4, v_product_2, v_unit_2, 4, 4 * v_ratio_2, v_label_2, v_ratio_2, v_price_2, v_cost_2, 4 * v_price_2, null),
    ('00000000-0000-0000-0000-000000020206', v_org, v_order_4, v_product_3, v_unit_3, 1, 1 * v_ratio_3, v_label_3, v_ratio_3, v_price_3, v_cost_3, 1 * v_price_3, null)
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    order_id = excluded.order_id,
    product_id = excluded.product_id,
    product_sale_unit_id = excluded.product_sale_unit_id,
    quantity = excluded.quantity,
    quantity_in_base_unit = excluded.quantity_in_base_unit,
    sale_unit_label = excluded.sale_unit_label,
    sale_unit_ratio = excluded.sale_unit_ratio,
    unit_price = excluded.unit_price,
    cost_price = excluded.cost_price,
    line_total = excluded.line_total,
    notes = excluded.notes,
    updated_at = now();
end $$;

commit;
