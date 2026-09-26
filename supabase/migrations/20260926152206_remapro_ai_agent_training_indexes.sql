create index if not exists ai_agent_profiles_updated_by_idx on public.ai_agent_profiles(updated_by) where updated_by is not null;
create index if not exists ai_agent_sessions_agent_role_idx on public.ai_agent_sessions(agent_role);
create index if not exists ai_knowledge_created_by_idx on public.ai_knowledge_documents(created_by) where created_by is not null;
create index if not exists ai_knowledge_updated_by_idx on public.ai_knowledge_documents(updated_by) where updated_by is not null;
create index if not exists ai_training_created_by_idx on public.ai_training_cases(created_by) where created_by is not null;
create index if not exists ai_knowledge_embedding_hnsw on public.ai_knowledge_documents using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null and status='active';
