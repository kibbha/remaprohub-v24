-- ReMaPro Hub multi-photo AI delivery receiving.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-ai-temp','delivery-ai-temp',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,updated_at=now();

create table if not exists public.delivery_ai_analyses(
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'created' check(status in ('created','analyzing','review','validated','cancelled','failed')),
  photo_count integer not null default 0 check(photo_count between 0 and 12),
  photo_hashes text[] not null default '{}'::text[],
  model text,
  original_result jsonb,
  corrected_result jsonb,
  error text,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  validated_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists delivery_ai_analyses_restaurant_created_idx on public.delivery_ai_analyses(restaurant_id,created_at desc);
create index if not exists delivery_ai_analyses_actor_idx on public.delivery_ai_analyses(actor_user_id);

create table if not exists public.delivery_ai_analysis_events(
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.delivery_ai_analyses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check(event_type in ('created','analysis_started','analysis_completed','analysis_failed','review_saved','validated','cancelled','images_deleted')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists delivery_ai_events_analysis_idx on public.delivery_ai_analysis_events(analysis_id,created_at);
create index if not exists delivery_ai_events_restaurant_idx on public.delivery_ai_analysis_events(restaurant_id,created_at desc);
create index if not exists delivery_ai_events_actor_idx on public.delivery_ai_analysis_events(actor_user_id);

alter table public.delivery_ai_analyses enable row level security;
alter table public.delivery_ai_analysis_events enable row level security;
revoke all on public.delivery_ai_analyses from anon;
revoke all on public.delivery_ai_analysis_events from anon;
revoke insert,update,delete on public.delivery_ai_analyses from authenticated;
revoke insert,update,delete on public.delivery_ai_analysis_events from authenticated;
grant select on public.delivery_ai_analyses to authenticated;
grant select on public.delivery_ai_analysis_events to authenticated;

drop policy if exists delivery_ai_analyses_select on public.delivery_ai_analyses;
create policy delivery_ai_analyses_select on public.delivery_ai_analyses for select to authenticated using (public.is_restaurant_member(restaurant_id));
drop policy if exists delivery_ai_events_select on public.delivery_ai_analysis_events;
create policy delivery_ai_events_select on public.delivery_ai_analysis_events for select to authenticated using (public.is_restaurant_member(restaurant_id));

drop policy if exists delivery_ai_temp_insert on storage.objects;
create policy delivery_ai_temp_insert on storage.objects for insert to authenticated with check (
  bucket_id='delivery-ai-temp' and case
    when coalesce((storage.foldername(name))[1],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_restaurant_member(((storage.foldername(name))[1])::uuid) else false end
);
drop policy if exists delivery_ai_temp_select on storage.objects;
create policy delivery_ai_temp_select on storage.objects for select to authenticated using (
  bucket_id='delivery-ai-temp' and case
    when coalesce((storage.foldername(name))[1],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_restaurant_member(((storage.foldername(name))[1])::uuid) else false end
);
drop policy if exists delivery_ai_temp_delete on storage.objects;
create policy delivery_ai_temp_delete on storage.objects for delete to authenticated using (
  bucket_id='delivery-ai-temp' and case
    when coalesce((storage.foldername(name))[1],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_restaurant_member(((storage.foldername(name))[1])::uuid) else false end
);

drop policy if exists delivery_ai_temp_update on storage.objects;
create policy delivery_ai_temp_update on storage.objects for update to authenticated
using (
  bucket_id='delivery-ai-temp' and case
    when coalesce((storage.foldername(name))[1],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_restaurant_member(((storage.foldername(name))[1])::uuid) else false end
)
with check (
  bucket_id='delivery-ai-temp' and case
    when coalesce((storage.foldername(name))[1],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.is_restaurant_member(((storage.foldername(name))[1])::uuid) else false end
);
