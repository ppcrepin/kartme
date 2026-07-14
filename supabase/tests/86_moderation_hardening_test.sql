-- Tests du durcissement (lot 3.1a) : drapeau modérateur non auto-attribuable,
-- filtre de mots interdits côté serveur, garde-fous anti-spam (rate-limits).
-- now() est constant dans la transaction → les rate-limits (fenêtre glissante)
-- se testent tels quels (toutes les lignes tombent dans la même fenêtre).

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('c0000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo) values
  ('c0000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('c0000000-0000-0000-0000-00000000000b', 'Bea', 1000);

-- ═══ Scénario 1 : is_moderator non auto-attribuable ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a'; denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set is_moderator = true where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un inscrit a pu se déclarer modérateur'; end if;
  perform tests.eq((select case when is_moderator then 1 else 0 end from profiles where id = A), 0, 'is_moderator resté faux');

  -- Le PO (éditeur SQL) l'accorde via le drapeau dédié.
  perform set_config('kartsquad.grant_moderator', '1', true);
  update public.profiles set is_moderator = true where id = A;
  perform set_config('kartsquad.grant_moderator', '', true);
  perform tests.eq((select case when is_moderator then 1 else 0 end from profiles where id = A), 1, 'modérateur accordé via le drapeau');
  raise notice 'Scénario 1 (drapeau modérateur protégé) ✔';
end $$;

-- ═══ Scénario 1b : is_moderator et elo forcés à l'INSERT (B1 + M2) ═══
do $$
declare Z uuid := 'c0000000-0000-0000-0000-0000000000f0';
begin
  insert into auth.users (id, email) values (Z, 'z@t');
  perform set_config('request.jwt.claims', json_build_object('sub', Z, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Tentative d'auto-élévation + Elo gonflé à l'inscription.
  insert into public.profiles (id, username, elo, is_moderator) values (Z, 'Zack', 2500, true);
  reset role;
  perform tests.eq((select case when is_moderator then 1 else 0 end from profiles where id = Z), 0, 'is_moderator forcé à faux à l''insertion');
  perform tests.eq((select elo from profiles where id = Z), 1000, 'elo forcé à 1000 à l''insertion');
  raise notice 'Scénario 1b (INSERT : modérateur/elo forcés) ✔';
end $$;

-- ═══ Scénario 2 : filtre de mots interdits côté serveur ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a'; denied boolean;
begin
  -- Pseudo interdit (renommage).
  denied := false;
  begin update public.profiles set username = 'Connard76' where id = A;
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : pseudo interdit accepté'; end if;

  -- Fantôme interdit.
  denied := false;
  begin insert into public.ghost_profiles (display_name, created_by) values ('grosse salope', A);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : nom de fantôme interdit accepté'; end if;

  -- Circuit interdit.
  denied := false;
  begin insert into public.circuits (name, created_by) values ('Circuit de merde', A);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : nom de circuit interdit accepté'; end if;

  -- Nom propre : accepté.
  insert into public.circuits (name, created_by) values ('Karting de Lyon', A);
  perform tests.eq((select count(*) from circuits where name = 'Karting de Lyon'), 1, 'nom propre accepté');

  -- Pas de faux positif : « con » en sous-chaîne d'un nom légitime doit passer.
  insert into public.circuits (name, created_by) values ('Karting de Concarneau', A);
  insert into public.circuits (name, created_by) values ('Draveil-Concept', A);
  perform tests.eq((select count(*) from circuits where name in ('Karting de Concarneau', 'Draveil-Concept')), 2, 'Concarneau/Concept non bloqués (pas de faux positif « con »)');
  -- Mais « con » mot isolé reste bloqué.
  denied := false;
  begin insert into public.circuits (name, created_by) values ('espèce de con', A);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : « con » mot isolé accepté'; end if;

  -- Contournement par accents/espaces : normalisé puis bloqué.
  denied := false;
  begin insert into public.ghost_profiles (display_name, created_by) values ('n a z i', A);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : contournement par espaces accepté'; end if;
  raise notice 'Scénario 2 (filtre serveur : pseudo/fantôme/circuit) ✔';
end $$;

-- ═══ Scénario 3 : rate-limit fantômes (30/h) ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a'; i int; denied boolean := false;
begin
  for i in 1..30 loop
    insert into public.ghost_profiles (display_name, created_by) values ('Invite ' || i, A);
  end loop;
  begin insert into public.ghost_profiles (display_name, created_by) values ('Invite 31', A);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : 31e fantôme accepté (limite 30/h)'; end if;
  perform tests.eq((select count(*) from ghost_profiles where created_by = A), 30, 'exactement 30 fantômes créés');
  raise notice 'Scénario 3 (rate-limit fantômes) ✔';
end $$;

-- ═══ Scénario 4 : rate-limit circuits (10/h) ═══
-- Créateur B (A a déjà créé un circuit au scénario 2).
do $$
declare B uuid := 'c0000000-0000-0000-0000-00000000000b'; i int; denied boolean := false;
begin
  for i in 1..10 loop
    insert into public.circuits (name, created_by) values ('Piste ' || i, B);
  end loop;
  begin insert into public.circuits (name, created_by) values ('Piste 11', B);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : 11e circuit accepté (limite 10/h)'; end if;
  raise notice 'Scénario 4 (rate-limit circuits) ✔';
end $$;

-- ═══ Scénario 5 : rate-limit signalements (20/j) ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a'; i int; denied boolean := false;
begin
  for i in 1..20 loop
    insert into public.reports (reporter_id, category, message) values (A, 'autre', 'test ' || i);
  end loop;
  begin insert into public.reports (reporter_id, category) values (A, 'autre');
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : 21e signalement accepté (limite 20/j)'; end if;
  raise notice 'Scénario 5 (rate-limit signalements) ✔';
end $$;

-- ═══ Scénario 6 : rate-limit demandes d'amis (30/h) ═══
do $$
declare R uuid := 'c0000000-0000-0000-0000-00000000000a'; i int; uid uuid; denied boolean := false;
begin
  -- 31 destinataires distincts.
  for i in 1..31 loop
    uid := ('c1000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into auth.users (id, email) values (uid, 'rl' || i || '@t');
    insert into public.profiles (id, username, elo) values (uid, 'Rl' || i, 1000);
    if i <= 30 then
      insert into public.friendships (requester_id, addressee_id, status) values (R, uid, 'pending');
    end if;
  end loop;
  -- 31e demande → refusée.
  uid := 'c1000000-0000-0000-0000-000000000031';
  begin insert into public.friendships (requester_id, addressee_id, status) values (R, uid, 'pending');
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : 31e demande d''ami acceptée (limite 30/h)'; end if;
  perform tests.eq((select count(*) from friendships where requester_id = R), 30, 'exactement 30 demandes envoyées');
  raise notice 'Scénario 6 (rate-limit demandes d''amis) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de durcissement sont passés ✔'; end $$;

rollback;
