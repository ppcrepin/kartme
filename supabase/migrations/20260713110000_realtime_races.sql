-- KartSquad — temps réel sur les courses (lot 1.4)
-- Publie les changements de la table races : quand l'admin valide le
-- classement, l'écran des participants bascule tout seul sur les résultats.
-- Sans effet sur un Postgres local sans publication supabase_realtime.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'races'
     ) then
    execute 'alter publication supabase_realtime add table public.races';
  end if;
end $$;
