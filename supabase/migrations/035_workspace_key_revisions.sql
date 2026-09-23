alter table public.restaurant_workspaces
  add column if not exists key_revisions jsonb not null default '{}'::jsonb;

update public.restaurant_workspaces as rw
set key_revisions = coalesce(
  (
    select jsonb_object_agg(entry.key, to_jsonb(rw.revision))
    from jsonb_object_keys(coalesce(rw.data,'{}'::jsonb)) as entry(key)
  ),
  '{}'::jsonb
)
where coalesce(rw.key_revisions,'{}'::jsonb)='{}'::jsonb
  and coalesce(rw.data,'{}'::jsonb)<>'{}'::jsonb;

comment on column public.restaurant_workspaces.key_revisions is
  'Last workspace revision that modified each top-level key; used for non-overlapping optimistic merges.';
