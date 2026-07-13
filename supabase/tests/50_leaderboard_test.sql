-- Tests des classements Amis / Global (lot 2.2). Transaction annulée.
--
-- Monde : A (moi, public 1000), B (ami public 1200), C (étranger public 1100),
-- D (étranger PRIVÉ 1500), E (amie PRIVÉE 900), F (public 1300 mais 0 course),
-- X (public 1050, a bloqué A **tout en restant son « ami » accepté** — le
-- blocage doit gagner), T1/T2 (publics, ex æquo à 1150), fantôme G (1400),
-- fantôme I (« Idle », 0 course), fantôme R (1600, RÉCLAMÉ par A).
-- Tous les inscrits sauf F ont couru.

begin;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.as_super() returns void language plpgsql as $$
begin
  reset role;
end $$;

create function tests.rows_as(p_uid uuid, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform tests.as_user(p_uid);
  execute p_sql into n;
  perform tests.as_super();
  return n;
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('a0000000-0000-0000-0000-00000000000b', 'b@t'),
  ('a0000000-0000-0000-0000-00000000000c', 'c@t'),
  ('a0000000-0000-0000-0000-00000000000d', 'd@t'),
  ('a0000000-0000-0000-0000-00000000000e', 'e@t'),
  ('a0000000-0000-0000-0000-00000000000f', 'f@t'),
  ('a0000000-0000-0000-0000-0000000000aa', 'x@t'),
  ('a0000000-0000-0000-0000-0000000000b1', 't1@t'),
  ('a0000000-0000-0000-0000-0000000000b2', 't2@t');

insert into public.profiles (id, username, elo, is_private) values
  ('a0000000-0000-0000-0000-00000000000a', 'Anna',   1000, false),
  ('a0000000-0000-0000-0000-00000000000b', 'Bob',    1200, false),
  ('a0000000-0000-0000-0000-00000000000c', 'Carl',   1100, false),
  ('a0000000-0000-0000-0000-00000000000d', 'Dora',   1500, true),
  ('a0000000-0000-0000-0000-00000000000e', 'Emma',    900, true),
  ('a0000000-0000-0000-0000-00000000000f', 'Fred',   1300, false),
  ('a0000000-0000-0000-0000-0000000000aa', 'Xavier', 1050, false),
  ('a0000000-0000-0000-0000-0000000000b1', 'Tara',   1150, false),
  ('a0000000-0000-0000-0000-0000000000b2', 'Tom',    1150, false);

insert into public.ghost_profiles (id, display_name, elo, created_by, claimed_by) values
  ('a0000000-0000-0000-0000-0000000000f0', 'Ghost', 1400, 'a0000000-0000-0000-0000-00000000000a', null),
  ('a0000000-0000-0000-0000-0000000000f1', 'Idle',  1450, 'a0000000-0000-0000-0000-00000000000a', null),
  ('a0000000-0000-0000-0000-0000000000f2', 'Claimed', 1600, 'a0000000-0000-0000-0000-00000000000b',
   'a0000000-0000-0000-0000-00000000000a');

-- Amitiés : A↔B et A↔E acceptées ; A→C seulement en attente (ne compte pas) ;
-- A↔X acceptée MAIS X a bloqué A → le blocage doit primer sur l'amitié.
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b', 'accepted'),
  ('a0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000a', 'accepted'),
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000c', 'pending'),
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000aa', 'accepted');

insert into public.blocks (blocker_id, blocked_id) values
  ('a0000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a');

-- Une course passée pour porter l'historique (insertion directe en super :
-- le moteur Elo est déjà testé par 20_elo_test, ici on teste la VISIBILITÉ).
insert into public.races (id, admin_id, scheduled_at, status) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-00000000000a', now() - interval '1 day', 'completed');

insert into public.elo_history (profile_id, ghost_id, race_id, elo, delta)
select p, null, 'a0000000-0000-0000-0000-0000000000c1', 1000, 0
from unnest(array[
  'a0000000-0000-0000-0000-00000000000a',
  'a0000000-0000-0000-0000-00000000000b',
  'a0000000-0000-0000-0000-00000000000c',
  'a0000000-0000-0000-0000-00000000000d',
  'a0000000-0000-0000-0000-00000000000e',
  'a0000000-0000-0000-0000-0000000000aa',
  'a0000000-0000-0000-0000-0000000000b1',
  'a0000000-0000-0000-0000-0000000000b2'
]::uuid[]) as u(p);

-- Historique des fantômes : G (classé) et R (réclamé) — « Idle » n'a rien.
insert into public.elo_history (profile_id, ghost_id, race_id, elo, delta) values
  (null, 'a0000000-0000-0000-0000-0000000000f0', 'a0000000-0000-0000-0000-0000000000c1', 1400, 0),
  (null, 'a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-0000000000c1', 1600, 0);

-- ═══ Scénario 1 : classement Amis (moi + amis, sans fantômes ni étrangers) ═══
do $$
declare A uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('friends', 100, 0) $q$),
                   3, 'Amis : 3 classés (moi, Bob, Emma)');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('friends', 100, 0) where username = 'Bob' $q$),
                   1, 'Amis : Bob (1200) est 1er');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('friends', 100, 0) where is_me $q$),
                   2, 'Amis : moi (1000) 2e');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('friends', 100, 0) where username = 'Emma' $q$),
                   3, 'Amis : Emma (privée mais amie, 900) 3e');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('friends', 100, 0) where ghost_id is not null $q$),
                   0, 'Amis : aucun fantôme (B1)');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('friends', 100, 0) where username in ('Carl', 'Dora') $q$),
                   0, 'Amis : ni étranger ni demande en attente');
  -- X est « ami accepté » mais m'a bloquée : le blocage prime sur l'amitié.
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('friends', 100, 0) where username = 'Xavier' $q$),
                   0, 'Amis : ami-mais-bloqueur masqué');
  raise notice 'Scénario 1 (classement Amis) ✔';
end $$;

-- ═══ Scénario 2 : classement Global (publics + amis ; fantômes EXCLUS) ═══
-- Depuis la refonte anti-triche, les fantômes n'ont plus d'Elo compétitif et
-- ne figurent plus au classement (décision A du 2026-07-13).
do $$
declare A uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) $q$),
                   6, 'Global : 6 classés (Bob, Tara, Tom, Carl, moi, Emma)');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where ghost_id is not null $q$),
                   0, 'Global : aucun fantôme (Elo non compétitif)');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('global', 100, 0) where username = 'Bob' $q$),
                   1, 'Global : Bob (1200) est 1er');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('global', 100, 0) where is_me $q$),
                   5, 'Global : moi 5e');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Dora' $q$),
                   0, 'Global : Dora (privée non-amie) invisible (A6)');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Emma' $q$),
                   1, 'Global : Emma (privée mais amie) visible');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Xavier' $q$),
                   0, 'Global : Xavier (m''a bloquée) invisible');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Fred' $q$),
                   0, 'Global : Fred (0 course) non classé');
  raise notice 'Scénario 2 (classement Global) ✔';
end $$;

-- ═══ Scénario 3 : ex æquo — même Elo, même rang (rank(), pas d'ordre inventé) ═══
do $$
declare A uuid := 'a0000000-0000-0000-0000-00000000000a';
begin
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('global', 100, 0) where username = 'Tara' $q$),
                   2, 'Ex æquo : Tara (1150) 2e');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('global', 100, 0) where username = 'Tom' $q$),
                   2, 'Ex æquo : Tom (1150) 2e aussi');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_leaderboard('global', 100, 0) where username = 'Carl' $q$),
                   4, 'Ex æquo : Carl (1100) 4e (le rang 3 saute)');
  raise notice 'Scénario 3 (ex æquo) ✔';
end $$;

-- ═══ Scénario 4 : le rang dépend du spectateur (et le blocage est symétrique) ═══
do $$
declare
  C uuid := 'a0000000-0000-0000-0000-00000000000c';
  X uuid := 'a0000000-0000-0000-0000-0000000000aa';
begin
  -- Pour Carl : Emma (privée, pas son amie) disparaît mais Xavier apparaît.
  perform tests.eq(tests.rows_as(C, $q$ select count(*) from public.get_leaderboard('global', 100, 0) $q$),
                   6, 'Global vu par Carl : 6 classés');
  perform tests.eq(tests.rows_as(C, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Emma' $q$),
                   0, 'Global vu par Carl : Emma invisible');
  perform tests.eq(tests.rows_as(C, $q$ select rank from public.get_leaderboard('global', 100, 0) where username = 'Xavier' $q$),
                   5, 'Global vu par Carl : Xavier (1050) 5e');
  -- Symétrie : le bloqueur (Xavier) ne voit pas non plus sa cible (Anna).
  perform tests.eq(tests.rows_as(X, $q$ select count(*) from public.get_leaderboard('global', 100, 0) where username = 'Anna' $q$),
                   0, 'Global vu par Xavier : Anna (qu''il a bloquée) invisible');
  -- Pour Carl, l'onglet Amis ne contient que lui (aucun ami accepté).
  perform tests.eq(tests.rows_as(C, $q$ select count(*) from public.get_leaderboard('friends', 100, 0) $q$),
                   1, 'Amis vu par Carl : lui seul');
  raise notice 'Scénario 4 (visibilité par appelant, symétrie du blocage) ✔';
end $$;

-- ═══ Scénario 5 : get_my_rank + pagination + garde-fous ═══
do $$
declare
  A uuid := 'a0000000-0000-0000-0000-00000000000a';
  F uuid := 'a0000000-0000-0000-0000-00000000000f';
  bad boolean := false;
  err text;
begin
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_my_rank('global') $q$),
                   5, 'get_my_rank(global) : 5e');
  perform tests.eq(tests.rows_as(A, $q$ select rank from public.get_my_rank('friends') $q$),
                   2, 'get_my_rank(friends) : 2e');
  perform tests.eq(tests.rows_as(F, $q$ select count(*) from public.get_my_rank('global') $q$),
                   0, 'get_my_rank(global) : aucune ligne si jamais couru');
  perform tests.eq(tests.rows_as(F, $q$ select count(*) from public.get_my_rank('friends') $q$),
                   0, 'get_my_rank(friends) : aucune ligne si jamais couru');
  -- Pagination : fenêtre (limit 2, offset 2) du Global de A → Tom(2), Carl(4).
  perform tests.eq(tests.rows_as(A, $q$ select min(rank) from public.get_leaderboard('global', 2, 2) $q$),
                   2, 'pagination : la fenêtre commence au rang 2 (ex æquo à cheval)');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 2, 2) $q$),
                   2, 'pagination : 2 lignes');
  -- Deux pages contiguës ne se chevauchent pas (même instantané).
  perform tests.eq(tests.rows_as(A, $q$
      select count(*) from (
        select coalesce(profile_id, ghost_id) as pid from public.get_leaderboard('global', 2, 0)
        intersect
        select coalesce(profile_id, ghost_id) from public.get_leaderboard('global', 2, 2)
      ) s $q$),
                   0, 'pagination : pages 1 et 2 disjointes');
  -- Garde-fous : limit null → défaut (100), limit 0 → rien, offset négatif → 0.
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', null, 0) $q$),
                   6, 'limit null → défaut raisonnable');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 0, 0) $q$),
                   0, 'limit 0 → aucune ligne');
  perform tests.eq(tests.rows_as(A, $q$ select count(*) from public.get_leaderboard('global', 100, -5) $q$),
                   6, 'offset négatif → ramené à 0');
  -- Portée inconnue → refus avec LE bon message (pas une autre erreur).
  perform tests.as_user(A);
  begin
    perform * from public.get_leaderboard('planete', 10, 0);
  exception when others then
    get stacked diagnostics err = message_text;
    bad := err like 'Portée inconnue%';
  end;
  perform tests.as_super();
  if not bad then raise exception 'ÉCHEC : portée inconnue non refusée avec le bon message'; end if;
  raise notice 'Scénario 5 (mon rang, pagination, garde-fous) ✔';
end $$;

do $$ begin raise notice 'Tous les tests classement sont passés ✔'; end $$;

rollback;
