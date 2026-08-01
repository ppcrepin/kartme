-- LE PARCOURS DU NOUVEAU VENU, de bout en bout (lot 3.4, avant la beta).
--
-- Tous les tests du dépôt vérifient une brique. Celui-ci vérifie la CHAÎNE :
-- ce qu'un testeur va réellement vivre le premier soir, dans l'ordre, sans
-- qu'aucune étape ne soit simulée. Si une seule marche cède, ce n'est pas un
-- bug qu'on corrige en v2 — c'est un testeur qui n'ouvre plus l'app.
--
--   1. Marc partage son lien d'ami.
--   2. Léa s'inscrit et l'accepte d'un tap → ils sont amis, Marc est prévenu.
--   3. Marc crée une course et l'y ajoute.
--   4. Léa la voit sur son accueil et rejoint.
--   5. Marc saisit le classement → Elo échangé, badges, notifications.
--   6. Léa retrouve sa course, ses points, son grade, son fil.
--
-- Ce que ce test NE couvre pas, et qu'il faut dire : l'inscription elle-même
-- (Supabase Auth) et l'affichage. Les 38 tests navigateur couvrent le second ;
-- le premier ne se teste qu'en vrai.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.eqt(actual text, expected text, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, coalesce(expected,'NULL'), coalesce(actual,'NULL');
  end if;
end $$;

create function tests.vrai(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', msg; end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

-- MARC, l'hôte qui invite. LÉA, la nouvelle venue.
-- PAUL, un troisième pour que la course ait un vrai plateau.
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-0000000000a1', 'marc@t'),
  ('c0000000-0000-0000-0000-0000000000a2', 'lea@t'),
  ('c0000000-0000-0000-0000-0000000000a3', 'paul@t');
insert into public.profiles (id, username, elo) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Marc_R', 1000),
  ('c0000000-0000-0000-0000-0000000000a3', 'Paul_K', 1000);

-- ═══ Étape 1-2 : Léa arrive par le lien de Marc ═══
do $$
declare
  marc uuid := 'c0000000-0000-0000-0000-0000000000a1';
  lea  uuid := 'c0000000-0000-0000-0000-0000000000a2';
begin
  -- Elle vient de créer son compte (ce que fait Supabase Auth à l'inscription).
  insert into public.profiles (id, username, elo) values (lea, 'Lea_M', 1000);

  perform tests.as_uid(lea);
  -- Elle voit QUI l'invite avant de décider.
  perform tests.eqt((select username from public.get_inviter(marc)), 'Marc_R',
    'Léa voit le pseudo de Marc avant d''accepter');

  perform tests.eqt(public.accept_friend_invite(marc), 'ok', 'un tap suffit');
  perform tests.eq((select count(*) from friendships
                    where status = 'accepted'
                      and ((requester_id = lea and addressee_id = marc)
                        or (requester_id = marc and addressee_id = lea))), 1,
    'ils sont amis, sans aller-retour de validation');

  -- Marc DOIT être prévenu, sinon il ne sait jamais que son lien fonctionne —
  -- et il n'en partage pas d'autre.
  perform tests.eq((select count(*) from notifications
                    where profile_id = marc and actor_id = lea
                      and type = 'friend_request'), 1,
    'Marc est prévenu que son lien a converti');
  raise notice 'Étapes 1-2 (lien d''ami → amitié + notification) ✔';
end $$;

-- ═══ Étape 3-4 : la course ═══
do $$
declare
  marc uuid := 'c0000000-0000-0000-0000-0000000000a1';
  lea  uuid := 'c0000000-0000-0000-0000-0000000000a2';
  paul uuid := 'c0000000-0000-0000-0000-0000000000a3';
  circ uuid;
  r    uuid := 'c0200000-0000-0000-0000-000000000001';
begin
  -- Marc choisit un karting DU RÉFÉRENTIEL (il ne peut plus en inventer un).
  select id into circ from public.circuits where is_official limit 1;
  perform tests.vrai(circ is not null, 'le référentiel contient au moins un karting');

  perform tests.as_uid(marc);
  insert into races (id, admin_id, circuit_id, scheduled_at, status)
  values (r, marc, circ, now() + interval '1 day', 'upcoming');

  -- Marc s'inscrit et ajoute Paul ; Léa, elle, REJOINT d'elle-même depuis son
  -- accueil — c'est le geste qu'on attend d'une nouvelle venue.
  insert into participations (race_id, profile_id) values (r, marc), (r, paul);
  perform tests.as_uid(lea);
  -- Avec le jeton du lien que Marc lui a envoyé : rejoindre sans invitation
  -- n'est plus possible (décision PO « seul l'admin invite », 2026-08-01).
  perform public.join_race(r, (select invite_token::text from races where id = r));
  perform tests.eq((select count(*) from participations where race_id = r), 3,
    'Léa a rejoint la course elle-même');

  -- Et la course apparaît bien chez elle : l'accueil liste les courses où l'on
  -- est INSCRIT, pas seulement celles qu'on administre (défaut corrigé au lot
  -- A15 — sans quoi une nouvelle venue voyait un accueil vide après avoir
  -- rejoint).
  perform tests.eq((select count(*) from participations pp
                    join races ra on ra.id = pp.race_id
                    where pp.profile_id = lea and ra.status = 'upcoming'), 1,
    'la course figure bien parmi les siennes');
  raise notice 'Étapes 3-4 (course créée, Léa rejoint) ✔';
end $$;

-- ═══ Étape 5 : le classement, et tout ce qu'il déclenche ═══
do $$
declare
  marc uuid := 'c0000000-0000-0000-0000-0000000000a1';
  lea  uuid := 'c0000000-0000-0000-0000-0000000000a2';
  paul uuid := 'c0000000-0000-0000-0000-0000000000a3';
  r    uuid := 'c0200000-0000-0000-0000-000000000001';
  p_marc uuid; p_lea uuid; p_paul uuid;
  v_elo_lea int;
begin
  select id into p_marc from participations where race_id = r and profile_id = marc;
  select id into p_lea  from participations where race_id = r and profile_id = lea;
  select id into p_paul from participations where race_id = r and profile_id = paul;

  -- Léa gagne sa première course. Le scénario le plus favorable au produit :
  -- si CELUI-là casse, la beta est morte le premier soir.
  perform tests.as_uid(marc);
  perform public.submit_race_results(r, array[p_lea, p_marc, p_paul], '{}');
  perform set_config('kartsquad.elo_engine', '', true);

  -- L'Elo a bougé, et la somme reste nulle (socle de l'anti-triche).
  select elo into v_elo_lea from profiles where id = lea;
  perform tests.vrai(v_elo_lea > 1000, 'Léa a gagné des points en gagnant');
  perform tests.eq((select coalesce(sum(elo_delta), 0) from results where race_id = r), 0,
    'la somme des points échangés est nulle');

  -- Elle est en CALIBRATION : son K est doublé, donc son gain est franc — c'est
  -- voulu, un nouveau doit trouver sa place vite.
  perform tests.vrai(v_elo_lea - 1000 > 30,
    'en calibration, le gain est net (K doublé) — sinon un nouveau stagne');

  -- Ses badges de première course sont là : c'est la récompense qui donne
  -- envie de revenir.
  perform tests.vrai(
    (select count(*) from user_badges where profile_id = lea and race_id = r) >= 2,
    'Léa décroche ses premiers badges');
  perform tests.eq((select count(*) from user_badges
                    where profile_id = lea and badge_key = 'champagne'), 1,
    'dont « Champagne » pour sa victoire');

  -- Son historique est écrit, avec le drapeau d'abandon (à false ici).
  perform tests.eq((select count(*) from elo_history where profile_id = lea and race_id = r), 1,
    'sa progression est enregistrée');
  perform tests.eq((select count(*) from elo_history
                    where profile_id = lea and race_id = r and dnf), 0,
    'et elle n''est pas marquée « abandon »');
  raise notice 'Étape 5 (classement → Elo, badges, historique) ✔';
end $$;

-- ═══ Étape 6 : ce que Léa retrouve dans l'app ═══
do $$
declare
  marc uuid := 'c0000000-0000-0000-0000-0000000000a1';
  lea  uuid := 'c0000000-0000-0000-0000-0000000000a2';
  r    uuid := 'c0200000-0000-0000-0000-000000000001';
  v_rang bigint; v_total bigint;
begin
  perform tests.as_uid(lea);

  -- Sa position dans le classement Amis. `get_my_rank` ne doit RIEN renvoyer
  -- si le pilote n'a pas couru — elle vient de courir, donc elle a un rang.
  select rank, total into v_rang, v_total from public.get_my_rank('friends');
  perform tests.vrai(v_rang is not null, 'Léa a une position au classement');
  perform tests.vrai(v_rang <= v_total, 'et son rang tient dans le total (Top X% ≤ 100 %)');

  -- Elle se voit dans la liste, une seule fois.
  perform tests.eq((select count(*) from public.get_leaderboard('friends') where is_me), 1,
    'elle figure une fois dans le classement Amis');

  -- Le détail de sa course est lisible (c'est l'écran qu'elle partagera).
  perform tests.eq((select count(*) from results where race_id = r), 3,
    'les trois pilotes figurent au résultat');

  -- Et son fil d'actualité s'est peuplé : c'est ce qui la ramène demain.
  perform tests.vrai((select count(*) from public.get_feed(null, 20)) >= 1,
    'son fil « Ça bouge » n''est pas vide après sa première course');

  -- Côté Marc, la course de son amie apparaît aussi.
  perform tests.as_uid(marc);
  perform tests.vrai((select count(*) from public.get_feed(null, 20)) >= 1,
    'Marc voit passer l''activité de Léa');
  raise notice 'Étape 6 (classement, résultats, fil d''actualité) ✔';
end $$;

do $$ begin
  raise notice 'PARCOURS COMPLET DU NOUVEAU VENU : chaîne vérifiée de bout en bout ✔';
end $$;

rollback;
