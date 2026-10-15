begin;
create schema reserve_feature_test;
do $setup$
declare name text; definition text;
begin
  perform set_config('app.reserve_mutation_order',md5('bkkorder')::uuid::text,true);
  foreach name in array array['organizations','app_users','warehouses','suppliers','vehicles','customers','products','product_sale_units','orders','order_items','delivery_notes','fresh_reserve_stock_groups','fresh_reserve_stock_openings','fresh_reserve_stock_movements','product_warehouse_fulfillment_modes','daily_order_special_items','customer_product_prices','manual_order_save_requests'] loop
    execute format('create table reserve_feature_test.%I as select * from public.%I with no data',name,name);
  end loop;
  foreach name in array array['organizations','orders','fresh_reserve_stock_groups'] loop
    execute format('alter table reserve_feature_test.%I add primary key(id)',name);
  end loop;
  foreach name in array array['orders','order_items','fresh_reserve_stock_movements'] loop
    execute format('alter table reserve_feature_test.%I alter column id set default gen_random_uuid()',name);
  end loop;
  alter table reserve_feature_test.order_items alter column supply_source set default 'auto';
  if not exists(select 1 from pg_constraint where conrelid='public.manual_order_save_requests'::regclass and conname='manual_order_save_requests_order_id_fkey' and confdeltype='c') then
    raise exception 'Request receipts must permit normal order deletion';
  end if;
  alter table reserve_feature_test.manual_order_save_requests add foreign key(order_id) references reserve_feature_test.orders(id) on delete cascade;
  perform set_config('search_path','reserve_feature_test,public',true);
  foreach name in array array['fresh_reserve_stock_balances','provincial_fresh_reserve_stock_balances'] loop
    execute 'create view reserve_feature_test.'||name||' as '||replace(pg_get_viewdef(('public.'||name)::regclass,true),'public.','reserve_feature_test.');
  end loop;
  for definition in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('merge_order_items_atomic','save_order_items_and_delivery','capture_fresh_reserve_stock_special','fresh_reserve_order_quantities','resolve_fresh_supply_source','guard_fresh_reserve_item','log_fresh_reserve_order_delta','capture_fresh_reserve_item_source','guard_fresh_reserve_order','capture_fresh_reserve_order_status','guard_reserve_remaining_overlap','guard_reserve_delivery_warehouse','save_manual_order_with_reserve','protect_reserved_items_from_rebuild','protect_reserved_product_mode') loop
    execute replace(definition,'public.','reserve_feature_test.');
  end loop;
end $setup$;
create function reserve_feature_test.sync_order_delivery_current(uuid,uuid,uuid, jsonb default '{}'::jsonb) returns text language sql as $$select 'TEST-DN'::text$$;
create function reserve_feature_test.next_order_number(p_order_date date,p_organization_id uuid) returns text language sql as $$select 'TEST-ORDER'::text$$;

create trigger source_before before insert or update or delete on reserve_feature_test.order_items for each row execute function reserve_feature_test.guard_fresh_reserve_item();
create trigger source_after after insert or update or delete on reserve_feature_test.order_items for each row execute function reserve_feature_test.capture_fresh_reserve_item_source();
create trigger order_before before update or delete on reserve_feature_test.orders for each row execute function reserve_feature_test.guard_fresh_reserve_order();
create trigger order_after after update of status on reserve_feature_test.orders for each row execute function reserve_feature_test.capture_fresh_reserve_order_status();
create trigger overlap_before before insert or update on reserve_feature_test.daily_order_special_items for each row execute function reserve_feature_test.guard_reserve_remaining_overlap();
create trigger delivery_before before insert or update on reserve_feature_test.delivery_notes for each row execute function reserve_feature_test.guard_reserve_delivery_warehouse();
create trigger rebuild_before before update or delete on reserve_feature_test.order_items for each row execute function reserve_feature_test.protect_reserved_items_from_rebuild();
create trigger mode_before before update or delete on reserve_feature_test.product_warehouse_fulfillment_modes for each row execute function reserve_feature_test.protect_reserved_product_mode();

insert into reserve_feature_test.organizations(id) values(md5('org')::uuid);
insert into reserve_feature_test.app_users(id,organization_id,is_active,role) values(md5('user')::uuid,md5('org')::uuid,true,'admin');
insert into reserve_feature_test.warehouses(id,organization_id,name) values(md5('bkk')::uuid,md5('org')::uuid,'คลังกรุงเทพ'),(md5('prov')::uuid,md5('org')::uuid,'คลังต่างจังหวัด');
insert into reserve_feature_test.suppliers(id,organization_id,name,supplier_code) values(md5('dragon')::uuid,md5('org')::uuid,'โรงงานมังกร','dragon'),(md5('lotus')::uuid,md5('org')::uuid,'A.ดอกบัว','TYV005');
insert into reserve_feature_test.products(id,organization_id,name,is_active,metadata) values(md5('product')::uuid,md5('org')::uuid,'เส้นทดสอบ',true,'{}');
insert into reserve_feature_test.product_sale_units(id,organization_id,product_id,base_unit_quantity,is_active) values(md5('unit')::uuid,md5('org')::uuid,md5('product')::uuid,5,true);
insert into reserve_feature_test.product_warehouse_fulfillment_modes(organization_id,product_id,warehouse_id,supplier_id,mode) values
 (md5('org')::uuid,md5('product')::uuid,md5('bkk')::uuid,md5('dragon')::uuid,'fresh'),(md5('org')::uuid,md5('product')::uuid,md5('prov')::uuid,md5('lotus')::uuid,'fresh');
insert into reserve_feature_test.fresh_reserve_stock_groups(id,organization_id,warehouse_id,supplier_id,start_date) values
 (md5('bkkgroup')::uuid,md5('org')::uuid,md5('bkk')::uuid,md5('dragon')::uuid,'2026-10-12'),(md5('provgroup')::uuid,md5('org')::uuid,md5('prov')::uuid,md5('lotus')::uuid,'2026-10-12');
insert into reserve_feature_test.fresh_reserve_stock_openings(group_id,product_id,quantity) values(md5('bkkgroup')::uuid,md5('product')::uuid,100),(md5('provgroup')::uuid,md5('product')::uuid,100);
insert into reserve_feature_test.customers(id,organization_id,is_active,default_warehouse_id) values(md5('customer')::uuid,md5('org')::uuid,true,md5('bkk')::uuid);
insert into reserve_feature_test.orders(id,organization_id,customer_id,warehouse_id,order_date,status,placed_by_user_id) values
 (md5('bkkorder')::uuid,md5('org')::uuid,md5('customer')::uuid,md5('bkk')::uuid,'2026-10-12','submitted',md5('user')::uuid),
 (md5('mon')::uuid,md5('org')::uuid,md5('customer')::uuid,md5('prov')::uuid,'2026-10-12','submitted',md5('user')::uuid),
 (md5('tue')::uuid,md5('org')::uuid,md5('customer')::uuid,md5('prov')::uuid,'2026-10-13','submitted',md5('user')::uuid);
do $tests$
declare item uuid; failed boolean; source text; result jsonb; first_id uuid; before_qty numeric;
begin
  insert into reserve_feature_test.order_items(organization_id,order_id,product_id,product_sale_unit_id,quantity,sale_unit_ratio,quantity_in_base_unit,supply_source)
    values(md5('org')::uuid,md5('bkkorder')::uuid,md5('product')::uuid,md5('unit')::uuid,4,5,20,'reserve') returning id into item;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>80 then raise exception 'BKK reserve must deduct once'; end if;
  if (select available from reserve_feature_test.provincial_fresh_reserve_stock_balances)<>100 then raise exception 'Warehouse isolation'; end if;
  perform set_config('app.reserve_mutation_order','',true);
  failed:=false;
  begin delete from reserve_feature_test.order_items where id=item; exception when others then failed:=true; end;
  if not failed then raise exception 'Untrusted rebuild must not delete reserve rows'; end if;
  perform set_config('app.reserve_mutation_order',md5('bkkorder')::uuid::text,true);
  update reserve_feature_test.order_items set quantity=6,quantity_in_base_unit=30 where id=item;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>70 then raise exception 'Edit only delta'; end if;
  failed:=false;
  begin update reserve_feature_test.order_items set quantity=30,quantity_in_base_unit=150 where id=item; exception when others then failed:=true; end;
  if not failed or (select quantity from reserve_feature_test.order_items where id=item)<>6 then raise exception 'Shortage must rollback'; end if;
  update reserve_feature_test.orders set status='cancelled' where id=md5('bkkorder')::uuid;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>100 then raise exception 'Cancel restores reserve'; end if;
  update reserve_feature_test.orders set status='submitted' where id=md5('bkkorder')::uuid;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>70 then raise exception 'Restore order rechecks/deducts'; end if;
  failed:=false;
  begin update reserve_feature_test.orders set warehouse_id=md5('prov')::uuid where id=md5('bkkorder')::uuid; exception when others then failed:=true; end;
  if not failed then raise exception 'Transfer must not silently change reserve'; end if;
  delete from reserve_feature_test.order_items where id=item;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>100 then raise exception 'Delete restores once'; end if;
  insert into reserve_feature_test.order_items(organization_id,order_id,product_id,product_sale_unit_id,quantity,sale_unit_ratio,quantity_in_base_unit)
    values(md5('org')::uuid,md5('mon')::uuid,md5('product')::uuid,md5('unit')::uuid,4,5,20) returning supply_source into source;
  if source<>'factory' or (select available from reserve_feature_test.provincial_fresh_reserve_stock_balances)<>100 then raise exception 'Monday normal must not deduct'; end if;
  insert into reserve_feature_test.order_items(organization_id,order_id,product_id,product_sale_unit_id,quantity,sale_unit_ratio,quantity_in_base_unit,supply_source)
    values(md5('org')::uuid,md5('mon')::uuid,md5('product')::uuid,md5('unit')::uuid,4,5,20,'reserve');
  insert into reserve_feature_test.order_items(organization_id,order_id,product_id,product_sale_unit_id,quantity,sale_unit_ratio,quantity_in_base_unit)
    values(md5('org')::uuid,md5('tue')::uuid,md5('product')::uuid,md5('unit')::uuid,4,5,20) returning supply_source into source;
  if source<>'reserve' or (select available from reserve_feature_test.provincial_fresh_reserve_stock_balances)<>60 then raise exception 'Tuesday automatic reserve exactly once'; end if;
  if reserve_feature_test.resolve_fresh_supply_source(md5('mon')::uuid,md5('product')::uuid,'auto')<>'factory' then raise exception 'Monday'; end if;
  failed:=false;
  begin update reserve_feature_test.order_items set quantity=1,quantity_in_base_unit=1,sale_unit_ratio=1 where supply_source='reserve'; exception when others then failed:=true; end;
  if not failed then raise exception 'Reject tampered unit ratio'; end if;
  update reserve_feature_test.product_warehouse_fulfillment_modes set mode='stock' where warehouse_id=md5('bkk')::uuid;
  failed:=false;
  begin insert into reserve_feature_test.order_items(organization_id,order_id,product_id,product_sale_unit_id,quantity,sale_unit_ratio,quantity_in_base_unit,supply_source)
    values(md5('org')::uuid,md5('bkkorder')::uuid,md5('product')::uuid,md5('unit')::uuid,1,5,5,'reserve'); exception when others then failed:=true; end;
  if not failed then raise exception 'Stock products cannot use fresh reserve'; end if;
  update reserve_feature_test.product_warehouse_fulfillment_modes set mode='fresh' where warehouse_id=md5('bkk')::uuid;
  result:=reserve_feature_test.save_manual_order_with_reserve(md5('org')::uuid,md5('user')::uuid,md5('customer')::uuid,'2026-10-13',null,'created',
    jsonb_build_array(jsonb_build_object('productId',md5('product')::uuid,'productSaleUnitId',md5('unit')::uuid,'quantity',2,'quantityInBaseUnit',10,'saleUnitRatio',5,'unitPrice',10,'isReserve',true)),md5('request')::uuid);
  first_id:=(result->>'orderId')::uuid;
  result:=reserve_feature_test.save_manual_order_with_reserve(md5('org')::uuid,md5('user')::uuid,md5('customer')::uuid,'2026-10-13',null,'created',
    jsonb_build_array(jsonb_build_object('productId',md5('product')::uuid,'productSaleUnitId',md5('unit')::uuid,'quantity',2,'quantityInBaseUnit',10,'saleUnitRatio',5,'unitPrice',10,'isReserve',true)),md5('request')::uuid);
  if (result->>'replayed')::boolean is not true or (result->>'orderId')::uuid<>first_id or (select sum(quantity_in_base_unit) from reserve_feature_test.order_items where order_id=first_id)<>10 then raise exception 'Retry must not duplicate order or withdrawal'; end if;
  if (select available from reserve_feature_test.fresh_reserve_stock_balances where group_id=md5('bkkgroup')::uuid)<>90 then raise exception 'Atomic save withdraws once'; end if;
  insert into reserve_feature_test.orders(id,organization_id,status) values(md5('normal-delete')::uuid,md5('org')::uuid,'submitted');
  insert into reserve_feature_test.manual_order_save_requests(organization_id,request_id,payload,order_id) values(md5('org')::uuid,md5('normal-request')::uuid,'{}',md5('normal-delete')::uuid);
  delete from reserve_feature_test.orders where id=md5('normal-delete')::uuid;
  if exists(select 1 from reserve_feature_test.manual_order_save_requests where request_id=md5('normal-request')::uuid) then raise exception 'Normal deletion must remove its request receipt'; end if;
end $tests$;
rollback;
select 'reserve source lifecycle, weekday, unit, warehouse, shortage and retry checks passed; fixtures rolled back' result;
