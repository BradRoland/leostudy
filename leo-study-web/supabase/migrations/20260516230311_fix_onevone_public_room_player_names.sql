-- Supabase migration history alignment.
-- The public room player-label function is finalized in the next migration.

select pg_notify('pgrst', 'reload schema');
