-- Cover foreign-key lookups flagged by the live database advisor.
-- All target tables are currently small; indexes are additive and safe to rerun.
create index if not exists fkidx_advice_sheets_1tewprx
  on public.advice_sheets (created_by);

create index if not exists fkidx_advice_sheets_72054
  on public.advice_sheets (organization_id);

create index if not exists fkidx_advice_sheets_7p3fqg
  on public.advice_sheets (restaurant_id);

create index if not exists fkidx_audit_logs_17k48my
  on public.audit_logs (actor_user_id);

create index if not exists fkidx_audit_logs_r6qncg
  on public.audit_logs (target_user_id);

create index if not exists fkidx_direct_order_channels_1kjwubj
  on public.direct_order_channels (created_by);

create index if not exists fkidx_direct_order_channels_1hqm9z2
  on public.direct_order_channels (organization_id);

create index if not exists fkidx_direct_order_channels_1p60odm
  on public.direct_order_channels (restaurant_id);

create index if not exists fkidx_direct_order_events_ozbi7n
  on public.direct_order_events (actor_user_id);

create index if not exists fkidx_direct_order_items_axwsdy
  on public.direct_order_items (catalog_item_id);

create index if not exists fkidx_direct_orders_1u85gk
  on public.direct_orders (accepted_by);

create index if not exists fkidx_direct_orders_1vxynga
  on public.direct_orders (organization_id);

create index if not exists fkidx_direct_orders_1h20rvu
  on public.direct_orders (pos_order_id);

create index if not exists fkidx_documents_v7icfm
  on public.documents (created_by);

create index if not exists fkidx_documents_1rdhrpt
  on public.documents (organization_id);

create index if not exists fkidx_employees_13ktsfo
  on public.employees (organization_id);

create index if not exists fkidx_employees_1ueownc
  on public.employees (user_id);

create index if not exists fkidx_migration_batches_1ojgbmx
  on public.migration_batches (imported_by);

create index if not exists fkidx_migration_batches_mg9j02
  on public.migration_batches (organization_id);

create index if not exists fkidx_payroll_records_udkbgf
  on public.payroll_records (organization_id);

create index if not exists fkidx_payroll_records_i396mf
  on public.payroll_records (restaurant_id);

create index if not exists fkidx_pos_inventory_movements_17if0r4
  on public.pos_inventory_movements (acknowledged_by);

create index if not exists fkidx_pos_inventory_movements_i3a2xn
  on public.pos_inventory_movements (catalog_item_id);

create index if not exists fkidx_pos_inventory_movements_mdn9sr
  on public.pos_inventory_movements (organization_id);

create index if not exists fkidx_pos_item_availability_ceficx
  on public.pos_item_availability (organization_id);

create index if not exists fkidx_pos_layout_drafts_183atfh
  on public.pos_layout_drafts (organization_id);

create index if not exists fkidx_pos_layout_drafts_1xiiiqx
  on public.pos_layout_drafts (updated_by);

create index if not exists fkidx_pos_layout_versions_ccduxu
  on public.pos_layout_versions (organization_id);

create index if not exists fkidx_pos_layout_versions_k203t9
  on public.pos_layout_versions (published_by);

create index if not exists fkidx_pos_operator_audit_1fo5fnd
  on public.pos_operator_audit (device_id);

create index if not exists fkidx_pos_operator_audit_wtwnw
  on public.pos_operator_audit (organization_id);

create index if not exists fkidx_pos_operator_sessions_p2j4up
  on public.pos_operator_sessions (device_id);

create index if not exists fkidx_pos_operator_sessions_12gw8ic
  on public.pos_operator_sessions (organization_id);

create index if not exists fkidx_pos_operators_np65r4
  on public.pos_operators (created_by);

create index if not exists fkidx_pos_operators_1uncoto
  on public.pos_operators (employee_id);

create index if not exists fkidx_pos_operators_aneoob
  on public.pos_operators (organization_id);

create index if not exists fkidx_pos_operators_1axwywz
  on public.pos_operators (updated_by);

create index if not exists fkidx_pos_order_table_links_18nmqj4
  on public.pos_order_table_links (created_by);

create index if not exists fkidx_pos_order_table_links_rt7diz
  on public.pos_order_table_links (organization_id);

create index if not exists fkidx_pos_payment_allocations_kf4v7q
  on public.pos_payment_allocations (organization_id);

create index if not exists fkidx_pos_payment_intents_cbvxu9
  on public.pos_payment_intents (cash_session_id);

create index if not exists fkidx_pos_payment_intents_1jtrjai
  on public.pos_payment_intents (completed_by);

create index if not exists fkidx_pos_payment_intents_pu4lej
  on public.pos_payment_intents (created_by);

create index if not exists fkidx_pos_payment_intents_1dhxajf
  on public.pos_payment_intents (device_id);

create index if not exists fkidx_pos_payment_intents_1qx1k22
  on public.pos_payment_intents (organization_id);

create index if not exists fkidx_pos_payment_intents_17wr31d
  on public.pos_payment_intents (payment_id);

create index if not exists fkidx_pos_payment_intents_g007dq
  on public.pos_payment_intents (restaurant_id);

create index if not exists fkidx_pos_payment_terminals_151soah
  on public.pos_payment_terminals (created_by);

create index if not exists fkidx_pos_payment_terminals_tb0kyc
  on public.pos_payment_terminals (organization_id);

create index if not exists fkidx_pos_payment_terminals_8rbhxu
  on public.pos_payment_terminals (updated_by);

create index if not exists fkidx_pos_printers_1k945yc
  on public.pos_printers (created_by);

create index if not exists fkidx_pos_printers_1n40tyn
  on public.pos_printers (organization_id);

create index if not exists fkidx_pos_printers_htb94v
  on public.pos_printers (updated_by);

create index if not exists fkidx_pos_provider_connections_1t0pceu
  on public.pos_provider_connections (created_by);

create index if not exists fkidx_pos_provider_connections_irh73p
  on public.pos_provider_connections (organization_id);

create index if not exists fkidx_pos_provider_connections_1vg224h
  on public.pos_provider_connections (updated_by);

create index if not exists fkidx_recipe_ingredients_167fklu
  on public.recipe_ingredients (ingredient_id);

create index if not exists fkidx_recipes_11nnhdb
  on public.recipes (created_by);

create index if not exists fkidx_recipes_mfsbiy
  on public.recipes (restaurant_id);

create index if not exists fkidx_restaurant_workspaces_14sgr4p
  on public.restaurant_workspaces (updated_by);

create index if not exists fkidx_sales_daily_94dboe
  on public.sales_daily (created_by);

create index if not exists fkidx_sales_daily_15ire3h
  on public.sales_daily (organization_id);

create index if not exists fkidx_subscription_events_hau9dm
  on public.subscription_events (organization_id);

create index if not exists fkidx_subscriptions_1ha9h8t
  on public.subscriptions (plan_id);

create index if not exists fkidx_temperature_logs_1joj581
  on public.temperature_logs (organization_id);

create index if not exists fkidx_temperature_logs_1mwl7he
  on public.temperature_logs (recorded_by);
