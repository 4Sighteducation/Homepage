create table if not exists public.staff_admin_cache (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists staff_admin_cache_updated_at_idx
  on public.staff_admin_cache (updated_at desc);
