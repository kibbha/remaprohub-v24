update public.ai_training_cases
set rubric=coalesce(rubric,'{}'::jsonb) || jsonb_build_object(
      'evaluation_scope','agent_role',
      'role_focus',coalesce(nullif(rubric->>'simulation_finding',''),'Retest the role-specific weakness promoted from Simulation Lab.')
    ),
    updated_at=now()
where category='simulation' and status='active';
