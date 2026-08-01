-- La recherche de pilotes trouve ce qu'on tape RÉELLEMENT (2026-08-01).
--
-- Depuis que la grille se remplit dans un champ unique, `search_pilots` est le
-- seul chemin vers un pilote inscrit qui n'est pas déjà notre ami. Une réponse
-- vide n'est plus une gêne : l'écran en conclut que personne ne porte ce nom,
-- et propose d'ajouter un INVITÉ homonyme — qui n'échange aucun point Elo.
-- Chaque scénario ci-dessous est donc un fantôme évité.

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
  ('d0000000-0000-0000-0000-0000000000a1', 'moi@t'),
  ('d0000000-0000-0000-0000-0000000000a2', 'kevin@t'),
  ('d0000000-0000-0000-0000-0000000000a3', 'sophie@t'),
  ('d0000000-0000-0000-0000-0000000000a4', 'noel@t');
insert into public.profiles (id, username, elo) values
  ('d0000000-0000-0000-0000-0000000000a1', 'Moi_R', 1000),
  ('d0000000-0000-0000-0000-0000000000a2', 'Kévin_R', 1000),
  ('d0000000-0000-0000-0000-0000000000a3', 'Sophie_K', 1000),
  ('d0000000-0000-0000-0000-0000000000a4', 'Noël', 1000);

do $$
declare
  moi uuid := 'd0000000-0000-0000-0000-0000000000a1';
begin
  perform tests.as_uid(moi);

  -- 1. LE cas : on tape sans accent, le pilote en a un.
  perform tests.eq((select count(*) from public.search_pilots('kevin')), 1,
    '« kevin » trouve « Kévin_R » — personne ne tape l''accent');
  perform tests.eq((select count(*) from public.search_pilots('KEVIN')), 1,
    'et la casse ne change rien non plus');
  perform tests.eq((select count(*) from public.search_pilots('noel')), 1,
    '« noel » trouve « Noël »');

  -- 2. L'inverse doit marcher aussi : on tape l'accent, le pseudo n'en a pas.
  --    (Le repli s'applique des DEUX côtés, pas seulement sur la donnée.)
  perform tests.eq((select count(*) from public.search_pilots('Kévin')), 1,
    'la saisie accentuée trouve toujours');

  -- 3. Les séparateurs tombent : « sophie k » et « Sophie_K » désignent le
  --    même pilote, ce que l'ancien `ilike` refusait.
  perform tests.eq((select count(*) from public.search_pilots('sophie k')), 1,
    '« sophie k » trouve « Sophie_K »');
  perform tests.eq((select count(*) from public.search_pilots('sophiek')), 1,
    'et la forme collée aussi');

  -- 4. Une saisie n'est plus un motif LIKE : « _ » ne joue plus le joker.
  --    Avant, « Sophie_K » aurait aussi remonté un « SophieXK ».
  perform tests.eq((select count(*) from public.search_pilots('%')), 0,
    'un « % » seul ne remonte pas tout le monde');
  perform tests.eq((select count(*) from public.search_pilots('...')), 0,
    'une saisie sans lettre ni chiffre ne remonte personne');

  -- 5. Ce qui ne doit PAS changer : on ne se trouve pas soi-même, et un nom
  --    qui n'existe pas ne trouve rien (c'est ce qui autorise la ligne
  --    « ajouter comme invité »).
  perform tests.eq((select count(*) from public.search_pilots('moi')), 0,
    'on ne se propose pas à soi-même');
  perform tests.eq((select count(*) from public.search_pilots('Tonton Robert')), 0,
    'un inconnu reste introuvable — la ligne « invité » a bien sa raison d''être');

  raise notice 'Recherche de pilotes : accents, casse, séparateurs, jokers ✔';
end $$;

-- 6. Les exclusions de sécurité tiennent toujours. Un `create or replace` qui
--    les perdrait ne se verrait à l'écran qu'au moment où un compte suspendu
--    réapparaît dans une recherche — c'est-à-dire bien trop tard.
--    (La suspension et la suppression passent par des déclencheurs qui
--    refusent l'écriture directe : on les pose donc en contournant la session
--    authentifiée, comme le fait la modération.)
do $$
declare
  moi uuid := 'd0000000-0000-0000-0000-0000000000a1';
  kev uuid := 'd0000000-0000-0000-0000-0000000000a2';
begin
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update public.profiles set suspended_at = now() where id = kev;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(moi);
  perform tests.eq((select count(*) from public.search_pilots('kevin')), 0,
    'un compte suspendu ne se cherche plus');

  perform set_config('kartsquad.moderate_suspend', '1', true);
  update public.profiles set suspended_at = null where id = kev;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(moi);
  perform tests.eq((select count(*) from public.search_pilots('kevin')), 1,
    'et il réapparaît une fois la suspension levée');

  insert into public.blocks (blocker_id, blocked_id) values (kev, moi);
  perform tests.eq((select count(*) from public.search_pilots('kevin')), 0,
    'qui nous a bloqué reste invisible');

  raise notice 'Exclusions de sécurité préservées par le remplacement ✔';
end $$;

rollback;
