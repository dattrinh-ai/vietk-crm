-- =====================================================================
-- VietK CRM — bổ sung 02: Cài đặt CRM + giá theo Chính sách phân phối
-- Chạy sau crm_schema.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- Giá theo file "Chính sách phân phối" (đã gồm VAT)
alter table public.crm_products
  add column if not exists min_dealer_price numeric,   -- Giá PP công ty thu về (sàn)
  add column if not exists demo_price numeric,         -- Giá demo SP
  add column if not exists flex_price numeric,         -- Giá linh hoạt gói nhỏ (thu về không nhỏ hơn)
  add column if not exists promos jsonb not null default '[]'::jsonb,  -- [{min_qty, gift_qty, gift, discount_pct, text}]
  add column if not exists full_name text,             -- tên đầy đủ kèm thông số như trong bảng chính sách
  add column if not exists sort int not null default 0;

-- Cài đặt CRM (1 dòng): danh mục lựa chọn, quy tắc chăm sóc, mẫu tin nhắn, thông tin in báo giá, ghi chú chính sách
create table if not exists public.crm_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.crm_settings (id, data) values (1, '{}'::jsonb) on conflict do nothing;
alter table public.crm_settings enable row level security;
drop policy if exists crm_settings_select on public.crm_settings;
drop policy if exists crm_settings_admin on public.crm_settings;
create policy crm_settings_select on public.crm_settings for select to authenticated using (public.crm_user());
create policy crm_settings_admin on public.crm_settings for update to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
grant select, update on public.crm_settings to authenticated;

-- Quản trị bật / tắt quyền dùng CRM, đổi vai trò ngay trong CRM (cl_members đã có quyền sửa cho Quản trị)
-- Vá: nhân viên không được tự bật quyền CRM cho mình (giữ nguyên các khoá cũ của Checklist)
create or replace function public.cl_members_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.cl_is_admin() then
    new.role := old.role; new.dept := old.dept; new.title := old.title; new.active := old.active;
    new.full_name := old.full_name; new.email := old.email; new.telegram_chat_id := old.telegram_chat_id;
    new.emp_type := old.emp_type; new.track_late := old.track_late; new.start_time := old.start_time; new.needs_report := old.needs_report;
    new.crm_access := old.crm_access;
  end if;
  return new;
end $$;
