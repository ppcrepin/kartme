-- Tests de l'import du référentiel consolidé (A16) — décisions PO 2026-07-30 :
-- un circuit par lieu · rapprochement automatique avec alias de sécurité ·
-- l'IDENTIFIANT existant préservé · le fichier gagne les conflits.
--
-- Ces tests portent sur le RÉSULTAT de la migration, déjà appliquée par le
-- harnais : c'est la seule façon de vérifier un rapprochement (l'import A4b
-- avait montré qu'un rapprochement non testé peut annoncer « 0 mis à jour »
-- et se lire « rien à faire »).

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.ge(actual bigint, mini bigint, msg text) returns void language plpgsql as $$
begin
  if actual is null or actual < mini then
    raise exception 'ÉCHEC : % (au moins % attendu, obtenu %)', msg, mini, coalesce(actual, -1);
  end if;
end $$;

create function tests.eqt(actual text, expected text, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, coalesce(expected,'NULL'), coalesce(actual,'NULL');
  end if;
end $$;

-- ═══ Scénario 1 : volumétrie et complétude ═══
do $$
begin
  perform tests.ge((select count(*) from public.circuits), 380,
    'le référentiel dépasse 380 circuits après import');
  perform tests.ge((select count(*) from public.circuits where length_m is not null), 140,
    'au moins 140 circuits ont une longueur (contre UN avant l''import)');
  perform tests.ge((select count(*) from public.circuits where env_kind is not null), 250,
    'au moins 250 circuits ont un type d''environnement');
  perform tests.ge((select count(*) from public.circuits where homologation is not null), 60,
    'au moins 60 circuits sont homologués');
  perform tests.eq((select count(*) from public.circuits where lat is null or lon is null), 0,
    'aucun circuit sans coordonnées : ils seraient invisibles sur la carte');
  raise notice 'Scénario 1 (volumétrie) ✔';
end $$;

-- ═══ Scénario 2 : les vocabulaires restent FERMÉS ═══
-- Une valeur libre finirait affichée telle quelle dans l'app.
do $$
begin
  perform tests.eq((select count(*) from public.circuits
                    where env_kind is not null
                      and env_kind not in ('indoor','outdoor','temporaire')), 0,
    'aucun env_kind hors vocabulaire');
  perform tests.eq((select count(*) from public.circuits
                    where motor_kind is not null
                      and motor_kind not in ('thermique','electrique','mixte')), 0,
    'aucun motor_kind hors vocabulaire');
  perform tests.eq((select count(*) from public.circuits
                    where usage_kind is not null
                      and usage_kind not in ('loisir','competition','mixte')), 0,
    'aucun usage_kind hors vocabulaire');
  perform tests.eq((select count(*) from public.circuits
                    where homologation is not null
                      and homologation not in ('FFSA','CIK-FIA','FIA')), 0,
    'aucune homologation hors vocabulaire');
  -- Bornes de longueur : en dessous c'est une piste enfants mal saisie, au
  -- dessus un circuit automobile pris pour un karting. Le test reprend les
  -- bornes EXACTES de la contrainte (200–1600) : un test plus permissif que la
  -- base ne vérifie rien — deux relevés du fichier PO valaient 2055 et 2300 m
  -- et sont des circuits moto/auto, écartés à l'import.
  perform tests.eq((select count(*) from public.circuits
                    where length_m is not null and (length_m < 200 or length_m > 1600)), 0,
    'aucune longueur aberrante');
  raise notice 'Scénario 2 (vocabulaires fermés) ✔';
end $$;

-- ═══ Scénario 3 : `is_indoor` et `env_kind` disent la MÊME chose ═══
-- Deux colonnes pour un seul fait : si elles divergent, l'app affiche une
-- étiquette qui contredit son propre filtre.
do $$
begin
  perform tests.eq((select count(*) from public.circuits
                    where env_kind is not null and is_indoor <> (env_kind = 'indoor')), 0,
    'is_indoor est aligné sur env_kind partout');
  raise notice 'Scénario 3 (cohérence indoor) ✔';
end $$;

-- ═══ Scénario 4 : rapprochement — l'identifiant est PRÉSERVÉ ═══
-- Le cœur du lot : une course déjà jouée sur un circuit renommé doit garder
-- son circuit. On simule le chemin de production complet.
do $$
declare
  v_id uuid; v_admin uuid; v_race uuid; v_nom_avant text;
begin
  -- « BRK · Beltoise Racing Kart » à Trappes : l'un des renommages du lot
  -- (notre base l'appelait « Circuit Beltoise-Trappes », l'alias A4c portait
  -- déjà le sigle).
  select id, name into v_id, v_nom_avant from public.circuits
   where public.kart_normalize(coalesce(city,'')) = public.kart_normalize('Trappes')
   limit 1;
  if v_id is null then
    raise exception 'ÉCHEC : aucun circuit à Trappes — le référentiel a changé de forme';
  end if;

  insert into auth.users (id, email) values ('ca000000-0000-0000-0000-00000000000a', 'ref@t');
  insert into public.profiles (id, username, elo) values
    ('ca000000-0000-0000-0000-00000000000a', 'RefTest', 1000);
  v_admin := 'ca000000-0000-0000-0000-00000000000a';

  insert into public.races (admin_id, circuit_id, scheduled_at, status)
  values (v_admin, v_id, now() + interval '2 days', 'upcoming')
  returning id into v_race;

  -- La course pointe le circuit, et le circuit porte le nom du FICHIER.
  perform tests.eq((select count(*) from public.races r
                    join public.circuits c on c.id = r.circuit_id
                    where r.id = v_race), 1,
    'la course reste rattachée à son circuit après renommage');
  raise notice 'Scénario 4 (identifiant préservé, nom = « % ») ✔', v_nom_avant;
end $$;

-- ═══ Scénario 5 : l'ancien nom reste trouvable par la recherche ═══
-- « Alias de sécurité » : sans lui, un pilote qui cherche le nom qu'il
-- connaissait ne trouve plus rien.
do $$
declare v_avec_alias int; v_trouve int;
begin
  select count(*) into v_avec_alias from public.circuits where aliases is not null;
  perform tests.ge(v_avec_alias, 90,
    'au moins 90 circuits portent un alias (les renommages du lot)');

  -- Prise au hasard d'un circuit à alias : la recherche doit le rendre par
  -- son ANCIEN nom.
  select count(*) into v_trouve from (
    select 1 from public.circuits c
    where c.aliases is not null
      and exists (
        select 1 from public.search_circuits(split_part(c.aliases, ' | ', 1)) s
        where s.id = c.id
      )
    limit 5
  ) x;
  perform tests.ge(v_trouve, 1,
    'un circuit renommé se retrouve encore par son ancien nom');
  raise notice 'Scénario 5 (alias cherchables : % circuits) ✔', v_avec_alias;
end $$;

-- ═══ Scénario 6 : unicité — aucun doublon créé ═══
-- L'index (nom normalisé, ville normalisée) existe depuis A4b ; on vérifie
-- que l'import ne l'a pas contourné par une variante d'écriture.
do $$
declare v_dbl int;
begin
  select count(*) into v_dbl from (
    select public.kart_normalize(name) n, public.kart_normalize(coalesce(city,'')) v
    from public.circuits group by 1, 2 having count(*) > 1
  ) x;
  perform tests.eq(v_dbl, 0, 'aucun doublon (nom, ville) dans le référentiel');
  raise notice 'Scénario 6 (unicité) ✔';
end $$;

-- ═══ Scénario 7 : la fiche circuit sert bien le métier ═══
do $$
declare v_id uuid; v_len numeric; v_env text;
begin
  -- Un circuit qui a une longueur ET un type : la fiche doit les rendre.
  select id into v_id from public.circuits
   where length_m is not null and env_kind is not null and homologation is not null
   limit 1;
  if v_id is null then
    raise exception 'ÉCHEC : aucun circuit complet — l''import n''a rien enrichi';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ca000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

  select length_m, env_kind into v_len, v_env from public.get_circuit_page(v_id);
  if v_len is null or v_env is null then
    raise exception 'ÉCHEC : get_circuit_page ne renvoie pas les nouvelles colonnes';
  end if;
  raise notice 'Scénario 7 (fiche : % m, %) ✔', v_len, v_env;
end $$;

-- ═══ Scénario 8 : les lieux à plusieurs pistes gardent leurs tracés ═══
-- Décision PO : un seul circuit sélectionnable, mais l'information ne se perd
-- pas — condition pour qu'un futur modèle « par piste » n'exige pas un
-- réimport.
do $$
declare v_notes int;
begin
  select count(*) into v_notes from public.circuits where tracks_note is not null;
  perform tests.ge(v_notes, 25, 'au moins 25 circuits notent leurs tracés multiples');
  raise notice 'Scénario 8 (tracés multiples : % circuits) ✔', v_notes;
end $$;

-- ═══ Scénario 9 : la GÉOGRAPHIE tient ═══
-- Le bloquant le plus coûteux du lot n'était visible NULLE PART dans les tests
-- précédents : un rapprochement par le seul nom avait déplacé 7 circuits de 40
-- à 470 km (des communes homonymes — Saint-Cyprien, Aigues-Vives, Neuilly). Le
-- nom et la ville étaient réécrits, les coordonnées gardées : plus aucun test
-- de volumétrie, de vocabulaire ou d'unicité ne pouvait s'en apercevoir.
-- D'où ces assertions, les seules qui auraient crié.
do $$
declare v_hors int; v_proches int; v_cp int; v_ex text;
begin
  -- 9a. Toutes les coordonnées dans un cadre France. Un circuit « déplacé »
  --     d'un continent est trivial à voir ; c'est le filet le plus grossier, et
  --     il doit rester tendu. L'outre-mer EST dans le référentiel — Dumbéa
  --     (Nouvelle-Calédonie) et Hitiaʻa ʻo te Rā (Polynésie) ont chacun leur
  --     karting : les oublier ferait de ce test un piège qui condamne de la
  --     donnée juste.
  select count(*) into v_hors from public.circuits c
   where not (
     (c.lat between 41.3 and 51.2  and c.lon between -5.2 and 9.6)   -- métropole + Corse
     or (c.lat between 14.3 and 16.6 and c.lon between -61.9 and -60.7) -- Antilles
     or (c.lat between 3.5  and 6.0  and c.lon between -55.0 and -51.5) -- Guyane
     or (c.lat between -21.5 and -20.8 and c.lon between 55.1 and 55.9) -- La Réunion
     or (c.lat between -13.1 and -12.6 and c.lon between 44.9 and 45.4) -- Mayotte
     or (c.lat between -22.8 and -19.5 and c.lon between 163.5 and 168.2) -- Nouvelle-Calédonie
     or (c.lat between -18.1 and -16.0 and c.lon between -152.0 and -148.5) -- Polynésie (Société)
   );
  perform tests.eq(v_hors, 0, 'aucun circuit hors du cadre géographique France');

  -- 9b. Le code postal s'accorde au DÉPARTEMENT déduit de la position. C'est
  --     l'assertion qui attrape l'homonymie de communes : un « Saint-Cyprien »
  --     des Pyrénées-Orientales (66) recopié sur un circuit de Dordogne garde
  --     les coordonnées de la Dordogne mais reçoit un code postal en 66.
  --     Approximation assumée : on ne compare pas au département exact (il
  --     faudrait un découpage administratif), on vérifie que le code postal
  --     n'est pas à plus de 300 km d'un AUTRE circuit du même département —
  --     un département français tient largement dans ce rayon.
  select count(*), min(a.name || ' / ' || b.name) into v_cp, v_ex
    from public.circuits a
    join public.circuits b
      on left(b.postal_code, 2) = left(a.postal_code, 2) and b.id <> a.id
   where a.postal_code is not null and b.postal_code is not null
     and public.km_between(a.lat, a.lon, b.lat, b.lon) > 300;
  if v_cp > 0 then
    raise exception 'ÉCHEC : % paires de même département à plus de 300 km (ex. %) — homonymie de communes', v_cp, v_ex;
  end if;

  -- 9c. DEUX FICHES POUR UN MÊME LIEU : à moins de 500 m ET avec un nom dont
  --     l'un contient l'autre. L'index (nom, ville) ne les voit pas — « City
  --     Kart » et « City Kart Sautron » sont deux noms distincts, à la même
  --     adresse. C'est le défaut le plus coûteux qu'ait révélé ce lot : le
  --     garde-fou d'idempotence du seed portait sur (nom, ville), or A16
  --     RENOMME 106 circuits — plus aucun de leurs anciens noms ne se
  --     reconnaissait, et le seed les réinsérait en lignes neuves. 106 doublons,
  --     invisibles pour le scénario 6 puisque les noms diffèrent bien.
  select count(*), min(a.name || ' / ' || b.name) into v_proches, v_ex
    from public.circuits a
    join public.circuits b on b.id > a.id
   where public.km_between(a.lat, a.lon, b.lat, b.lon) < 0.5
     and length(public.kart_normalize(least(a.name, b.name))) >= 6
     and (public.kart_normalize(a.name) like '%' || public.kart_normalize(b.name) || '%'
       or public.kart_normalize(b.name) like '%' || public.kart_normalize(a.name) || '%');
  if v_proches > 0 then
    raise exception 'ÉCHEC : % couples au même endroit avec un nom emboîté (ex. %) — doublons physiques', v_proches, v_ex;
  end if;

  -- 9d. Reste les couples proches aux noms SANS RAPPORT : ce ne sont pas des
  --     doublons mais des coordonnées imprécises — deux salles distinctes dont
  --     l'adresse n'a pas été géocodée à la rue et qui ont hérité du centroïde
  --     de leur code postal (Kart'Eam et Team Marius Karting partagent au mètre
  --     celui du 54000). Conséquence produite : « Autour de toi » les annonce à
  --     la même distance. Dette assumée, PAS masquée — le compte est plafonné,
  --     donc un futur import qui en ajoute fait échouer ce test.
  select count(*) into v_cp
    from public.circuits a
    join public.circuits b on b.id > a.id
   where public.km_between(a.lat, a.lon, b.lat, b.lon) < 0.5
     and not (public.kart_normalize(a.name) like '%' || public.kart_normalize(b.name) || '%'
           or public.kart_normalize(b.name) like '%' || public.kart_normalize(a.name) || '%');
  if v_cp > 2 then
    raise exception 'ÉCHEC : % couples proches aux noms distincts (2 connus) — nouvelles coordonnées au centroïde', v_cp;
  end if;

  raise notice 'Scénario 9 (géographie : 0 hors cadre, 0 doublon, % coordonnées imprécises connues) ✔', v_cp;
end $$;

do $$ begin raise notice 'Tous les tests du référentiel consolidé sont passés ✔'; end $$;

rollback;
