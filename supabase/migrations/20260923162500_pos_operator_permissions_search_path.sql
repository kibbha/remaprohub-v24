-- Security hardening: immutable helper must use an explicit search_path.
alter function public.pos_operator_default_permissions(text)
  set search_path = pg_catalog;
