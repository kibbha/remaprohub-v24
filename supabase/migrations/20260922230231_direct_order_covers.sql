alter table public.direct_orders add column if not exists covers integer not null default 1 check (covers >= 0 and covers <= 100);
