-- Tests de la géographie des circuits (A12a) et de l'exclusion des comptes
-- suspendus du classement (décision PO 2026-07-29).

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
  ('cc000000-0000-0000-0000-00000000000a', 'a@t'),
  ('cc000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo) values
  ('cc000000-0000-0000-0000-00000000000a', 'Ayla', 1200),
  ('cc000000-0000-0000-0000-00000000000b', 'Bono', 1400);

-- Quatre repères réels, coordonnées arrondies : elles servent de distances de
-- référence, pas d'adresses.
insert into public.circuits (id, name, city, is_official, lat, lon) values
  ('cc000000-0000-0000-0000-0000000000c1', 'Kart Paris', 'Paris', true, 48.8566, 2.3522),
  ('cc000000-0000-0000-0000-0000000000c2', 'Kart Versailles', 'Versailles', true, 48.8014, 2.1301),
  ('cc000000-0000-0000-0000-0000000000c3', 'Kart Lyon', 'Lyon', true, 45.7640, 4.8357),
  ('cc000000-0000-0000-0000-0000000000c4', 'Kart Sans Adresse', 'Nulle part', true, null, null);

-- ═══ Scénario 1 : une coordonnée seule n'existe pas ═══
-- Un circuit à moitié géocodé aurait une distance NULL, donc une place
-- arbitraire dans un tri « près de moi ».
do $$
declare denied boolean := false;
begin
  begin
    update circuits set lat = 48.0 where id = 'cc000000-0000-0000-0000-0000000000c4';
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : latitude sans longitude acceptée'; end if;

  denied := false;
  begin
    update circuits set lat = 91.0, lon = 2.0 where id = 'cc000000-0000-0000-0000-0000000000c4';
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : latitude hors bornes acceptée'; end if;
  raise notice 'Scénario 1 (forme des coordonnées) ✔';
end $$;

-- ═══ Scénario 2 : la distance est juste ═══
do $$
declare d double precision;
begin
  -- Paris → Lyon : ~392 km à vol d'oiseau. On tolère 2 %, ce qui laisse passer
  -- l'approximation sphérique sans laisser passer une formule fausse.
  d := public.km_between(48.8566, 2.3522, 45.7640, 4.8357);
  if d < 384 or d > 400 then
    raise exception 'ÉCHEC : Paris–Lyon = % km (attendu ~392)', round(d::numeric, 1);
  end if;

  -- Deux points confondus : 0, et surtout PAS une erreur de domaine sur asin().
  -- C'est le cas du pilote debout sur le parking du karting.
  d := public.km_between(48.8566, 2.3522, 48.8566, 2.3522);
  if d is null or d > 0.0001 then
    raise exception 'ÉCHEC : distance à soi-même = %', d;
  end if;
  raise notice 'Scénario 2 (haversine) ✔';
end $$;

-- ═══ Scénario 3 : « près de moi » ═══
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  premier text;
begin
  perform tests.as_uid(A);

  -- Depuis Paris : Paris d'abord, Versailles ensuite, Lyon hors rayon (392 km).
  select name into premier from public.nearby_circuits(48.8566, 2.3522) limit 1;
  if premier is distinct from 'Kart Paris' then
    raise exception 'ÉCHEC : le plus proche de Paris est « % »', premier;
  end if;
  perform tests.eq((select count(*) from public.nearby_circuits(48.8566, 2.3522)), 2,
                   'Lyon est hors du rayon de 150 km');

  -- Le circuit sans coordonnées ne doit JAMAIS sortir : une liste « près de
  -- moi » qui contient un circuit dont on ignore la position est un mensonge.
  perform tests.eq((select count(*) from public.nearby_circuits(48.8566, 2.3522, 100, 20000)
                    where name = 'Kart Sans Adresse'), 0,
                   'circuit sans coordonnées exclu même à rayon maximal');

  -- Rayon élargi : Lyon rentre.
  perform tests.eq((select count(*) from public.nearby_circuits(48.8566, 2.3522, 100, 500)), 3,
                   'à 500 km, les trois circuits géocodés');

  -- Depuis Lyon, l'ordre s'inverse.
  select name into premier from public.nearby_circuits(45.7640, 4.8357, 100, 500) limit 1;
  if premier is distinct from 'Kart Lyon' then
    raise exception 'ÉCHEC : le plus proche de Lyon est « % »', premier;
  end if;

  -- Position absente ou aberrante : AUCUN résultat, surtout pas le référentiel
  -- entier trié n'importe comment sous l'étiquette « près de moi ».
  perform tests.eq((select count(*) from public.nearby_circuits(null, null)), 0,
                   'position absente : rien');
  perform tests.eq((select count(*) from public.nearby_circuits(999, 999)), 0,
                   'position hors bornes : rien');

  -- Bornes de pagination.
  perform tests.eq((select count(*) from public.nearby_circuits(48.8566, 2.3522, 1)), 1,
                   'limite respectée');
  perform tests.eq((select count(*) from public.nearby_circuits(48.8566, 2.3522, -5)), 0,
                   'limite négative : rien plutôt qu''une erreur');
  raise notice 'Scénario 3 (près de moi) ✔';
end $$;

-- ═══ Scénario 4 : la recherche porte les coordonnées ═══
-- Sans elles, afficher « à 12 km » à côté d'un résultat de recherche
-- demanderait un second aller-retour par circuit.
do $$
declare A uuid := 'cc000000-0000-0000-0000-00000000000a';
begin
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from public.search_circuits('Versailles')
                    where lat is not null and lon is not null), 1,
                   'search_circuits renvoie les coordonnées');
  raise notice 'Scénario 4 (recherche géocodée) ✔';
end $$;

-- ═══ Scénario 5 : les suspendus sortent du classement ═══
-- Et surtout : get_leaderboard et get_my_rank filtrent À L'IDENTIQUE. Si les
-- deux divergeaient, la carte « Ma position » annoncerait un rang que la liste
-- juste en dessous contredirait.
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  B uuid := 'cc000000-0000-0000-0000-00000000000b';
  r record;
begin
  insert into elo_history (profile_id, elo, delta) values (A, 1200, 0), (B, 1400, 0);

  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global')), 2, 'deux classés au départ');
  select * into r from get_my_rank('global');
  perform tests.eq(r.rank, 2, 'je suis 2e derrière Bono');
  perform tests.eq(r.total, 2, 'deux classés au total');

  -- Bono est suspendu : il quitte la liste ET le décompte.
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = B;
  perform set_config('kartsquad.moderate_suspend', '', true);

  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global')), 1, 'le suspendu quitte la liste');
  select * into r from get_my_rank('global');
  perform tests.eq(r.rank, 1, 'je remonte 1er');
  perform tests.eq(r.total, 1, 'le total suit — sinon Top X% dépasserait 100 %');

  -- Et le suspendu lui-même n'a plus de position à s'annoncer.
  perform tests.as_uid(B);
  perform tests.eq((select count(*) from get_my_rank('global')), 0,
                   'le suspendu n''a plus de rang');
  raise notice 'Scénario 5 (suspendus hors classement) ✔';
end $$;

do $$ begin raise notice 'Tous les tests géographie + suspendus sont passés ✔'; end $$;
