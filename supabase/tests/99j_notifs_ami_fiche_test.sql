-- Les notifications d'amitié mènent à la FICHE du pilote (C5, 2026-08-01).
--
-- L'onglet Amis a fusionné dans le classement : « Kévin veut t'ajouter »
-- déposait sur un écran de liste où il fallait retrouver Kévin. En pointant sa
-- fiche, le bouton « Accepter » est sous le doigt à l'ouverture.
--
-- Ces tests épinglent l'URL — c'est un contrat entre la base et trois
-- consommateurs (la boîte in-app, `routeFor`, le service worker) — et
-- vérifient que la DÉDUPLICATION n'a pas changé de comportement au passage :
-- l'index porte sur (destinataire, type, url, acteur) parmi les non-lues, et
-- la nouvelle URL est une fonction de l'acteur, donc la partition est la même.

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
    raise exception 'ÉCHEC : % (attendu « % », obtenu « % »)', msg, expected, actual;
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000001', 'kevin@t'),
  ('a9000000-0000-0000-0000-000000000002', 'moi@t');
insert into public.profiles (id, username, elo) values
  ('a9000000-0000-0000-0000-000000000001', 'Kevin_N', 1000),
  ('a9000000-0000-0000-0000-000000000002', 'Moi_N', 1000);

-- ═══ Scénario 1 : la demande pointe la fiche du DEMANDEUR ═══
do $$
declare
  kevin uuid := 'a9000000-0000-0000-0000-000000000001';
  moi   uuid := 'a9000000-0000-0000-0000-000000000002';
begin
  perform tests.as_uid(kevin);
  insert into public.friendships (requester_id, addressee_id, status)
  values (kevin, moi, 'pending');

  -- C'est la fiche de Kévin qui porte « Accepter » : y déposer, c'est un geste
  -- au lieu de trois.
  perform tests.eqt(
    (select url from public.notifications where profile_id = moi and type = 'friend_request'),
    'pilot/' || kevin,
    'la demande mène à la fiche du demandeur');
  raise notice 'Scénario 1 (demande → fiche du demandeur) ✔';
end $$;

-- ═══ Scénario 2 : l'acceptation pointe la fiche de CELUI QUI A ACCEPTÉ ═══
do $$
declare
  kevin uuid := 'a9000000-0000-0000-0000-000000000001';
  moi   uuid := 'a9000000-0000-0000-0000-000000000002';
begin
  perform tests.as_uid(moi);
  update public.friendships set status = 'accepted'
   where requester_id = kevin and addressee_id = moi;

  -- Kévin va voir l'Elo de celui qui vient de l'accepter, pas une liste où il
  -- faudrait le chercher.
  perform tests.eqt(
    (select url from public.notifications where profile_id = kevin and type = 'friend_request'),
    'pilot/' || moi,
    'l''acceptation mène à la fiche de celui qui a accepté');
  raise notice 'Scénario 2 (acceptation → fiche de l''accepteur) ✔';
end $$;

-- ═══ Scénario 3 : la déduplication n'a pas changé de comportement ═══
do $$
declare
  kevin uuid := 'a9000000-0000-0000-0000-000000000001';
  moi   uuid := 'a9000000-0000-0000-0000-000000000002';
  v_avant bigint;
begin
  -- L'index de déduplication porte sur (destinataire, type, url, acteur) parmi
  -- les NON-LUES. La nouvelle URL est une fonction de l'acteur : la partition
  -- est donc strictement la même qu'avec l'ancienne constante « amis ». Deux
  -- demandes du même pilote ne doivent toujours faire qu'UNE ligne.
  delete from public.friendships where requester_id = kevin and addressee_id = moi;
  select count(*) into v_avant from public.notifications
   where profile_id = moi and type = 'friend_request' and actor_id = kevin;

  perform tests.as_uid(kevin);
  insert into public.friendships (requester_id, addressee_id, status)
  values (kevin, moi, 'pending');
  delete from public.friendships where requester_id = kevin and addressee_id = moi;
  insert into public.friendships (requester_id, addressee_id, status)
  values (kevin, moi, 'pending');

  perform tests.eq(
    (select count(*) from public.notifications
      where profile_id = moi and type = 'friend_request' and actor_id = kevin and read_at is null),
    1,
    'deux demandes du même pilote ne font toujours qu''une ligne non lue');
  raise notice 'Scénario 3 (déduplication inchangée) ✔';
end $$;

rollback;
