-- Tests du RPC join_race.
--
-- Depuis le 2026-08-01, rejoindre exige le JETON d'invitation de la course :
-- « seul l'admin invite » (décision PO). Le jeton n'est plus lisible par les
-- autres inscrits, et il voyage dans le lien de partage que l'admin diffuse.
-- Ces tests gardent la règle des deux côtés — avec jeton on entre, sans jeton
-- on reste dehors — et vérifient que les refus antérieurs (course clôturée,
-- blocage, suspension) n'ont pas été perdus au passage.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

update public.push_config set function_url = 'http://edge/push', hook_secret = 'shh' where id = 1;

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000a', 'a@t'),
  ('90000000-0000-0000-0000-00000000000b', 'b@t'),
  ('90000000-0000-0000-0000-00000000000d', 'd@t'),
  ('90000000-0000-0000-0000-00000000000e', 'e@t');
insert into public.profiles (id, username, elo) values
  ('90000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('90000000-0000-0000-0000-00000000000b', 'Bea', 1000),
  ('90000000-0000-0000-0000-00000000000d', 'Dina', 1000),
  ('90000000-0000-0000-0000-00000000000e', 'Elio', 1000);

-- ═══ Scénario 1 : un invité rejoint une course ouverte (+ idempotent) ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  B uuid := '90000000-0000-0000-0000-00000000000b';
  r uuid := '92000000-0000-0000-0000-000000000001';
  v_token text;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  select invite_token into v_token from races where id = r;
  truncate net._calls;
  perform tests.as_uid(B);
  perform public.join_race(r, v_token);
  perform tests.eq((select count(*) from participations where race_id = r and profile_id = B), 1, 'B a rejoint AVEC le jeton du lien');
  -- Auto-inscription : l'admin est prévenu, pas le joignant.
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'invite' and body ->> 'recipient' = A::text), 1, 'l''admin est notifié du nouveau pilote');
  perform tests.eq((select count(*) from net._calls where body ->> 'recipient' = B::text), 0, 'le joignant ne s''auto-notifie pas');
  -- Idempotent, et SANS jeton : quelqu'un de déjà inscrit qui rouvre la page
  -- ne doit pas dépendre du lien par lequel il est entré.
  perform public.join_race(r);
  perform tests.eq((select count(*) from participations where race_id = r and profile_id = B), 1, 'toujours une seule participation');
  raise notice 'Scénario 1 (rejoindre + idempotent + notif admin) ✔';
end $$;

-- ═══ Scénario 2 : course clôturée → inscriptions closes ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  B uuid := '90000000-0000-0000-0000-00000000000b';
  D uuid := '90000000-0000-0000-0000-00000000000d';
  r uuid := '92000000-0000-0000-0000-000000000002';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (race_id, profile_id) values (r, A), (r, B);
  perform tests.as_uid(A);
  perform public.lock_race(r);
  perform tests.as_uid(D);
  begin perform public.join_race(r);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : on a pu rejoindre une course clôturée'; end if;
  raise notice 'Scénario 2 (course clôturée) ✔';
end $$;

-- ═══ Scénario 3 : blocage avec l'admin → refus ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  D uuid := '90000000-0000-0000-0000-00000000000d';
  r uuid := '92000000-0000-0000-0000-000000000003';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into blocks (blocker_id, blocked_id) values (A, D);   -- l'admin a bloqué D
  perform tests.as_uid(D);
  begin perform public.join_race(r);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un bloqué a pu rejoindre'; end if;
  raise notice 'Scénario 3 (blocage) ✔';
end $$;

-- ═══ Scénario 4 : compte suspendu → refus (garde serveur) ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  E uuid := '90000000-0000-0000-0000-00000000000e';
  r uuid := '92000000-0000-0000-0000-000000000004';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = E;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(E);
  begin perform public.join_race(r);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un compte suspendu a pu rejoindre'; end if;
  raise notice 'Scénario 4 (suspendu) ✔';
end $$;

-- ═══ Scénario 5 : SANS jeton, on ne rejoint pas ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  D uuid := '90000000-0000-0000-0000-00000000000d';
  r uuid := '92000000-0000-0000-0000-000000000005';
  denied boolean := false;
begin
  -- LE test du lot. Avant, `join_race` n'exigeait rien : n'importe quel
  -- inscrit copiait l'URL de la page — qui EST le lien de partage — et la
  -- transmettait. Masquer le bouton « Inviter » côté écran ne retirait aucune
  -- capacité ; la règle se tient ici.
  -- On repasse EXPLICITEMENT sous l'identité de l'admin avant de créer la
  -- course : le scénario précédent laisse un compte SUSPENDU comme acteur
  -- courant, et le garde serveur refuserait l'insertion.
  perform tests.as_uid(A);
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  perform tests.as_uid(D);
  begin perform public.join_race(r);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : on a rejoint SANS jeton d''invitation'; end if;

  denied := false;
  begin perform public.join_race(r, 'jeton-invente');
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un jeton inventé a été accepté'; end if;

  perform tests.eq((select count(*) from participations where race_id = r and profile_id = D), 0,
                   'aucune participation créée par les tentatives');
  raise notice 'Scénario 5 (sans jeton, pas d''entrée) ✔';
end $$;

-- ═══ Scénario 6 : le jeton n'est lisible QUE par l'admin ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  D uuid := '90000000-0000-0000-0000-00000000000d';
  r uuid := '92000000-0000-0000-0000-000000000006';
  v_token text; v_lu text; denied boolean := false; v_colonne bigint;
begin
  -- Le second verrou, et il faut les deux : si un non-admin peut LIRE le jeton,
  -- il fabrique le lien lui-même et le premier verrou ne sert à rien.
  perform tests.as_uid(A);
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  select invite_token into v_token from races where id = r;

  v_lu := public.race_invite_token(r);
  if v_lu is distinct from v_token then
    raise exception 'ÉCHEC : l''admin n''obtient pas le jeton de sa course';
  end if;

  perform tests.as_uid(D);
  begin v_lu := public.race_invite_token(r);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un non-admin a obtenu le jeton'; end if;

  -- Et la colonne elle-même n'est plus lisible : sans ce retrait, le jeton
  -- partait dans chaque chargement de course, pour tout le monde.
  select count(*) into v_colonne
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'races'
     and column_name = 'invite_token' and grantee = 'authenticated'
     and privilege_type = 'SELECT';
  perform tests.eq(v_colonne, 0, 'la colonne invite_token n''est plus lisible par authenticated');
  raise notice 'Scénario 6 (le jeton reste chez l''admin) ✔';
end $$;

do $$ begin raise notice 'Tous les tests join_race sont passés ✔'; end $$;

rollback;
