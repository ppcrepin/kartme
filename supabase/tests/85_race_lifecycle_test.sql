-- Tests du cycle de vie de course (lot 2.6) : verrou + rappel, gel du roster,
-- fenêtre de correction 24 h (version sûre restreinte).
--
-- NB : dans une transaction, now() est constant → tous les created_at par défaut
-- sont égaux. Pour simuler des courses à des instants différents (nécessaire au
-- garde-fou « un pilote a couru depuis »), on décale explicitement certains
-- horodatages.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.as_admin(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function tests.calls(p_type text, p_recipient uuid) returns bigint language sql as $$
  select count(*) from net._calls
  where body ->> 'type' = p_type and body ->> 'recipient' = p_recipient::text;
$$;

update public.push_config set function_url = 'http://edge/push', hook_secret = 'shh' where id = 1;

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('e0000000-0000-0000-0000-00000000000b', 'b@t'),
  ('e0000000-0000-0000-0000-00000000000c', 'c@t'),
  ('e0000000-0000-0000-0000-00000000000d', 'd@t'),
  ('e0000000-0000-0000-0000-00000000000e', 'e@t'),
  ('e0000000-0000-0000-0000-00000000000f', 'f@t');
insert into public.profiles (id, username, elo) values
  ('e0000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('e0000000-0000-0000-0000-00000000000b', 'Bea', 1000),
  ('e0000000-0000-0000-0000-00000000000c', 'Cyril', 1000),
  ('e0000000-0000-0000-0000-00000000000d', 'Dina', 1000),
  ('e0000000-0000-0000-0000-00000000000e', 'Elio', 1000),
  ('e0000000-0000-0000-0000-00000000000f', 'Fara', 1000);
insert into public.circuits (id, name, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Karting Vaux', 'e0000000-0000-0000-0000-00000000000a');

-- ═══ Scénario 1 : verrou → état 'locked' + rappel une seule fois ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  B uuid := 'e0000000-0000-0000-0000-00000000000b';
  C uuid := 'e0000000-0000-0000-0000-00000000000c';
  r uuid := 'e2000000-0000-0000-0000-000000000001';
  g uuid := 'e3000000-0000-0000-0000-000000000001';
begin
  insert into races (id, admin_id, circuit_id, scheduled_at)
    values (r, A, 'e1000000-0000-0000-0000-000000000001', now());
  insert into participations (race_id, profile_id) values (r, A), (r, B), (r, C);
  insert into ghost_profiles (id, display_name, created_by) values (g, 'Fantôme', A);
  insert into participations (race_id, ghost_id) values (r, g);

  truncate net._calls;                              -- ignore les invitations du setup
  perform tests.as_admin(A);
  perform public.lock_race(r);

  perform tests.eq((select case when status = 'locked' then 1 else 0 end from races where id = r), 1, 'course passée en locked');
  perform tests.eq((select case when reminded_at is not null then 1 else 0 end from races where id = r), 1, 'reminded_at renseigné');
  perform tests.eq(tests.calls('invite', B), 1, 'B reçoit le rappel');
  perform tests.eq(tests.calls('invite', C), 1, 'C reçoit le rappel');
  perform tests.eq(tests.calls('invite', A), 0, 'l''admin ne se rappelle pas lui-même');
  perform tests.eq((select count(*) from net._calls), 2, 'exactement 2 rappels (pas le fantôme)');
  perform tests.eq((select count(*) from net._calls where body ->> 'title' = 'Course bientôt 🏁'), 2, 'titre du rappel');

  -- Réouverture puis re-clôture : aucun nouveau rappel (reminded_at conservé).
  perform public.reopen_race(r);
  perform tests.eq((select case when status = 'upcoming' then 1 else 0 end from races where id = r), 1, 'course rouverte en upcoming');
  truncate net._calls;
  perform public.lock_race(r);
  perform tests.eq((select count(*) from net._calls), 0, 'aucun rappel à la re-clôture');
  raise notice 'Scénario 1 (verrou + rappel unique) ✔';
end $$;

-- ═══ Scénario 2 : gel du roster — écriture interdite quand locked ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  D uuid := 'e0000000-0000-0000-0000-00000000000d';
  r uuid := 'e2000000-0000-0000-0000-000000000001';   -- réutilise la course locked du scénario 1
  pd uuid;
  denied boolean := false;
begin
  perform tests.as_admin(A);
  set local role authenticated;

  -- INSERT refusé par la RLS (with check status='upcoming').
  begin
    insert into participations (race_id, profile_id) values (r, D);
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : ajout d''un pilote possible sur une course figée'; end if;

  -- DELETE silencieusement filtré (using) → 0 ligne retirée.
  perform tests.as_admin(A);
  set local role authenticated;
  delete from participations where race_id = r and profile_id = 'e0000000-0000-0000-0000-00000000000b';
  reset role;
  perform tests.eq((select count(*) from participations where race_id = r), 4, 'roster inchangé (aucune suppression sur course figée)');

  -- Après réouverture, l'ajout redevient possible.
  perform tests.as_admin(A);
  perform public.reopen_race(r);
  perform tests.as_admin(A);
  set local role authenticated;
  insert into participations (race_id, profile_id) values (r, D) returning id into pd;
  reset role;
  perform tests.eq((select count(*) from participations where race_id = r and profile_id = D), 1, 'ajout possible une fois rouvert');
  raise notice 'Scénario 2 (gel du roster) ✔';
end $$;

-- ═══ Scénario 3 : correction dans la fenêtre 24 h (ordre inversé) ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  B uuid := 'e0000000-0000-0000-0000-00000000000b';
  C uuid := 'e0000000-0000-0000-0000-00000000000c';
  r uuid := 'e2000000-0000-0000-0000-000000000003';
  pa uuid := 'e4000000-0000-0000-0000-000000000031';
  pb uuid := 'e4000000-0000-0000-0000-000000000032';
  pc uuid := 'e4000000-0000-0000-0000-000000000033';
  elo_a1 int; elo_c1 int; elo_a2 int; elo_c2 int; sum_delta int;
begin
  insert into races (id, admin_id, circuit_id, scheduled_at)
    values (r, A, 'e1000000-0000-0000-0000-000000000001', now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);

  perform tests.as_admin(A);
  perform public.submit_race_results(r, array[pa, pb, pc]);   -- A 1er, C dernier
  perform set_config('kartsquad.elo_engine', '', true);
  select elo into elo_a1 from profiles where id = A;
  select elo into elo_c1 from profiles where id = C;
  if elo_a1 <= 1000 then raise exception 'ÉCHEC : le 1er devrait gagner de l''Elo'; end if;
  if elo_c1 >= 1000 then raise exception 'ÉCHEC : le dernier devrait perdre de l''Elo'; end if;

  -- Ancre la fenêtre dans le passé (2 h < 24 h) pour vérifier qu'une correction
  -- NE réinitialise PAS completed_at (coalesce).
  update races set completed_at = now() - interval '2 hours' where id = r;

  -- Correction : on inverse (C 1er, A dernier).
  perform tests.as_admin(A);
  perform public.correct_race_results(r, array[pc, pb, pa]);
  perform set_config('kartsquad.elo_engine', '', true);

  select elo into elo_a2 from profiles where id = A;
  select elo into elo_c2 from profiles where id = C;
  if elo_c2 <= 1000 then raise exception 'ÉCHEC : après correction, C (1er) devrait gagner'; end if;
  if elo_a2 >= 1000 then raise exception 'ÉCHEC : après correction, A (dernier) devrait perdre'; end if;

  perform tests.eq((select count(*) from results where race_id = r), 3, 'toujours 3 résultats (pas de doublon)');
  perform tests.eq((select position from results rr join participations pp on pp.id = rr.participation_id where rr.race_id = r and pp.profile_id = C), 1, 'C désormais 1er');
  perform tests.eq((select count(*) from elo_history where race_id = r), 3, 'historique ré-écrit (pas cumulé)');
  perform tests.eq((select case when completed_at = now() - interval '2 hours' then 1 else 0 end from races where id = r), 1, 'fenêtre 24 h ancrée à la validation initiale');

  select coalesce(sum(delta), 999) into sum_delta from elo_history where race_id = r;
  perform tests.eq(sum_delta::bigint, 0, 'somme nulle après correction (inscrits)');
  raise notice 'Scénario 3 (correction dans la fenêtre) ✔';
end $$;

-- ═══ Scénario 4 : correction refusée — un pilote a couru depuis ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  B uuid := 'e0000000-0000-0000-0000-00000000000b';
  D uuid := 'e0000000-0000-0000-0000-00000000000d';
  r1 uuid := 'e2000000-0000-0000-0000-000000000041';   -- course à corriger
  r2 uuid := 'e2000000-0000-0000-0000-000000000042';   -- course ultérieure de B
  p1a uuid := 'e4000000-0000-0000-0000-000000000411';
  p1b uuid := 'e4000000-0000-0000-0000-000000000412';
  p2b uuid := 'e4000000-0000-0000-0000-000000000421';
  p2d uuid := 'e4000000-0000-0000-0000-000000000422';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r1, A, now()), (r2, A, now());
  insert into participations (id, race_id, profile_id) values (p1a, r1, A), (p1b, r1, B);
  insert into participations (id, race_id, profile_id) values (p2b, r2, B), (p2d, r2, D);

  perform tests.as_admin(A);
  perform public.submit_race_results(r1, array[p1a, p1b]);
  perform set_config('kartsquad.elo_engine', '', true);
  -- r1 dans le passé, r2 « maintenant » → B a couru APRÈS r1.
  update elo_history set created_at = now() - interval '1 hour' where race_id = r1;
  update races set completed_at = now() - interval '1 hour' where id = r1;   -- toujours dans les 24 h

  perform tests.as_admin(A);
  perform public.submit_race_results(r2, array[p2b, p2d]);
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.as_admin(A);
  begin
    perform public.correct_race_results(r1, array[p1b, p1a]);
  exception when others then denied := true;
  end;
  perform set_config('kartsquad.elo_engine', '', true);
  if not denied then raise exception 'ÉCHEC : correction acceptée alors qu''un pilote a couru depuis'; end if;
  -- L'annulation a été rollbackée : r1 intact.
  perform tests.eq((select count(*) from results where race_id = r1), 2, 'course d''origine intacte après refus');
  raise notice 'Scénario 4 (correction refusée : pilote a couru depuis) ✔';
end $$;

-- ═══ Scénario 5 : correction refusée — hors fenêtre 24 h ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  B uuid := 'e0000000-0000-0000-0000-00000000000b';
  r uuid := 'e2000000-0000-0000-0000-000000000051';
  pa uuid := 'e4000000-0000-0000-0000-000000000511';
  pb uuid := 'e4000000-0000-0000-0000-000000000512';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.as_admin(A);
  perform public.submit_race_results(r, array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);

  update races set completed_at = now() - interval '25 hours' where id = r;
  perform tests.as_admin(A);
  begin
    perform public.correct_race_results(r, array[pb, pa]);
  exception when others then denied := true;
  end;
  perform set_config('kartsquad.elo_engine', '', true);
  if not denied then raise exception 'ÉCHEC : correction acceptée hors fenêtre 24 h'; end if;
  raise notice 'Scénario 5 (correction hors fenêtre) ✔';
end $$;

-- ═══ Scénario 6 : la saisie fonctionne directement depuis l'état 'locked' ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-00000000000a';
  B uuid := 'e0000000-0000-0000-0000-00000000000b';
  r uuid := 'e2000000-0000-0000-0000-000000000061';
  pa uuid := 'e4000000-0000-0000-0000-000000000611';
  pb uuid := 'e4000000-0000-0000-0000-000000000612';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.as_admin(A);
  perform public.lock_race(r);
  perform public.submit_race_results(r, array[pa, pb]);   -- saisie depuis 'locked'
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select case when status = 'completed' then 1 else 0 end from races where id = r), 1, 'course terminée depuis locked');
  perform tests.eq((select case when completed_at is not null then 1 else 0 end from races where id = r), 1, 'completed_at renseigné');
  raise notice 'Scénario 6 (saisie depuis locked) ✔';
end $$;

-- ═══ Scénario 7 : la correction rembobine les badges (anti-farming) ═══
-- Joueurs neufs E/F (jamais vainqueurs) pour isoler le badge « champagne ».
do $$
declare
  E uuid := 'e0000000-0000-0000-0000-00000000000e';   -- admin, saisit E vainqueur puis corrige
  F uuid := 'e0000000-0000-0000-0000-00000000000f';
  r uuid := 'e2000000-0000-0000-0000-000000000071';
  pe uuid := 'e4000000-0000-0000-0000-000000000711';
  pf uuid := 'e4000000-0000-0000-0000-000000000712';
begin
  insert into races (id, admin_id, scheduled_at) values (r, E, now());
  insert into participations (id, race_id, profile_id) values (pe, r, E), (pf, r, F);
  perform tests.as_admin(E);
  perform public.submit_race_results(r, array[pe, pf]);   -- E vainqueur (faux ordre favorable)
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select count(*) from user_badges where profile_id = E and badge_key = 'champagne' and race_id = r), 1, 'E (1er) décroche champagne');
  perform tests.eq((select count(*) from user_badges where profile_id = F and badge_key = 'champagne'), 0, 'F (2e) n''a pas champagne');

  update races set completed_at = now() - interval '1 hour' where id = r;   -- dans la fenêtre
  perform tests.as_admin(E);
  perform public.correct_race_results(r, array[pf, pe]);   -- correction vers la vérité : F vainqueur
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq((select count(*) from user_badges where profile_id = E and badge_key = 'champagne'), 0, 'E perd champagne après correction (anti-farming)');
  perform tests.eq((select count(*) from user_badges where profile_id = F and badge_key = 'champagne' and race_id = r), 1, 'F décroche champagne (nouveau 1er)');
  raise notice 'Scénario 7 (correction rembobine les badges) ✔';
end $$;

do $$ begin raise notice 'Tous les tests du cycle de vie de course sont passés ✔'; end $$;

rollback;
