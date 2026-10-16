begin;
create temporary table barcode_guard_orders(id text,customer_id text,organization_id text);
create temporary table barcode_guard_customers(id text,organization_id text,customer_code text);
create temporary table barcode_guard_products(id text,organization_id text,sku text);
create temporary table barcode_guard_items(id text,is_barcode boolean,is_replacement boolean,product_id text,order_id text,organization_id text,quantity integer);
insert into barcode_guard_customers values('shop','org','ANS109'),('other','org','ANS001');
insert into barcode_guard_orders values('order','shop','org'),('other-order','other','org');
insert into barcode_guard_products values('removed','org','ANP054'),('allowed','org','ANP097');
insert into barcode_guard_items values('legacy',true,false,'removed','order','org',300);
do $setup$
declare definition text;
begin
 definition:=pg_get_functiondef('public.guard_order_barcode_packaging()'::regprocedure);
 definition:=replace(definition,'public.guard_order_barcode_packaging()','pg_temp.test_barcode_guard()');
 definition:=replace(definition,'public.orders','pg_temp.barcode_guard_orders');
 definition:=replace(definition,'public.customers','pg_temp.barcode_guard_customers');
 definition:=replace(definition,'public.products','pg_temp.barcode_guard_products');
 execute definition;
end $setup$;
create trigger barcode_guard_test before insert or update on barcode_guard_items for each row execute function pg_temp.test_barcode_guard();
do $tests$
declare failed boolean;
begin
 failed:=false;
 begin insert into pg_temp.barcode_guard_items values('new054',true,false,'removed','order','org',10);
 exception when raise_exception then
  if sqlerrm not like 'บาร์โค้ดใช้ได้%' then raise; end if;
  failed:=true;
 end;
 if not failed then raise exception 'New ANP054 barcode must be rejected'; end if;
 update pg_temp.barcode_guard_items set quantity=200 where id='legacy';
 if (select quantity from pg_temp.barcode_guard_items where id='legacy')<>200 then raise exception 'Existing historical barcode must remain editable'; end if;
 insert into pg_temp.barcode_guard_items values('new097',true,false,'allowed','order','org',10);
 failed:=false;
 begin update pg_temp.barcode_guard_items set product_id='removed' where id='new097';
 exception when raise_exception then
  if sqlerrm not like 'บาร์โค้ดใช้ได้%' then raise; end if;
  failed:=true;
 end;
 if not failed then raise exception 'Changing another product into ANP054 barcode must be rejected'; end if;
 failed:=false;
 begin insert into pg_temp.barcode_guard_items values('other',true,false,'allowed','other-order','org',10);
 exception when raise_exception then
  if sqlerrm not like 'บาร์โค้ดใช้ได้%' then raise; end if;
  failed:=true;
 end;
 if not failed then raise exception 'Other customer must be rejected'; end if;
end $tests$;
rollback;
