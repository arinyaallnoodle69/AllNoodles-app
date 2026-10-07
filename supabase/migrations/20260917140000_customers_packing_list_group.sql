-- Print-only grouping tag for the packing list (ใบออเดอร์).
-- null = default sheet, 'bkk_noodle' = รถกรุงเทพบะหมี่ sheet.
alter table public.customers
  add column if not exists packing_list_group text null
  check (packing_list_group is null or packing_list_group in ('bkk_noodle'));

-- Seed the codes that were previously hard-coded so behaviour stays identical.
update public.customers
set packing_list_group = 'bkk_noodle'
where upper(customer_code) in (
  'ANS002','ANS004','ANS003','ANS033','ANS034','ANS035','ANS036','ANS037',
  'ANS038','ANS006','ANS005','ANS007','ANS039','ANS040','ANS009','ANS042',
  'ANS043','ANS044','ANS045','ANS046','ANS047','ANS011','ANS019','ANS050',
  'ANS021','ANS052','ANS053','ANS054','ANS055','ANS056','ANS189','ANS058',
  'ANS026','ANS028','ANS060','ANS061','ANS062','ANS063','ANS064'
);
