-- VietK CRM — bổ sung 04: giảm giá theo % (cột discount vẫn lưu số tiền giảm đã quy đổi)
alter table public.crm_orders add column if not exists discount_pct numeric;
alter table public.crm_orders drop constraint if exists crm_orders_discount_pct_check;
alter table public.crm_orders add constraint crm_orders_discount_pct_check check (discount_pct is null or (discount_pct >= 0 and discount_pct <= 100));
