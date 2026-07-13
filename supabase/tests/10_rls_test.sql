-- Tests RLS KartSquad (lot 0.3).
-- Vérifient que la sécurité laisse passer l'autorisé et bloque le reste.
-- Exécuté dans une transaction annulée à la fin (non destructif).
-- Prérequis : bootstrap + migrations appliqués sur la base.

begin;

create schema tests;

-- Helpers : jouer une requête sous l'identité d'un utilisateur authentifié.
create function tests.expect_allowed(p_uid uuid, p_sql text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

create function tests.expect_denied(p_uid uuid, p_sql text) returns void
language plpgsql as $$
declare denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute p_sql;
  exception when others then
    denied := true;
  end;
  reset role;
  if not denied then
    raise exception 'ÉCHEC TEST (aurait dû être refusé) : %', p_sql;
  end if;
end $$;

create function tests.rows_as(p_uid uuid, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC TEST : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

-- ── Fixtures (insérées en superutilisateur, hors RLS) ─────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test'),
  ('22222222-2222-2222-2222-222222222222', 'b@test'),
  ('33333333-3333-3333-3333-333333333333', 'c@test');

insert into public.profiles (id, username, is_private) values
  ('11111111-1111-1111-1111-111111111111', 'Alice', false),
  ('22222222-2222-2222-2222-222222222222', 'Bruno', false),
  ('33333333-3333-3333-3333-333333333333', 'Chloe', true);

insert into public.circuits (id, name, city, is_official) values
  ('c1111111-1111-1111-1111-111111111111', 'Karting Test', 'Testville', true);

insert into public.races (id, admin_id, circuit_id, scheduled_at) values
  ('a1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', now());

insert into public.ghost_profiles (id, display_name, created_by) values
  ('91111111-1111-1111-1111-111111111111', 'Invité Test',
   '11111111-1111-1111-1111-111111111111');

insert into public.participations (id, race_id, profile_id) values
  ('90000000-0000-0000-0000-000000000001',
   'a1111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222');

-- ── Assertions ────────────────────────────────────────────────────────────
do $$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- Lecture des profils : public visible, privé masqué, le sien visible.
  perform tests.eq(tests.rows_as(A, 'select count(*) from profiles where id = ''22222222-2222-2222-2222-222222222222'''), 1, 'A lit le profil public B');
  perform tests.eq(tests.rows_as(A, 'select count(*) from profiles where id = ''33333333-3333-3333-3333-333333333333'''), 0, 'A ne lit pas le profil privé C');
  perform tests.eq(tests.rows_as(C, 'select count(*) from profiles where id = ''33333333-3333-3333-3333-333333333333'''), 1, 'C lit son propre profil privé');

  -- Circuits et fantômes visibles de tous les inscrits.
  perform tests.eq(tests.rows_as(B, 'select count(*) from circuits where id = ''c1111111-1111-1111-1111-111111111111'''), 1, 'B voit le circuit');
  perform tests.eq(tests.rows_as(B, 'select count(*) from ghost_profiles where id = ''91111111-1111-1111-1111-111111111111'''), 1, 'B voit le fantôme (Global)');

  -- Résultats : seul l'admin de la course écrit le classement.
  perform tests.expect_allowed(A,
    'insert into results (race_id, participation_id, position, elo_before, elo_after, elo_delta) values (''a1111111-1111-1111-1111-111111111111'', ''90000000-0000-0000-0000-000000000001'', 1, 1000, 1018, 18)');
  perform tests.expect_denied(B,
    'insert into results (race_id, participation_id, position, elo_before, elo_after, elo_delta) values (''a1111111-1111-1111-1111-111111111111'', ''90000000-0000-0000-0000-000000000001'', 1, 1000, 1500, 500)');

  -- Participants : seul l'admin les gère.
  perform tests.expect_denied(B,
    'insert into participations (race_id, profile_id) values (''a1111111-1111-1111-1111-111111111111'', ''33333333-3333-3333-3333-333333333333'')');

  -- Course : seul l'admin la modifie. Pour un UPDATE, la RLS masque la ligne
  -- (0 ligne touchée, sans erreur) → on vérifie l'absence d'effet.
  perform tests.expect_allowed(B,
    'update races set status = ''completed'' where id = ''a1111111-1111-1111-1111-111111111111''');
  perform tests.eq(
    (select count(*) from public.races where id = 'a1111111-1111-1111-1111-111111111111' and status = 'upcoming'),
    1, 'la course de A reste inchangée pour B');

  -- Elo non modifiable à la main (même sur son propre profil).
  perform tests.expect_denied(A,
    'update profiles set elo = 2400 where id = ''11111111-1111-1111-1111-111111111111''');
  perform tests.expect_allowed(A,
    'update profiles set username = ''Alicia'' where id = ''11111111-1111-1111-1111-111111111111''');

  -- Impossible de créer le profil d'un autre.
  perform tests.expect_denied(B,
    'insert into profiles (id, username) values (''44444444-4444-4444-4444-444444444444'', ''Faux'')');

  -- Circuit : ajout libre autorisé, mais pas en "officiel".
  perform tests.expect_allowed(B,
    'insert into circuits (name, created_by) values (''Mon Karting'', ''22222222-2222-2222-2222-222222222222'')');
  perform tests.expect_denied(B,
    'insert into circuits (name, created_by, is_official) values (''Faux Officiel'', ''22222222-2222-2222-2222-222222222222'', true)');

  -- elo_history : insertion directe interdite (réservée au moteur Elo serveur).
  perform tests.expect_denied(A,
    'insert into elo_history (profile_id, elo, delta) values (''11111111-1111-1111-1111-111111111111'', 1018, 18)');

  raise notice 'Tous les tests RLS sont passés ✔';
end $$;

rollback;
