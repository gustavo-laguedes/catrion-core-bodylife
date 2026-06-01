-- Body Life: pre-audit and cleanup proposal.
-- IMPORTANT: review the audit result before running the cleanup transaction.
-- This file has not been executed.

-- ============================================================
-- 1. ADMINISTRATIVE PRE-AUDIT (READ ONLY)
-- ============================================================

select 'products' as table_name, count(*) as row_count from public.products
union all select 'sales', count(*) from public.sales
union all select 'sale_items', count(*) from public.sale_items
union all select 'stock_moves', count(*) from public.stock_moves
union all select 'cash_sessions', count(*) from public.cash_sessions
union all select 'cash_events', count(*) from public.cash_events
union all select 'customers', count(*) from public.customers
union all select 'coupons', count(*) from public.coupons
union all select 'ap_payables', count(*) from public.ap_payables
union all select 'ap_categories', count(*) from public.ap_categories
union all select 'machines', count(*) from public.machines
union all select 'product_taxonomies', count(*) from public.product_taxonomies
order by table_name;

select id, name, created_at
from public.tenants
order by created_at, id;

select
  m.id as membership_id,
  u.email,
  m.role,
  m.tenant_id,
  m.user_id,
  m.created_at
from public.memberships m
left join auth.users u on u.id = m.user_id
order by u.email nulls last, m.tenant_id, m.role;

select tenant_id, module_id, status, starts_at, ends_at, created_at
from public.tenant_modules
order by tenant_id, module_id;

-- Review foreign keys before cleanup. This helps detect additional tables
-- that must be handled before duplicate tenants can be removed.
select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and (
    ccu.table_name in ('tenants', 'profiles', 'memberships')
    or tc.table_name in (
      'products', 'sales', 'sale_items', 'stock_moves',
      'cash_sessions', 'cash_events', 'customers', 'coupons',
      'ap_payables', 'ap_categories', 'machines', 'product_taxonomies',
      'tenant_modules'
    )
  )
order by tc.table_name, kcu.column_name;

-- ============================================================
-- 2. CLEANUP PROPOSAL (DO NOT RUN WITHOUT EXPLICIT CONFIRMATION)
-- ============================================================

begin;

do $$
begin
  if not exists (
    select 1
    from public.tenants
    where id = '11111111-1111-1111-1111-111111111111'::uuid
  ) then
    raise exception 'Main Body Life tenant is missing. Cleanup aborted.';
  end if;
end
$$;

-- Preserve access modules on the main tenant before duplicate tenants
-- and their module links are removed.
insert into public.tenant_modules (
  tenant_id,
  module_id,
  status,
  starts_at,
  ends_at
)
select distinct on (tm.module_id)
  '11111111-1111-1111-1111-111111111111'::uuid,
  tm.module_id,
  tm.status,
  tm.starts_at,
  tm.ends_at
from public.tenant_modules tm
where tm.tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid
  and not exists (
    select 1
    from public.tenant_modules main_tm
    where main_tm.tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
      and main_tm.module_id = tm.module_id
  )
order by tm.module_id, (tm.status = 'active') desc, tm.created_at desc;

-- Operational/test data: delete children before parents.
delete from public.cash_events;
delete from public.cash_sessions;
delete from public.sale_items;
delete from public.stock_moves;
delete from public.sales;
delete from public.customers;
delete from public.coupons;
delete from public.products;
delete from public.ap_payables;
delete from public.ap_categories;
delete from public.machines;
delete from public.product_taxonomies;

-- Preserve only memberships and tenant_modules belonging to the main tenant.
delete from public.memberships
where tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid;

delete from public.tenant_modules
where tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid;

-- Remove duplicate tenants only after dependent tenant links are removed.
delete from public.tenants
where id <> '11111111-1111-1111-1111-111111111111'::uuid;

-- Post-cleanup checks run inside the transaction.
select 'products' as table_name, count(*) as row_count from public.products
union all select 'sales', count(*) from public.sales
union all select 'sale_items', count(*) from public.sale_items
union all select 'stock_moves', count(*) from public.stock_moves
union all select 'cash_sessions', count(*) from public.cash_sessions
union all select 'cash_events', count(*) from public.cash_events
union all select 'customers', count(*) from public.customers
union all select 'coupons', count(*) from public.coupons
union all select 'ap_payables', count(*) from public.ap_payables
union all select 'ap_categories', count(*) from public.ap_categories
union all select 'machines', count(*) from public.machines
union all select 'product_taxonomies', count(*) from public.product_taxonomies
order by table_name;

select id, name, created_at
from public.tenants
order by created_at, id;

select
  m.id as membership_id,
  u.email,
  m.role,
  m.tenant_id,
  m.user_id,
  m.created_at
from public.memberships m
left join auth.users u on u.id = m.user_id
order by u.email nulls last, m.tenant_id, m.role;

select tenant_id, module_id, status, starts_at, ends_at, created_at
from public.tenant_modules
order by tenant_id, module_id;

commit;
