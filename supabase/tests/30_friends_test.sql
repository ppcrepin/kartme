-- Tests amis / blocage / confidentialité (lot 2.1). Transaction annulée.

begin;

create schema tests;
-- Les helpers sont rappelés pendant que la session joue le rôle authenticated.
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

create function tests.expect_denied(p_uid uuid, p_sql text, msg text) returns void
language plpgsql as $$
declare denied boolean := false;
begin
  perform tests.as_user(p_uid);
  begin
    execute p_sql;
  exception when others then denied := true;
  end;
  perform tests.as_super();
  if not denied then raise exception 'ÉCHEC (aurait dû être refusé) : %', msg; end if;
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
  ('f0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('f0000000-0000-0000-0000-00000000000b', 'b@t'),
  ('f0000000-0000-0000-0000-00000000000c', 'c@t'),
  ('f0000000-0000-0000-0000-00000000000d', 'd@t');

insert into public.profiles (id, username, elo, is_private) values
  ('f0000000-0000-0000-0000-00000000000a', 'Anna', 1000, false),
  ('f0000000-0000-0000-0000-00000000000b', 'Bob', 1000, false),
  ('f0000000-0000-0000-0000-00000000000c', 'Carl', 1000, false),
  ('f0000000-0000-0000-0000-00000000000d', 'Dora', 1234, true);

do $$
declare
  A uuid := 'f0000000-0000-0000-0000-00000000000a';
  B uuid := 'f0000000-0000-0000-0000-00000000000b';
  C uuid := 'f0000000-0000-0000-0000-00000000000c';
  D uuid := 'f0000000-0000-0000-0000-00000000000d';
  fid uuid;
  banded int;
  exact boolean;
begin
  -- 1. Cycle d'amitié : A → B, B accepte.
  perform tests.as_user(A);
  insert into friendships (requester_id, addressee_id) values (A, B) returning id into fid;
  perform tests.as_super();
  perform tests.eq(tests.rows_as(B, 'select count(*) from friendships where status = ''pending'''), 1, 'B voit la demande reçue');

  -- Le demandeur ne peut pas accepter lui-même (RLS filtre : 0 ligne modifiée).
  perform tests.as_user(A);
  update friendships set status = 'accepted' where id = fid;
  perform tests.as_super();
  perform tests.eq((select count(*) from friendships where id = fid and status = 'pending'), 1, 'A ne peut pas accepter à la place de B');

  perform tests.as_user(B);
  update friendships set status = 'accepted' where id = fid;
  perform tests.as_super();
  perform tests.eq((select count(*) from friendships where id = fid and status = 'accepted'), 1, 'B accepte la demande');
  raise notice 'Scénario 1 (cycle demande → acceptée) ✔';

  -- 2. Confidentialité : Dora (privée) invisible pour Anna…
  perform tests.eq(tests.rows_as(A, 'select count(*) from profiles where id = ''f0000000-0000-0000-0000-00000000000d'''), 0, 'profil privé invisible d''un inconnu');
  -- …mais la recherche la trouve, avec un Elo bandé (grade seulement).
  perform tests.as_user(A);
  select elo, elo_exact into banded, exact from search_pilots('Dora');
  perform tests.as_super();
  if banded is distinct from 1000 or exact is distinct from false then
    raise exception 'ÉCHEC : recherche privée (elo % exact %)', banded, exact;
  end if;
  -- Dora envoie une demande à Anna → son profil devient lisible par Anna.
  perform tests.as_user(D);
  insert into friendships (requester_id, addressee_id) values (D, A);
  perform tests.as_super();
  perform tests.eq(tests.rows_as(A, 'select count(*) from profiles where id = ''f0000000-0000-0000-0000-00000000000d'''), 1, 'la demande révèle le profil privé au destinataire');
  raise notice 'Scénario 2 (profil privé : masqué, bandé, révélé par la demande) ✔';

  -- 3. Blocage : Anna bloque Carl → Carl ne peut plus la demander en ami.
  perform tests.as_user(A);
  insert into blocks (blocker_id, blocked_id) values (A, C);
  perform tests.as_super();
  perform tests.expect_denied(C,
    'insert into friendships (requester_id, addressee_id) values (''f0000000-0000-0000-0000-00000000000c'', ''f0000000-0000-0000-0000-00000000000a'')',
    'un bloqué ne peut pas envoyer de demande');
  -- Et la recherche de Carl ne renvoie plus Anna.
  perform tests.eq(tests.rows_as(C, 'select count(*) from search_pilots(''Anna'')'), 0, 'le blocage masque aussi la recherche');
  -- Carl ne peut pas non plus ajouter Anna à une de ses courses.
  perform tests.as_user(C);
  insert into races (id, admin_id, scheduled_at)
    values ('f1000000-0000-0000-0000-000000000001', C, now());
  perform tests.as_super();
  perform tests.expect_denied(C,
    'insert into participations (race_id, profile_id) values (''f1000000-0000-0000-0000-000000000001'', ''f0000000-0000-0000-0000-00000000000a'')',
    'un bloqué ne peut pas ajouter le bloqueur à sa course');
  raise notice 'Scénario 3 (blocage effectif) ✔';

  -- 4. Signalement : écriture ok, lecture refusée.
  perform tests.as_user(C);
  insert into reports (reporter_id, reported_profile_id, category) values (C, B, 'comportement');
  perform tests.as_super();
  perform tests.expect_denied(C, 'select count(*) from reports',
    'les signalements ne sont pas lisibles par les joueurs');
  perform tests.expect_denied(C,
    'insert into reports (reporter_id, reported_profile_id, category) values (''f0000000-0000-0000-0000-00000000000b'', ''f0000000-0000-0000-0000-00000000000a'', ''autre'')',
    'impossible de signaler au nom d''un autre');
  raise notice 'Scénario 4 (signalements en écriture seule) ✔';
end $$;

do $$ begin raise notice 'Tous les tests amis sont passés ✔'; end $$;

rollback;
