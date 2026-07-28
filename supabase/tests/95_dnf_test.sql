-- Tests des abandons (A6) : classé dernier, ex æquo entre abandons, somme nulle
-- préservée, garde-fous de saisie, correction, et saisie groupée des temps (A9).

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.mk_user(p uuid, e int, r int default 100) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo, races) values
    (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e, r);
end $$;

create function tests.call_submit(p_uid uuid, p_race uuid, p_order uuid[], p_dnf uuid[] default '{}'::uuid[])
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform public.submit_race_results(p_race, p_order, p_dnf);
  perform set_config('kartsquad.elo_engine', '', true);
end $$;

-- ═══ Scénario 1 : un abandon est classé DERNIER (et paie comme tel) ═══
-- Trois pilotes de même niveau : A finit 1er, B 2e, C abandonne. C doit perdre
-- exactement ce qu'il aurait perdu en finissant 3e.
do $$
declare
  A uuid := 'dd000000-0000-0000-0000-00000000000a';
  B uuid := 'dd000000-0000-0000-0000-00000000000b';
  C uuid := 'dd000000-0000-0000-0000-00000000000c';
  r uuid := 'dd200000-0000-0000-0000-000000000001';
  pa uuid := 'dd400000-0000-0000-0000-000000000011';
  pb uuid := 'dd400000-0000-0000-0000-000000000012';
  pc uuid := 'dd400000-0000-0000-0000-000000000013';
  delta_c int;
begin
  perform tests.mk_user(A, 1000);
  perform tests.mk_user(B, 1000);
  perform tests.mk_user(C, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);
  perform tests.call_submit(A, r, array[pa, pb, pc], array[pc]);

  select elo_delta into delta_c from results where participation_id = pc;
  if delta_c >= 0 then raise exception 'ÉCHEC : un abandon doit coûter des points (obtenu %)', delta_c; end if;
  perform tests.eq((select count(*) from results where participation_id = pc and dnf), 1,
                   'le résultat est marqué « abandon »');
  perform tests.eq((select count(*) from results where race_id = r and dnf), 1,
                   'un seul abandon enregistré');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0,
                   'somme nulle conservée avec un abandon');
  -- Classé dernier : il perd plus que le 2e.
  if delta_c >= (select elo_delta from results where participation_id = pb) then
    raise exception 'ÉCHEC : l''abandon doit perdre plus que le 2e';
  end if;
  raise notice 'Scénario 1 (abandon = dernier, somme nulle) ✔';
end $$;

-- ═══ Scénario 2 : deux abandons sont EX ÆQUO entre eux ═══
-- Même Elo au départ, tous deux abandonnent → même delta, exactement.
do $$
declare
  D uuid := 'dd000000-0000-0000-0000-00000000000d';
  E uuid := 'dd000000-0000-0000-0000-00000000000e';
  F uuid := 'dd000000-0000-0000-0000-00000000000f';
  r uuid := 'dd200000-0000-0000-0000-000000000002';
  pd uuid := 'dd400000-0000-0000-0000-000000000021';
  pe uuid := 'dd400000-0000-0000-0000-000000000022';
  pf uuid := 'dd400000-0000-0000-0000-000000000023';
begin
  perform tests.mk_user(D, 1000);
  perform tests.mk_user(E, 1200);   -- E et F abandonnent, à des niveaux différents
  perform tests.mk_user(F, 1200);
  insert into races (id, admin_id, scheduled_at) values (r, D, now());
  insert into participations (id, race_id, profile_id) values (pd, r, D), (pe, r, E), (pf, r, F);
  perform tests.call_submit(D, r, array[pd, pe, pf], array[pe, pf]);

  -- E et F partent du même Elo et sont ex æquo : même sort « au point près ».
  -- Exactement identiques, c'est IMPOSSIBLE en entiers : leur part brute vaut
  -- ici −20,5 chacun, et la somme doit rester nulle — l'un prend −20, l'autre
  -- −21. C'est l'invariant de somme nulle qui tranche, et c'est voulu.
  if abs((select elo_delta from results where participation_id = pe)
       - (select elo_delta from results where participation_id = pf)) > 1 then
    raise exception 'ÉCHEC : deux abandons de même Elo doivent différer d''au plus 1 point (% vs %)',
      (select elo_delta from results where participation_id = pe),
      (select elo_delta from results where participation_id = pf);
  end if;
  if (select max(elo_delta) from results where participation_id in (pe, pf)) >= 0 then
    raise exception 'ÉCHEC : les deux abandons doivent perdre des points';
  end if;
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0,
                   'somme nulle conservée avec DEUX abandons');
  if (select elo_delta from results where participation_id = pd) <= 0 then
    raise exception 'ÉCHEC : le seul pilote à l''arrivée doit gagner des points';
  end if;
  raise notice 'Scénario 2 (abandons ex æquo, somme nulle) ✔';
end $$;

-- ═══ Scénario 3 : garde-fous de saisie ═══
do $$
declare
  G uuid := 'dd000000-0000-0000-0000-000000000010';
  H uuid := 'dd000000-0000-0000-0000-000000000011';
  r uuid := 'dd200000-0000-0000-0000-000000000003';
  autre uuid := 'dd200000-0000-0000-0000-000000000004';
  pg uuid := 'dd400000-0000-0000-0000-000000000031';
  ph uuid := 'dd400000-0000-0000-0000-000000000032';
  px uuid := 'dd400000-0000-0000-0000-000000000033';
  refuse boolean;
begin
  perform tests.mk_user(G, 1000);
  perform tests.mk_user(H, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, G, now()), (autre, G, now());
  insert into participations (id, race_id, profile_id) values (pg, r, G), (ph, r, H);
  insert into participations (id, race_id, profile_id) values (px, autre, G);

  -- Un abandon hors du classement soumis.
  refuse := false;
  begin
    perform tests.call_submit(G, r, array[pg, ph], array[px]);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : abandon hors classement accepté'; end if;

  -- Tout le monde abandonne : la course ne classe rien.
  refuse := false;
  begin
    perform tests.call_submit(G, r, array[pg, ph], array[pg, ph]);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : course sans aucun pilote à l''arrivée acceptée'; end if;

  -- Sans abandon, rien ne change pour les courses existantes.
  perform tests.call_submit(G, r, array[pg, ph]);
  perform tests.eq((select count(*) from results where race_id = r and dnf), 0,
                   'aucun abandon par défaut (rétrocompatible)');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0, 'somme nulle');
  raise notice 'Scénario 3 (garde-fous) ✔';
end $$;

-- ═══ Scénario 4 : la correction 24 h corrige aussi les abandons ═══
do $$
declare
  I uuid := 'dd000000-0000-0000-0000-000000000012';
  J uuid := 'dd000000-0000-0000-0000-000000000013';
  r uuid := 'dd200000-0000-0000-0000-000000000005';
  pi uuid := 'dd400000-0000-0000-0000-000000000041';
  pj uuid := 'dd400000-0000-0000-0000-000000000042';
begin
  perform tests.mk_user(I, 1000);
  perform tests.mk_user(J, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, I, now());
  insert into participations (id, race_id, profile_id) values (pi, r, I), (pj, r, J);
  -- Saisi à tort comme abandon de J.
  perform tests.call_submit(I, r, array[pi, pj], array[pj]);
  perform tests.eq((select count(*) from results where race_id = r and dnf), 1, 'prépa : J en abandon');

  update elo_history set created_at = now() - interval '2 hours' where race_id <> r;
  update races set completed_at = now() - interval '1 hour' where id = r;
  perform set_config('request.jwt.claims', json_build_object('sub', I, 'role', 'authenticated')::text, true);
  perform public.correct_race_results(r, array[pi, pj]);
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq((select count(*) from results where race_id = r and dnf), 0,
                   'correction : l''abandon a été retiré');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0, 'somme nulle après correction');
  raise notice 'Scénario 4 (correction des abandons) ✔';
end $$;

-- ═══ Scénario 5 : saisie GROUPÉE des temps (A9) ═══
do $$
declare
  K uuid := 'dd000000-0000-0000-0000-000000000014';
  L uuid := 'dd000000-0000-0000-0000-000000000015';
  M uuid := 'dd000000-0000-0000-0000-000000000016';   -- pilote d'une AUTRE course
  r uuid := 'dd200000-0000-0000-0000-000000000006';
  autre uuid := 'dd200000-0000-0000-0000-000000000007';
  pk uuid := 'dd400000-0000-0000-0000-000000000051';
  pl uuid := 'dd400000-0000-0000-0000-000000000052';
  pm uuid := 'dd400000-0000-0000-0000-000000000053';
  pn uuid := 'dd400000-0000-0000-0000-000000000054';
  refuse boolean;
begin
  perform tests.mk_user(K, 1000);
  perform tests.mk_user(L, 1000);
  perform tests.mk_user(M, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, K, now()), (autre, M, now());
  insert into participations (id, race_id, profile_id) values (pk, r, K), (pl, r, L);
  insert into participations (id, race_id, profile_id) values (pm, autre, M), (pn, autre, K);
  perform tests.call_submit(K, r, array[pk, pl]);
  perform tests.call_submit(M, autre, array[pm, pn]);

  perform set_config('request.jwt.claims', json_build_object('sub', K, 'role', 'authenticated')::text, true);
  perform public.set_lap_times(r, jsonb_build_array(
    jsonb_build_object('participation_id', pk, 'ms', 52348),
    jsonb_build_object('participation_id', pl, 'ms', 53100)));
  perform tests.eq((select best_lap_ms from results where participation_id = pk)::bigint, 52348, 'temps de K');
  perform tests.eq((select best_lap_ms from results where participation_id = pl)::bigint, 53100, 'temps de L');

  -- Effacer un temps (ms nul) reste possible.
  perform public.set_lap_times(r, jsonb_build_array(
    jsonb_build_object('participation_id', pl, 'ms', null)));
  perform tests.eq((select count(*) from results where participation_id = pl and best_lap_ms is null), 1,
                   'temps effaçable');

  -- Temps absurde : refusé.
  refuse := false;
  begin
    perform public.set_lap_times(r, jsonb_build_array(
      jsonb_build_object('participation_id', pk, 'ms', 5)));
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : temps hors bornes accepté'; end if;

  -- L'admin de r ne peut PAS écrire les temps d'une autre course, même s'il y
  -- participe (il n'y est pas admin).
  refuse := false;
  begin
    perform public.set_lap_times(r, jsonb_build_array(
      jsonb_build_object('participation_id', pm, 'ms', 51000)));
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : écriture croisée entre courses acceptée'; end if;
  perform tests.eq((select count(*) from results where participation_id = pm and best_lap_ms is null), 1,
                   'le temps de l''autre course est intact');
  raise notice 'Scénario 5 (saisie groupée des temps) ✔';
end $$;

do $$ begin raise notice 'Tous les tests abandons / temps groupés sont passés ✔'; end $$;

rollback;
