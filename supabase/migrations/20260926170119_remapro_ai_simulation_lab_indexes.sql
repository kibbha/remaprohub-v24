create index if not exists ai_sim_campaign_created_by_idx on public.ai_simulation_campaigns(created_by) where created_by is not null;
create index if not exists ai_sim_finding_run_idx on public.ai_simulation_findings(run_id);
create index if not exists ai_sim_finding_scenario_idx on public.ai_simulation_findings(scenario_id);
