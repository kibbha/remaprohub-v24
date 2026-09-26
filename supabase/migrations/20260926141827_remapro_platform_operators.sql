create table if not exists public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','support','developer','qa','release','product')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_operators enable row level security;
revoke all on public.platform_operators from anon, authenticated;
grant all on public.platform_operators to service_role;

drop policy if exists platform_operators_server_only on public.platform_operators;
create policy platform_operators_server_only on public.platform_operators
  for all to authenticated using (false) with check (false);
