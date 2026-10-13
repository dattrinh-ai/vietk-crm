-- =====================================================================
-- VietK CRM — cấu trúc dữ liệu + phân quyền
-- Chạy SAU schema.sql của VietK Checklist (dùng chung bảng cl_members, cl_tasks).
-- Đợt 1: khách hàng & chăm sóc, sản phẩm & combo, báo giá / đơn hàng, thanh toán, lịch lắp đặt.
-- Chạy lại nhiều lần an toàn.
-- =====================================================================

-- Ai được dùng CRM (Quản trị bật/tắt từng người trong Checklist → Nhân sự)
alter table public.cl_members add column if not exists crm_access boolean not null default true;

create or replace function public.crm_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cl_members where id = auth.uid() and active and crm_access and role in ('admin', 'manager', 'staff'))
$$;

-- ---------------------------------------------------------------------
-- 1. Sản phẩm, giá vốn (chỉ Quản trị), combo
-- ---------------------------------------------------------------------
create table if not exists public.crm_products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text not null default 'Loa',
  brand text default 'BBS',
  unit text not null default 'cái',
  price numeric not null default 0,          -- giá bán lẻ
  dealer_price numeric,                      -- giá đại lý
  warranty_months int not null default 12,
  track_serial boolean not null default true,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.crm_product_costs (
  product_id uuid primary key references public.crm_products (id) on delete cascade,
  cost numeric not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.crm_combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,          -- giá trọn combo
  items jsonb not null default '[]'::jsonb,  -- [{product_id, qty}]
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Khách hàng & nhật ký chăm sóc
-- ---------------------------------------------------------------------
create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone2 text,
  address text,
  area text,                                 -- quận / tỉnh
  kind text not null default 'home' check (kind in ('home', 'business')),
  source text not null default 'fanpage',
  need text,                                 -- nhu cầu: phòng bao nhiêu m2, hát gia đình / kinh doanh…
  budget numeric,
  status text not null default 'new' check (status in ('new', 'consulting', 'quoted', 'won', 'lost')),
  owner_id uuid references public.cl_members (id) on delete set null,
  next_follow date,
  lost_reason text,
  note text,
  created_by uuid default auth.uid() references public.cl_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_customers_phone on public.crm_customers (phone);
create index if not exists crm_customers_owner on public.crm_customers (owner_id);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  kind text not null default 'note' check (kind in ('call', 'msg', 'visit', 'note', 'quote', 'order', 'install')),
  text text not null,
  by_id uuid default auth.uid() references public.cl_members (id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists crm_activities_customer on public.crm_activities (customer_id, at desc);

-- ---------------------------------------------------------------------
-- 3. Báo giá / đơn hàng, dòng hàng, thanh toán
-- ---------------------------------------------------------------------
create table if not exists public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  owner_id uuid references public.cl_members (id) on delete set null,
  status text not null default 'quote' check (status in ('quote', 'confirmed', 'scheduled', 'installed', 'done', 'cancelled')),
  delivery text not null default 'install' check (delivery in ('install', 'ship', 'pickup')),
  address text,
  discount numeric not null default 0,
  total numeric not null default 0,          -- tổng sau giảm giá (app tính khi lưu)
  quote_valid_until date,
  note text,
  confirmed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_orders_customer on public.crm_orders (customer_id);

create table if not exists public.crm_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.crm_orders (id) on delete cascade,
  product_id uuid references public.crm_products (id) on delete set null,
  combo_id uuid references public.crm_combos (id) on delete set null,
  name text not null,
  qty numeric not null default 1,
  price numeric not null default 0,
  sort int not null default 0
);
create index if not exists crm_order_items_order on public.crm_order_items (order_id);

create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.crm_orders (id) on delete cascade,
  amount numeric not null,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'card', 'cod')),
  paid_at date not null default public.cl_today(),
  note text,
  by_id uuid default auth.uid() references public.cl_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_payments_order on public.crm_payments (order_id);

-- Mã đơn tự sinh: DH261013-01
create or replace function public.crm_orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; d text;
begin
  if tg_op = 'INSERT' then
    d := to_char(public.cl_today(), 'YYMMDD');
    select count(*) + 1 into n from public.crm_orders where code like 'DH' || d || '-%';
    new.code := 'DH' || d || '-' || lpad(n::text, 2, '0');
    if new.owner_id is null then new.owner_id := auth.uid(); end if;
  else
    new.code := old.code;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.status <> 'quote' and new.status <> 'cancelled' and new.confirmed_at is null then new.confirmed_at := now(); end if;
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  return new;
end $$;
drop trigger if exists crm_orders_guard on public.crm_orders;
create trigger crm_orders_guard before insert or update on public.crm_orders for each row execute function public.crm_orders_guard();

create or replace function public.crm_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.created_at := old.created_at; return new; end $$;
drop trigger if exists crm_customers_touch on public.crm_customers;
create trigger crm_customers_touch before update on public.crm_customers for each row execute function public.crm_touch();

-- ---------------------------------------------------------------------
-- 4. Lịch lắp đặt — tự tạo việc trong VietK Checklist cho từng kỹ thuật viên
-- ---------------------------------------------------------------------
create table if not exists public.crm_installs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.crm_orders (id) on delete cascade,
  date date not null,
  "time" text,
  tech_ids uuid[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'issue', 'cancelled')),
  checklist jsonb not null default '{}'::jsonb,   -- {buoc: true}
  note text,
  issue text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_installs_date on public.crm_installs (date);

-- cl_tasks: thêm nguồn 'crm' + liên kết lịch lắp
alter table public.cl_tasks add column if not exists crm_install_id uuid references public.crm_installs (id) on delete cascade;
alter table public.cl_tasks drop constraint if exists cl_tasks_source_check;
alter table public.cl_tasks add constraint cl_tasks_source_check check (source in ('routine', 'meeting', 'adhoc', 'assigned', 'plan', 'crm'));

-- Nhân viên không tự sửa tên / ngày của việc lắp đặt (giống việc được giao)
create or replace function public.cl_tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.created_at := old.created_at;
    if auth.uid() is not null and not public.cl_can_manage(old.owner_id) and pg_trigger_depth() = 1 then
      new.owner_id := old.owner_id; new.source := old.source; new.assigned_by := old.assigned_by;
      new.routine_id := old.routine_id; new.scope := old.scope; new.hidden := old.hidden; new.crm_install_id := old.crm_install_id;
      if old.source in ('routine', 'meeting', 'assigned', 'crm') then new.title := old.title; new.date := old.date; end if;
    end if;
  elsif auth.uid() is not null and new.owner_id = auth.uid() and not public.cl_is_admin() and pg_trigger_depth() = 1 then
    if new.source in ('assigned', 'crm') then new.source := 'adhoc'; new.assigned_by := null; new.crm_install_id := null; end if;
    new.hidden := false;
  end if;
  if new.scope = 'private' and (new.source in ('assigned', 'crm') or new.owner_id <> coalesce(auth.uid(), new.owner_id)) then
    raise exception 'Việc riêng chỉ chủ tài khoản tự tạo';
  end if;
  return new;
end $$;

create or replace function public.crm_installs_stamp() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists crm_installs_stamp on public.crm_installs;
create trigger crm_installs_stamp before insert or update on public.crm_installs for each row execute function public.crm_installs_stamp();

-- Sau khi lưu lịch lắp: tạo / cập nhật / xoá việc của từng kỹ thuật viên + đổi trạng thái đơn
create or replace function public.crm_installs_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o record; c record; t uuid; ttl text; items text; info text;
begin
  select * into o from public.crm_orders where id = new.order_id;
  select * into c from public.crm_customers where id = o.customer_id;
  delete from public.cl_tasks where crm_install_id = new.id and (new.status = 'cancelled' or not (owner_id = any (new.tech_ids)));
  if new.status <> 'cancelled' then
    select string_agg(i.name || ' x' || trim(to_char(i.qty, 'FM999990.##')), ', ' order by i.sort) into items
      from public.crm_order_items i where i.order_id = o.id;
    ttl := '🛠 Lắp đặt ' || o.code || ' — ' || c.name || coalesce(' · ' || coalesce(o.address, c.address), '');
    info := 'SĐT khách: ' || coalesce(c.phone, '—') || chr(10) || 'Hàng: ' || coalesce(items, '—') || coalesce(chr(10) || new.note, '');
    foreach t in array new.tech_ids loop
      if exists (select 1 from public.cl_tasks where crm_install_id = new.id and owner_id = t) then
        update public.cl_tasks set title = ttl, date = new.date, "time" = new."time", due_date = new.date,
          status = case when new.status = 'done' then 'done' when status = 'done' then 'todo' else status end
        where crm_install_id = new.id and owner_id = t
          and (title, date, coalesce("time", ''), status = 'done') is distinct from (ttl, new.date, coalesce(new."time", ''), new.status = 'done');
      elsif exists (select 1 from public.cl_members where id = t) then
        insert into public.cl_tasks (owner_id, title, date, "time", due_date, source, priority, status, note, assigned_by, crm_install_id)
        values (t, ttl, new.date, new."time", new.date, 'crm', 'high', case when new.status = 'done' then 'done' else 'todo' end, info, auth.uid(), new.id);
      end if;
    end loop;
  end if;
  if new.status = 'done' and o.status in ('confirmed', 'scheduled') then
    update public.crm_orders set status = 'installed' where id = o.id;
  elsif new.status = 'scheduled' and o.status = 'confirmed' then
    update public.crm_orders set status = 'scheduled' where id = o.id;
  end if;
  return null;
end $$;
drop trigger if exists crm_installs_sync on public.crm_installs;
create trigger crm_installs_sync after insert or update on public.crm_installs for each row execute function public.crm_installs_sync();

-- Kỹ thuật viên bấm "Xong" việc lắp đặt bên Checklist → lịch lắp hoàn thành
create or replace function public.crm_task_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.crm_install_id is not null and new.status = 'done' and old.status is distinct from 'done' then
    update public.crm_installs set status = 'done', note = coalesce(nullif(new.note, old.note), note)
      where id = new.crm_install_id and status in ('scheduled', 'issue');
  elsif new.crm_install_id is not null and new.status = 'blocked' and old.status is distinct from 'blocked' then
    update public.crm_installs set status = 'issue', issue = coalesce(new.block_reason, 'Vướng khi lắp đặt')
      where id = new.crm_install_id and status = 'scheduled';
  end if;
  return null;
end $$;
drop trigger if exists crm_task_done on public.cl_tasks;
create trigger crm_task_done after update on public.cl_tasks for each row execute function public.crm_task_done();

-- ---------------------------------------------------------------------
-- 5. Ai thấy gì
--   Quản trị: tất cả. Quản lý: khách của mình + của nhóm + khách chưa ai nhận.
--   Nhân viên: khách của mình + khách chưa ai nhận + khách có lịch lắp giao cho mình.
--   Giá vốn: chỉ Quản trị.
-- ---------------------------------------------------------------------
create or replace function public.crm_can_see_customer(p_owner uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.crm_user() and (
    public.cl_is_admin() or p_owner is null or p_owner = auth.uid() or public.cl_can_manage(p_owner)
    or exists (select 1 from public.crm_orders o join public.crm_installs i on i.order_id = o.id
               where o.customer_id = p_id and auth.uid() = any (i.tech_ids)))
$$;
create or replace function public.crm_can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_orders o join public.crm_customers c on c.id = o.customer_id
                 where o.id = p_order and public.crm_can_see_customer(c.owner_id, c.id))
$$;

-- Tra trùng số điện thoại trên toàn công ty (chỉ trả tên người phụ trách, không lộ dữ liệu khách)
create or replace function public.crm_phone_owner(p_phone text) returns table (customer_name text, owner_name text, status text)
language sql stable security definer set search_path = public as $$
  select c.name, m.full_name, c.status from public.crm_customers c left join public.cl_members m on m.id = c.owner_id
  where public.crm_user() and length(regexp_replace(p_phone, '\D', '', 'g')) >= 9
    and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  limit 3
$$;
grant execute on function public.crm_phone_owner(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['crm_products','crm_product_costs','crm_combos','crm_customers','crm_activities','crm_orders',
                           'crm_order_items','crm_payments','crm_installs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  for t in select format('drop policy if exists %I on public.%I', policyname, tablename) from pg_policies
           where schemaname = 'public' and tablename like 'crm\_%' loop
    execute t;
  end loop;
end $$;

-- Sản phẩm & combo: ai dùng CRM cũng xem, Quản trị sửa
create policy crm_products_select on public.crm_products for select to authenticated using (public.crm_user());
create policy crm_products_admin on public.crm_products for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
create policy crm_combos_select on public.crm_combos for select to authenticated using (public.crm_user());
create policy crm_combos_admin on public.crm_combos for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
create policy crm_product_costs_admin on public.crm_product_costs for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());

-- Khách hàng
create policy crm_customers_select on public.crm_customers for select to authenticated using (public.crm_can_see_customer(owner_id, id));
create policy crm_customers_insert on public.crm_customers for insert to authenticated
  with check (public.crm_user() and (owner_id is null or owner_id = auth.uid() or public.cl_can_manage(owner_id)));
create policy crm_customers_update on public.crm_customers for update to authenticated
  using (public.crm_can_see_customer(owner_id, id))
  with check (public.crm_user() and (owner_id is null or owner_id = auth.uid() or public.cl_can_manage(owner_id)
              or exists (select 1 from public.crm_orders o join public.crm_installs i on i.order_id = o.id where o.customer_id = crm_customers.id and auth.uid() = any (i.tech_ids))));
create policy crm_customers_delete on public.crm_customers for delete to authenticated using (public.cl_is_admin());

create policy crm_activities_select on public.crm_activities for select to authenticated
  using (exists (select 1 from public.crm_customers c where c.id = customer_id));
create policy crm_activities_insert on public.crm_activities for insert to authenticated
  with check (by_id = auth.uid() and exists (select 1 from public.crm_customers c where c.id = customer_id));
create policy crm_activities_delete on public.crm_activities for delete to authenticated using (by_id = auth.uid() or public.cl_is_admin());

-- Đơn hàng & phần con: theo quyền xem khách
create policy crm_orders_select on public.crm_orders for select to authenticated using (public.crm_can_see_order(id));
create policy crm_orders_insert on public.crm_orders for insert to authenticated
  with check (exists (select 1 from public.crm_customers c where c.id = customer_id));
create policy crm_orders_update on public.crm_orders for update to authenticated using (public.crm_can_see_order(id))
  with check (exists (select 1 from public.crm_customers c where c.id = customer_id));
create policy crm_orders_delete on public.crm_orders for delete to authenticated using (public.cl_is_admin() or (status = 'quote' and owner_id = auth.uid()));
do $$
declare t text;
begin
  foreach t in array array['crm_order_items','crm_payments','crm_installs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_can_see_order(order_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.crm_can_see_order(order_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.crm_can_see_order(order_id)) with check (public.crm_can_see_order(order_id))', t || '_update', t);
  end loop;
end $$;
create policy crm_order_items_delete on public.crm_order_items for delete to authenticated using (public.crm_can_see_order(order_id));
create policy crm_payments_delete on public.crm_payments for delete to authenticated using (public.cl_is_admin());
create policy crm_installs_delete on public.crm_installs for delete to authenticated using (public.cl_is_admin());

grant select, insert, update, delete on all tables in schema public to authenticated;
