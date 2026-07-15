-- Tests des temps au tour (set_lap_time + get_circuit_record).

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

insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-00000000000a', 'a@t'),
  ('91000000-0000-0000-0000-00000000000b', 'b@t'),
  ('91000000-0000-0000-0000-00000000000c', 'c@t');
insert into public.profiles (id, username, elo) values
  ('91000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('91000000-0000-0000-0000-00000000000b', 'Bea', 1000),
  ('91000000-0000-0000-0000-00000000000c', 'Cyril', 1000);
insert into public.circuits (id, name, created_by) values
  ('91100000-0000-0000-0000-000000000001', 'Karting Vaux', '91000000-0000-0000-0000-00000000000a');

do $$
declare
  A uuid := '91000000-0000-0000-0000-00000000000a';
  B uuid := '91000000-0000-0000-0000-00000000000b';
  C uuid := '91000000-0000-0000-0000-00000000000c';
  circ uuid := '91100000-0000-0000-0000-000000000001';
  r uuid := '92000000-0000-0000-0000-000000000001';
  pa uuid := '94000000-0000-0000-0000-000000000001';
  pb uuid := '94000000-0000-0000-0000-000000000002';
  pc uuid := '94000000-0000-0000-0000-000000000003';
  denied boolean;
  rec record;
begin
  insert into races (id, admin_id, circuit_id, scheduled_at) values (r, A, circ, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);
  perform tests.as_uid(A);
  perform public.submit_race_results(r, array[pa, pb, pc]);
  perform set_config('kartsquad.elo_engine', '', true);

  -- B renseigne SON temps.
  perform tests.as_uid(B);
  perform public.set_lap_time(pb, 55000);
  perform tests.eq((select best_lap_ms from results where participation_id = pb), 55000, 'B a enregistré son temps');

  -- B ne peut pas modifier le temps de C.
  denied := false;
  begin perform public.set_lap_time(pc, 40000);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : B a modifié le temps de C'; end if;

  -- L'admin peut renseigner le temps de C.
  perform tests.as_uid(A);
  perform public.set_lap_time(pc, 53000);
  perform tests.eq((select best_lap_ms from results where participation_id = pc), 53000, 'l''admin a enregistré le temps de C');

  -- Temps hors bornes refusé.
  denied := false;
  perform tests.as_uid(B);
  begin perform public.set_lap_time(pb, 5000);   -- < 10 s
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : temps hors bornes accepté'; end if;

  -- Record du circuit = le plus rapide (C : 53000).
  select * into rec from public.get_circuit_record(circ);
  perform tests.eq(rec.best_lap_ms::bigint, 53000, 'record du circuit = 53000');
  if rec.holder <> 'Cyril' then raise exception 'ÉCHEC : détenteur du record (attendu Cyril, obtenu %)', rec.holder; end if;

  -- Une correction de classement (24 h) NE DOIT PAS effacer les temps (M1).
  update races set completed_at = now() - interval '1 hour' where id = r;
  perform tests.as_uid(A);
  perform public.correct_race_results(r, array[pc, pb, pa]);   -- inversion podium
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select best_lap_ms from results where participation_id = pb), 55000, 'temps de B préservé après correction');
  perform tests.eq((select best_lap_ms from results where participation_id = pc), 53000, 'temps de C préservé après correction');
  select * into rec from public.get_circuit_record(circ);
  perform tests.eq(rec.best_lap_ms::bigint, 53000, 'record du circuit intact après correction');

  -- Compte suspendu : ne peut plus saisir.
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = B;
  perform set_config('kartsquad.moderate_suspend', '', true);
  denied := false;
  perform tests.as_uid(B);
  begin perform public.set_lap_time(pb, 54000);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un compte suspendu a saisi un temps'; end if;

  raise notice 'Tous les tests des temps au tour sont passés ✔';
end $$;

rollback;
