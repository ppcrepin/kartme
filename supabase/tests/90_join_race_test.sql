-- Tests du RPC join_race (UX : un invité rejoint lui-même une course ouverte).

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
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  truncate net._calls;
  perform tests.as_uid(B);
  perform public.join_race(r);
  perform tests.eq((select count(*) from participations where race_id = r and profile_id = B), 1, 'B a rejoint');
  -- Auto-inscription : l'admin est prévenu, pas le joignant.
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'invite' and body ->> 'recipient' = A::text), 1, 'l''admin est notifié du nouveau pilote');
  perform tests.eq((select count(*) from net._calls where body ->> 'recipient' = B::text), 0, 'le joignant ne s''auto-notifie pas');
  perform public.join_race(r);   -- idempotent
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

do $$ begin raise notice 'Tous les tests join_race sont passés ✔'; end $$;

rollback;
