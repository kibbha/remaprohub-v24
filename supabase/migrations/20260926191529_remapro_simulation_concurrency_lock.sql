create unique index if not exists ai_simulation_one_running_per_campaign_idx
on public.ai_simulation_runs(campaign_id)
where status='running';
