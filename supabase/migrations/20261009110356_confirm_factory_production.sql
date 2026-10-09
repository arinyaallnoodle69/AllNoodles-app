create or replace function public.save_confirmed_factory_production(
  p_organization_id uuid, p_date date, p_user_id uuid, p_operation text, p_rows jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  r jsonb; product public.products%rowtype; stored jsonb; next_value jsonb;
  demand numeric; remaining numeric; reserve numeric; production numeric; addition numeric;
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
  if p_organization_id is null or p_date is null or p_user_id is null
    or p_operation not in ('confirm', 'add') or p_operation is null
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) <> 3 then
    raise exception 'ข้อมูลยืนยันสั่งโรงงานไม่ถูกต้อง';
  end if;
  if (select count(distinct (v->>'productId')::uuid) from jsonb_array_elements(p_rows) v) <> 3 then
    raise exception 'ข้อมูลสินค้าซ้ำ';
  end if;
  perform id from public.products
    where organization_id = p_organization_id and id in
      (select (v->>'productId')::uuid from jsonb_array_elements(p_rows) v)
    order by id for update;
  for r in select value from jsonb_array_elements(p_rows) order by value->>'productId' loop
    select * into product from public.products
      where id = (r->>'productId')::uuid and organization_id = p_organization_id;
    if not found or upper(trim(product.sku)) not in ('ANP180','ANP181','ANP182') then
      raise exception 'ปรับยอดได้เฉพาะสินค้าสำรองขององค์กรนี้';
    end if;
    stored := product.metadata #> array['factory_order_adjustments', p_date::text];
    if (stored->>'updatedAt') is distinct from (r->>'updatedAt') then
      raise exception 'ยอดโรงงานถูกเปลี่ยนแล้ว กรุณาเปิดหน้าใหม่';
    end if;
    if p_operation = 'confirm' then
      if stored is not null then raise exception 'ยืนยันแล้ว ใช้สั่งผลิตเพิ่มเพื่อเพิ่มยอดโรงงาน'; end if;
      demand := (r->>'orderDemand')::numeric;
      remaining := (r->>'remainingQuantity')::numeric;
      reserve := (r->>'reserveQuantity')::numeric;
      production := (r->>'adjustedQuantity')::numeric;
      if demand is null or remaining is null or reserve is null or production is null
        or least(demand,remaining,reserve,production) < 0
        or greatest(demand,remaining,reserve,production) = 'NaN'::numeric
        or greatest(demand,remaining,reserve,production) = 'Infinity'::numeric
        or abs(production - greatest(0,demand+reserve-remaining)) > 0.001 then
        raise exception 'จำนวนหรือสูตรยอดสั่งไม่ถูกต้อง';
      end if;
      next_value := jsonb_build_object(
        'adjustedQuantity', production, 'orderDemand', demand,
        'remainingQuantity', remaining, 'reserveQuantity', reserve,
        'confirmedAt', stamp, 'updatedAt', stamp, 'updatedBy', p_user_id);
    else
      if stored is null then raise exception 'ต้องยืนยันยอดโรงงานก่อนสั่งผลิตเพิ่ม'; end if;
      addition := (r->>'additionalQuantity')::numeric;
      if addition is null or addition < 0 or addition in ('NaN'::numeric,'Infinity'::numeric) then
        raise exception 'จำนวนสั่งผลิตเพิ่มไม่ถูกต้อง';
      end if;
      if addition = 0 then continue; end if;
      next_value := stored || jsonb_build_object(
        'adjustedQuantity', (stored->>'adjustedQuantity')::numeric + addition,
        'reserveQuantity', (stored->>'reserveQuantity')::numeric + addition,
        'confirmedAt', coalesce(stored->>'confirmedAt',stored->>'updatedAt'),
        'updatedAt', stamp, 'updatedBy', p_user_id,
        'productionAdditions', coalesce(stored->'productionAdditions','[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('quantity',addition,'at',stamp,'by',p_user_id)));
    end if;
    update public.products set metadata = jsonb_set(
      coalesce(product.metadata,'{}'::jsonb), '{factory_order_adjustments}',
      coalesce(product.metadata->'factory_order_adjustments','{}'::jsonb)
        || jsonb_build_object(p_date::text,next_value), true)
      where id = product.id and organization_id = p_organization_id;
  end loop;
end;
$$;
revoke all on function public.save_confirmed_factory_production(uuid,date,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_confirmed_factory_production(uuid,date,uuid,text,jsonb) to service_role;
