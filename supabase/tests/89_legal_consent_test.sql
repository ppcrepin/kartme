-- Tests du consentement à l'inscription (lot 3.3) : un client ne peut pas créer
-- de compte sans accepter les conditions ; les inserts privilégiés (seed) restent
-- exemptés.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

insert into auth.users (id, email) values
  ('d8000000-0000-0000-0000-00000000000a', 'a@t'),
  ('d8000000-0000-0000-0000-00000000000b', 'b@t');

-- ═══ Scénario 1 : un client doit consentir ═══
do $$
declare
  A uuid := 'd8000000-0000-0000-0000-00000000000a';
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Sans consentement → refusé.
  begin insert into public.profiles (id, username) values (A, 'Alan');
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : compte créé sans consentement'; end if;
  perform tests.eq((select count(*) from profiles where id = A), 0, 'aucun profil créé sans consentement');

  -- Date sans version → refusé aussi (preuve versionnée exigée).
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.profiles (id, username, terms_accepted_at) values (A, 'Alan', now());
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : compte créé sans version de conditions'; end if;

  -- Avec consentement → OK, horodaté + versionné.
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.profiles (id, username, terms_accepted_at, terms_version)
    values (A, 'Alan', now(), '2026-07-14');
  reset role;
  perform tests.eq((select count(*) from profiles where id = A and terms_accepted_at is not null and terms_version = '2026-07-14'), 1, 'profil créé avec consentement horodaté');
  raise notice 'Scénario 1 (consentement requis côté client) ✔';
end $$;

-- ═══ Scénario 2 : le seed / service reste exempté ═══
do $$
declare B uuid := 'd8000000-0000-0000-0000-00000000000b';
begin
  -- Contexte superuser (comme le seed / le dashboard) : pas de consentement requis.
  insert into public.profiles (id, username) values (B, 'Bea');
  perform tests.eq((select count(*) from profiles where id = B), 1, 'seed exempté de consentement');
  raise notice 'Scénario 2 (seed exempté) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de consentement sont passés ✔'; end $$;

rollback;
