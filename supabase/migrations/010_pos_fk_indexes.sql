-- Cover POS foreign keys used by joins, RLS and reconciliation.
create index if not exists pos_devices_organization_idx on public.pos_devices(organization_id);
create index if not exists pos_devices_created_by_idx on public.pos_devices(created_by);
create index if not exists pos_catalog_items_organization_idx on public.pos_catalog_items(organization_id);
create index if not exists pos_cash_sessions_organization_idx on public.pos_cash_sessions(organization_id);
create index if not exists pos_cash_sessions_opened_by_idx on public.pos_cash_sessions(opened_by);
create index if not exists pos_cash_sessions_closed_by_idx on public.pos_cash_sessions(closed_by);
create index if not exists pos_orders_organization_idx on public.pos_orders(organization_id);
create index if not exists pos_orders_closed_by_idx on public.pos_orders(closed_by);
create index if not exists pos_event_log_organization_idx on public.pos_event_log(organization_id);
