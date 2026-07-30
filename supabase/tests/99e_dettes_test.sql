-- Dettes du vérificateur, soldées le 2026-07-30.
--
-- Ces trois défauts avaient un point commun : l'INTERFACE se comportait
-- correctement, et c'est l'API qui laissait passer. Aucun clic ne pouvait les
-- révéler — d'où des tests qui attaquent la base directement.

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

create function tests.leve(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
    raise exception 'ÉCHEC : % (aucune exception levée)', msg;
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- A = admin des courses, B = un second pilote.
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-00000000000a', 'a@t'),
  ('da000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo) values
  ('da000000-0000-0000-0000-00000000000a', 'AdminA', 1000),
  ('da000000-0000-0000-0000-00000000000b', 'PiloteB', 1000);

-- ═══ Scénario 1 : une course TERMINÉE ne se supprime plus par l'API ═══
-- L'Elo est appliqué à la saisie du classement. Supprimer la course efface la
-- course, ses résultats et son `elo_history` — mais PAS les points, qui vivent
-- dans `profiles.elo`. Chacun garderait ses gains sans qu'aucune trace ne les
-- explique : classement inauditable, et le perdant qui reperd garde ses points.
do $$
declare
  A uuid := 'da000000-0000-0000-0000-00000000000a';
  B uuid := 'da000000-0000-0000-0000-00000000000b';
  r uuid := 'da200000-0000-0000-0000-000000000001';
  pa uuid := 'da400000-0000-0000-0000-000000000001';
  pb uuid := 'da400000-0000-0000-0000-000000000002';
  v_reste int;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.as_uid(A);
  perform public.submit_race_results(r, array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);

  -- L'admin tente de supprimer SA course, désormais terminée.
  perform tests.as_uid(A);
  set local role authenticated;
  delete from races where id = r;   -- la RLS n'autorise plus aucune ligne
  reset role;

  select count(*) into v_reste from races where id = r;
  perform tests.eq(v_reste, 1, 'une course TERMINÉE survit à la tentative de suppression');
  raise notice 'Scénario 1 (course terminée protégée) ✔';
end $$;

-- ═══ Scénario 1bis : ce qui est légitime reste possible ═══
-- Une garde trop large serait pire que le trou : à l'inscription et au verrou,
-- aucun point n'a été échangé, il n'y a rien à défaire.
do $$
declare
  A uuid := 'da000000-0000-0000-0000-00000000000a';
  r1 uuid := 'da200000-0000-0000-0000-000000000002';
  r2 uuid := 'da200000-0000-0000-0000-000000000003';
  v_reste int;
begin
  insert into races (id, admin_id, scheduled_at, status) values
    (r1, A, now() + interval '2 days', 'upcoming'),
    (r2, A, now() + interval '3 days', 'locked');
  perform tests.as_uid(A);
  set local role authenticated;
  delete from races where id in (r1, r2);
  reset role;

  select count(*) into v_reste from races where id in (r1, r2);
  perform tests.eq(v_reste, 0, 'une course à venir ou verrouillée reste supprimable');
  raise notice 'Scénario 1bis (suppression légitime préservée) ✔';
end $$;

-- ═══ Scénario 1ter : la MODÉRATION passe toujours ═══
-- `moderate_delete_race` est `security definer` : elle contourne la RLS ET
-- rembobine l'Elo. C'est la seule voie légitime pour effacer une course jouée,
-- et elle devait le rester — une garde qui l'aurait bloquée aurait privé la
-- modération de son seul outil contre une course truquée.
do $$
declare
  C uuid := 'da000000-0000-0000-0000-00000000000c';
  D uuid := 'da000000-0000-0000-0000-00000000000d';
  M uuid := 'da000000-0000-0000-0000-00000000000e';
  r uuid := 'da200000-0000-0000-0000-000000000004';
  pa uuid := 'da400000-0000-0000-0000-000000000003';
  pb uuid := 'da400000-0000-0000-0000-000000000004';
  v_reste int;
begin
  insert into auth.users (id, email) values (M, 'm@t'), (C, 'c@t'), (D, 'd@t');
  insert into public.profiles (id, username, elo, is_moderator) values (M, 'Mod', 1000, true);
  -- Pilotes NEUFS : `moderate_delete_race` refuse (à juste titre) de rembobiner
  -- l'Elo d'un pilote qui a couru depuis. Réutiliser ceux du scénario 1 faisait
  -- échouer le test sur une garde parfaitement saine.
  insert into public.profiles (id, username, elo) values (C, 'PiloteC', 1000), (D, 'PiloteD', 1000);

  insert into races (id, admin_id, scheduled_at) values (r, C, now());
  insert into participations (id, race_id, profile_id) values (pa, r, C), (pb, r, D);
  perform tests.as_uid(C);
  perform public.submit_race_results(r, array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.as_uid(M);
  perform public.moderate_delete_race(r);
  select count(*) into v_reste from races where id = r;
  perform tests.eq(v_reste, 0, 'la modération supprime encore une course jouée');
  raise notice 'Scénario 1ter (modération intacte) ✔';
end $$;

-- ═══ Scénario 2 : une amitié acceptée ne redevient pas une demande ═══
-- Rien n'encadrait l'UPDATE : on pouvait faire osciller la relation en boucle,
-- et chaque bascule refait passer le déclencheur de notification. Aucun geste
-- du produit ne dé-accepte une amitié — on reste amis, ou on la supprime.
do $$
declare
  A uuid := 'da000000-0000-0000-0000-00000000000a';
  B uuid := 'da000000-0000-0000-0000-00000000000b';
  f uuid;
begin
  insert into friendships (requester_id, addressee_id, status)
  values (A, B, 'accepted') returning id into f;

  perform tests.leve(
    format('update public.friendships set status = ''pending'' where id = %L', f),
    'une amitié acceptée ne peut pas revenir en attente');

  -- Le sens NORMAL, lui, doit continuer de passer.
  update public.friendships set status = 'pending' where id <> f and false;  -- no-op
  delete from friendships where id = f;
  insert into friendships (requester_id, addressee_id, status)
  values (A, B, 'pending') returning id into f;
  update public.friendships set status = 'accepted' where id = f;
  perform tests.eq((select count(*) from friendships where id = f and status = 'accepted'), 1,
    'accepter une demande en attente fonctionne toujours');
  raise notice 'Scénario 2 (transition d''amitié verrouillée) ✔';
end $$;

-- ═══ Scénario 3 : une portée NULL LÈVE, au lieu de retomber sur « amis » ═══
-- `p_scope not in ('friends','global')` vaut NULL sur une portée NULL, et une
-- garde qui s'évalue à NULL ne se déclenche pas. Même mécanique que le CHECK à
-- trois états attrapé au lot A12a.
do $$
declare A uuid := 'da000000-0000-0000-0000-00000000000a';
begin
  perform tests.as_uid(A);
  perform tests.leve(
    'select * from public.get_leaderboard(null)',
    'get_leaderboard(NULL) lève au lieu de retomber sur « amis »');
  perform tests.leve(
    'select * from public.get_my_rank(null)',
    'get_my_rank(NULL) lève aussi — les deux se modifient ensemble');
  -- Et une portée inconnue non nulle continue de lever, comme avant.
  perform tests.leve(
    'select * from public.get_leaderboard(''univers'')',
    'une portée inconnue lève toujours');
  -- Les portées valides, elles, répondent — et je m'y trouve exactement une
  -- fois. Compter TOUTES les lignes serait fragile : le scénario 2 a laissé une
  -- amitié acceptée derrière lui, et le total dépend donc d'un test voisin.
  perform tests.eq((select count(*) from public.get_leaderboard('friends') where is_me), 1,
    'la portée « amis » répond normalement et me contient une fois');
  perform tests.eq((select count(*) from public.get_my_rank('global')), 1,
    'la portée « global » répond aussi');
  raise notice 'Scénario 3 (garde de portée réellement gardienne) ✔';
end $$;

do $$ begin raise notice 'Toutes les dettes du vérificateur sont soldées ✔'; end $$;

rollback;
