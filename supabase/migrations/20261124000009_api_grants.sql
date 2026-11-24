-- Hosted Supabase does not apply the local CLI's default Data API grants.
-- Authenticated clients need table, sequence, and function privileges.
-- Row Level Security still decides which rows they can see or change.
-- The anon role stays revoked, matching migration 0007.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
