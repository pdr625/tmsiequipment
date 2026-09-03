-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
-- supabase_functions_admin and supabase_storage_admin intentionally omitted:
-- this lean stack (db+auth+rest) never deploys Storage or Edge Functions, and
-- supabase_functions_admin only gets created lazily by an event trigger tied to
-- "CREATE EXTENSION pg_net" — a statement no file in this image's init pipeline
-- (init-scripts/ nor migrations/) actually issues, so the role never exists here.
