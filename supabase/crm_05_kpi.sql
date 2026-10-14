-- =====================================================================
-- VietK CRM — bổ sung 05: KPI bên Checklist tự tính từ số liệu CRM
-- cl_kpis.crm_metric = loại số liệu CRM; app Checklist cộng theo chu kỳ KPI (tuần / tháng / quý).
-- Chạy lại nhiều lần an toàn.
-- =====================================================================
alter table public.cl_kpis add column if not exists crm_metric text;
alter table public.cl_kpis drop constraint if exists cl_kpis_crm_metric_check;
alter table public.cl_kpis add constraint cl_kpis_crm_metric_check
  check (crm_metric is null or crm_metric in ('leads', 'quotes', 'orders', 'revenue_m', 'collected_m', 'installs', 'close_rate'));

-- Số liệu CRM theo người / ngày (giờ Việt Nam). Chỉ trả về người mà người gọi được xem:
-- chính mình; Quản trị & Chỉ xem: tất cả; Quản lý nhóm: người trong nhóm.
--   leads       : khách mới do người đó phụ trách (theo ngày tạo khách)
--   leads_won   : trong số khách mới đó, khách đã chốt (để tính tỉ lệ chốt)
--   quotes      : báo giá / đơn tạo mới
--   orders      : đơn chốt (theo ngày chốt)
--   revenue_m   : doanh số đơn chốt, triệu đồng
--   collected_m : tiền khách đã trả cho đơn của người đó, triệu đồng
--   installs    : lịch lắp đặt hoàn thành (tính cho từng kỹ thuật viên)
create or replace function public.crm_kpi_daily(p_since date) returns table (person_id uuid, day date, metric text, value numeric)
language sql stable security definer set search_path = public as $$
  with vis as (
    select m.id from public.cl_members m
    where m.id = auth.uid() or public.cl_is_viewer() or public.cl_can_manage(m.id)
  ),
  tz as (select 'Asia/Ho_Chi_Minh'::text z)
  select owner_id, (created_at at time zone (select z from tz))::date, 'leads', count(*)::numeric
    from public.crm_customers where owner_id in (select id from vis) and created_at >= p_since group by 1, 2
  union all
  select owner_id, (created_at at time zone (select z from tz))::date, 'leads_won', count(*)::numeric
    from public.crm_customers where owner_id in (select id from vis) and created_at >= p_since and status = 'won' group by 1, 2
  union all
  select owner_id, (created_at at time zone (select z from tz))::date, 'quotes', count(*)::numeric
    from public.crm_orders where owner_id in (select id from vis) and created_at >= p_since group by 1, 2
  union all
  select owner_id, (confirmed_at at time zone (select z from tz))::date, 'orders', count(*)::numeric
    from public.crm_orders where owner_id in (select id from vis) and confirmed_at >= p_since and status not in ('quote', 'cancelled') group by 1, 2
  union all
  select owner_id, (confirmed_at at time zone (select z from tz))::date, 'revenue_m', round(sum(total) / 1000000.0, 2)
    from public.crm_orders where owner_id in (select id from vis) and confirmed_at >= p_since and status not in ('quote', 'cancelled') group by 1, 2
  union all
  select o.owner_id, p.paid_at, 'collected_m', round(sum(p.amount) / 1000000.0, 2)
    from public.crm_payments p join public.crm_orders o on o.id = p.order_id
    where o.owner_id in (select id from vis) and p.paid_at >= p_since and o.status <> 'cancelled' group by 1, 2
  union all
  select t.tech, (i.done_at at time zone (select z from tz))::date, 'installs', count(*)::numeric
    from public.crm_installs i cross join lateral unnest(i.tech_ids) as t(tech)
    where i.status = 'done' and i.done_at >= p_since and t.tech in (select id from vis) group by 1, 2
$$;
revoke execute on function public.crm_kpi_daily(date) from public, anon;
grant execute on function public.crm_kpi_daily(date) to authenticated;

-- KPI đã tạo từ mẫu gợi ý → gắn sẵn nguồn CRM
update public.cl_kpis set crm_metric = case key
    when 'leads' then 'leads' when 'quotes_sent' then 'quotes' when 'orders' then 'orders' when 'revenue' then 'revenue_m'
    when 'close_rate' then 'close_rate' when 'installs' then 'installs' when 'collected' then 'collected_m' end
  where crm_metric is null and key in ('leads', 'quotes_sent', 'orders', 'revenue', 'close_rate', 'installs', 'collected');

-- Dùng cho trợ lý AI (máy chủ, service role): giá trị 1 KPI CRM của 1 người trong khoảng ngày
create or replace function public.crm_kpi_value(p_person uuid, p_metric text, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = public as $$
  with z as (select 'Asia/Ho_Chi_Minh'::text z),
  v as (
    select case p_metric
      when 'leads' then (select count(*)::numeric from crm_customers where owner_id = p_person and (created_at at time zone (select z from z))::date between p_from and p_to)
      when 'quotes' then (select count(*)::numeric from crm_orders where owner_id = p_person and (created_at at time zone (select z from z))::date between p_from and p_to)
      when 'orders' then (select count(*)::numeric from crm_orders where owner_id = p_person and status not in ('quote', 'cancelled') and (confirmed_at at time zone (select z from z))::date between p_from and p_to)
      when 'revenue_m' then (select coalesce(round(sum(total) / 1000000.0, 1), 0) from crm_orders where owner_id = p_person and status not in ('quote', 'cancelled') and (confirmed_at at time zone (select z from z))::date between p_from and p_to)
      when 'collected_m' then (select coalesce(round(sum(p.amount) / 1000000.0, 1), 0) from crm_payments p join crm_orders o on o.id = p.order_id where o.owner_id = p_person and o.status <> 'cancelled' and p.paid_at between p_from and p_to)
      when 'installs' then (select count(*)::numeric from crm_installs where status = 'done' and p_person = any (tech_ids) and (done_at at time zone (select z from z))::date between p_from and p_to)
      when 'close_rate' then (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'won') / count(*)) end from crm_customers where owner_id = p_person and (created_at at time zone (select z from z))::date between p_from and p_to)
    end as val
  )
  select coalesce(val, 0) from v
$$;
revoke execute on function public.crm_kpi_value(uuid, text, date, date) from public, anon, authenticated;
grant execute on function public.crm_kpi_value(uuid, text, date, date) to service_role;
