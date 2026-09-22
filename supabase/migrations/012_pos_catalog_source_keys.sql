-- Stable source keys allow ReMaPro Hub to publish/update POS catalog items
-- without deleting historical catalog references.
alter table public.pos_catalog_items add column if not exists source_key text;
create unique index if not exists pos_catalog_items_restaurant_source_key_uq
  on public.pos_catalog_items(restaurant_id,source_key);
create index if not exists pos_catalog_items_source_key_idx
  on public.pos_catalog_items(source_key);
