-- Tests « revanche » (lot 2.1 bis). Transaction annulée.

begin;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.rematch_as(p uuid, src uuid) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform tests.as_user(p);
  r := public.rematch(src);
  reset role;
  return r;
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'a@t'),
  ('a1000000-0000-0000-0000-000000000002', 'b@t'),
  ('a1000000-0000-0000-0000-000000000003', 'c@t');
insert into public.profiles (id, username) values
  ('a1000000-0000-0000-0000-000000000001', 'Anna'),
  ('a1000000-0000-0000-0000-000000000002', 'Bob'),
  ('a1000000-0000-0000-0000-000000000003', 'Carl');
insert into public.circuits (id, name, is_official) values
  ('a1c00000-0000-0000-0000-000000000001', 'Circuit Test', true);

do $$
declare
  A uuid := 'a1000000-0000-0000-0000-000000000001';
  B uuid := 'a1000000-0000-0000-0000-000000000002';
  C uuid := 'a1000000-0000-0000-0000-000000000003';
  src uuid := 'a1a00000-0000-0000-0000-000000000001';
  ghost uuid;
  r2 uuid;
  denied boolean := false;
begin
  insert into races (id, admin_id, circuit_id, scheduled_at)
    values (src, A, 'a1c00000-0000-0000-0000-000000000001', now());
  insert into ghost_profiles (id, display_name, created_by)
    values (gen_random_uuid(), 'Invité', A) returning id into ghost;
  insert into participations (race_id, profile_id) values (src, A), (src, B);
  insert into participations (race_id, ghost_id) values (src, ghost);

  -- 1. Revanche par l'admin : même circuit, mêmes 3 pilotes.
  r2 := tests.rematch_as(A, src);
  perform tests.eq((select count(*) from races where id = r2 and admin_id = A
                    and circuit_id = 'a1c00000-0000-0000-0000-000000000001'), 1, 'nouvelle course, même circuit, admin A');
  perform tests.eq((select count(*) from participations where race_id = r2), 3, '3 pilotes copiés');
  perform tests.eq((select count(*) from participations where race_id = r2 and profile_id = B), 1, 'Bob copié');
  perform tests.eq((select count(*) from participations where race_id = r2 and ghost_id = ghost), 1, 'le fantôme copié');
  raise notice 'Scénario 1 (revanche copie tout) ✔';

  -- 2. Un non-pilote (Carl) ne peut pas relancer.
  begin
    perform tests.rematch_as(C, src);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : un non-pilote a pu relancer'; end if;
  raise notice 'Scénario 2 (non-pilote refusé) ✔';

  -- 3. Blocage : Anna bloque Bob → la revanche l'exclut.
  insert into blocks (blocker_id, blocked_id) values (A, B);
  r2 := tests.rematch_as(A, src);
  perform tests.eq((select count(*) from participations where race_id = r2 and profile_id = B), 0, 'Bob (bloqué) exclu de la revanche');
  perform tests.eq((select count(*) from participations where race_id = r2 and profile_id = A), 1, 'Anna reste dans la revanche');
  raise notice 'Scénario 3 (blocage exclut de la revanche) ✔';

  -- 4. Limite quotidienne : au-delà de 10 courses/jour, refus.
  insert into races (admin_id, circuit_id, scheduled_at)
    select A, 'a1c00000-0000-0000-0000-000000000001', now() from generate_series(1, 10);
  denied := false;
  begin
    perform tests.rematch_as(A, src);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : limite quotidienne contournée par la revanche'; end if;
  raise notice 'Scénario 4 (limite quotidienne respectée) ✔';
end $$;

do $$ begin raise notice 'Tous les tests revanche sont passés ✔'; end $$;

rollback;
