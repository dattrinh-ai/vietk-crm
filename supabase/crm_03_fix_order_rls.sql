-- =====================================================================
-- VietK CRM — sửa 03: tạo báo giá / đơn bị báo "không có quyền"
-- Nguyên nhân: quy tắc xem đơn tra lại chính bảng crm_orders theo id → khi vừa thêm đơn, lệnh đọc lại
-- (INSERT … RETURNING) chưa thấy dòng mới nên bị chặn. Sửa: xét quyền qua khách của đơn (customer_id có sẵn trên dòng).
-- =====================================================================
create or replace function public.crm_can_see_order_row(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_customers c where c.id = p_customer and public.crm_can_see_customer(c.owner_id, c.id))
$$;
drop policy if exists crm_orders_select on public.crm_orders;
drop policy if exists crm_orders_update on public.crm_orders;
create policy crm_orders_select on public.crm_orders for select to authenticated using (public.crm_can_see_order_row(customer_id));
create policy crm_orders_update on public.crm_orders for update to authenticated
  using (public.crm_can_see_order_row(customer_id)) with check (public.crm_can_see_order_row(customer_id));
