alter table public.ai_engineering_jobs
  drop constraint if exists ai_engineering_jobs_status_check;

alter table public.ai_engineering_jobs
  add constraint ai_engineering_jobs_status_check check (status in (
    'queued','planning','awaiting_execution','executing','testing','pr_open',
    'awaiting_merge_approval','merge_approved','failed','completed','cancelled'
  ));
