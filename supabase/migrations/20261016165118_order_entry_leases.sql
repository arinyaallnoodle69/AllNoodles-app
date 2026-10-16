create table public.order_entry_leases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_date date not null,
  owner_token uuid not null,
  session_id text not null,
  user_id uuid not null references public.app_users(id),
  expires_at timestamptz not null,
  primary key(organization_id,customer_id,order_date)
);
alter table public.order_entry_leases enable row level security;
revoke all on public.order_entry_leases from public,anon,authenticated;
grant select,insert,update,delete on public.order_entry_leases to service_role;
create policy order_entry_service on public.order_entry_leases to service_role using(true) with check(true);

create function public.order_entry_lease(p_org uuid,p_user uuid,p_session text,p_owner uuid,p_date date,p_customer uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare granted boolean:=false; already_ordered integer;
begin
  if p_owner is null or p_date is null or nullif(p_session,'') is null or p_action not in ('acquire','renew','release','state') then raise exception 'ข้อมูลสิทธิ์กรอกออเดอร์ไม่ถูกต้อง'; end if;
  if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์กรอกออเดอร์'; end if;
  if p_action<>'state' then
    perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
    if p_action='acquire' then
      if not exists(select 1 from public.customers where id=p_customer and organization_id=p_org and is_active) then raise exception 'ไม่พบร้านค้า'; end if;
      delete from public.order_entry_leases where organization_id=p_org and expires_at<=clock_timestamp();
      insert into public.order_entry_leases values(p_org,p_customer,p_date,p_owner,p_session,p_user,clock_timestamp()+interval '90 seconds')
      on conflict(organization_id,customer_id,order_date) do update set owner_token=excluded.owner_token,session_id=excluded.session_id,user_id=excluded.user_id,expires_at=excluded.expires_at
      where public.order_entry_leases.owner_token=p_owner and public.order_entry_leases.session_id=p_session
      returning true into granted;
    elsif p_action='renew' then
      update public.order_entry_leases set expires_at=clock_timestamp()+interval '90 seconds'
      where organization_id=p_org and customer_id=p_customer and order_date=p_date and owner_token=p_owner and session_id=p_session and expires_at>clock_timestamp()
      returning true into granted;
    else
      delete from public.order_entry_leases where organization_id=p_org and customer_id=p_customer and order_date=p_date and owner_token=p_owner and session_id=p_session;
    end if;
  end if;
  select count(*) into already_ordered from public.orders where organization_id=p_org and customer_id=p_customer and order_date=p_date and status<>'cancelled';
  return jsonb_build_object('granted',coalesce(granted,false),'orderedCount',already_ordered,
    'counts',coalesce((select jsonb_object_agg(customer_id,n) from (select customer_id,count(*) n from public.orders where organization_id=p_org and order_date=p_date and status<>'cancelled' group by customer_id) c),'{}'::jsonb),
    'locks',coalesce((select jsonb_agg(jsonb_build_object('customerId',l.customer_id,'displayName',u.display_name,'expiresAt',l.expires_at,'owned',l.owner_token=p_owner and l.session_id=p_session))
      from public.order_entry_leases l join public.app_users u on u.id=l.user_id where l.organization_id=p_org and l.order_date=p_date and l.expires_at>clock_timestamp()),'[]'::jsonb));
end $$;
revoke all on function public.order_entry_lease(uuid,uuid,text,uuid,date,uuid,text) from public,anon,authenticated;
grant execute on function public.order_entry_lease(uuid,uuid,text,uuid,date,uuid,text) to service_role;

-- Preserve the existing save path, including idempotency, reserve and billing behavior.
create function public.save_manual_order_with_lease(p_org uuid,p_user uuid,p_customer uuid,p_date date,p_notes text,p_channel text,p_items jsonb,p_request uuid,p_owner uuid,p_session text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  if exists(select 1 from public.manual_order_save_requests where organization_id=p_org and request_id=p_request) then
    return public.save_manual_order_with_reserve(p_org,p_user,p_customer,p_date,p_notes,p_channel,p_items,p_request);
  end if;
  if not exists(select 1 from public.order_entry_leases where organization_id=p_org and customer_id=p_customer and order_date=p_date and owner_token=p_owner and session_id=p_session and user_id=p_user and expires_at>clock_timestamp()) then
    raise exception 'สิทธิ์กรอกออเดอร์หมดอายุหรือมีผู้อื่นกำลังกรอก กรุณาเลือกร้านค้าใหม่';
  end if;
  perform set_config('app.order_entry_owner',p_owner::text,true);
  result:=public.save_manual_order_with_reserve(p_org,p_user,p_customer,p_date,p_notes,p_channel,p_items,p_request);
  delete from public.order_entry_leases where organization_id=p_org and customer_id=p_customer and order_date=p_date and owner_token=p_owner and session_id=p_session;
  return result;
end $$;
revoke all on function public.save_manual_order_with_lease(uuid,uuid,uuid,date,text,text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_manual_order_with_lease(uuid,uuid,uuid,date,text,text,jsonb,uuid,uuid,text) to service_role;

-- Older open clients must also respect a lease held by a newer client.
do $patch$
declare definition text; marker text:='select c.default_warehouse_id into strict v_order_id';
begin
  definition:=pg_get_functiondef('public.save_manual_order_with_reserve(uuid,uuid,uuid,date,text,text,jsonb,uuid)'::regprocedure);
  if position(marker in definition)=0 then raise exception 'Manual save function changed; lease guard must be reviewed'; end if;
  execute replace(definition,marker,
    'if exists(select 1 from public.order_entry_leases where organization_id=p_org and customer_id=p_customer and order_date=p_date and expires_at>clock_timestamp() and owner_token::text is distinct from current_setting(''app.order_entry_owner'',true)) then raise exception ''มีผู้อื่นกำลังกรอกออเดอร์ร้านนี้ กรุณารอให้บันทึกเสร็จ''; end if; '||marker);
end $patch$;
