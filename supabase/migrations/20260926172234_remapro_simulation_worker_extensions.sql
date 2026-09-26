create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The worker token itself is intentionally created/rotated operationally in Supabase Vault.
-- Git history contains no plaintext worker credential.
-- Cron is installed operationally after Vault secret provisioning.
