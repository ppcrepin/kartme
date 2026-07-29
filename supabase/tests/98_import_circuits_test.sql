-- Réconciliation du référentiel de circuits (import des kartings de France).
--
-- Ce test existe à cause d'un bug qui a traversé la relecture : dans le DELETE
-- des circuits fictifs, `kart_normalize` n'était appliqué QUE du côté gauche.
-- Les littéraux bruts de droite ne pouvaient donc jamais correspondre, rien
-- n'était supprimé, et le bilan affichait « 0 supprimé » — ce qui se lit
-- « rien à faire » alors que cela voulait dire « rien n'a marché ».
--
-- Aucun test ne pouvait le voir : `run.sh` applique les migrations sur une
-- base VIDE, donc la réconciliation ne rencontrait jamais un seul circuit.
-- D'où la mise en fonction (`reconcile_legacy_circuits`) : un chemin de mise à
-- niveau qu'on ne peut pas appeler est un chemin qu'on ne peut pas tester.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

-- On repart d'une base dans l'état de la PRODUCTION d'avant l'import : le
-- référentiel importé est retiré, l'ancien seed est remis.
delete from public.circuits;

insert into auth.users (id, email) values ('dd000000-0000-0000-0000-00000000000a', 'a@t');
insert into public.profiles (id, username, elo) values
  ('dd000000-0000-0000-0000-00000000000a', 'Dina', 1000);

-- Le seed d'origine, mot pour mot (commit aafe868) : noms approximatifs, pas
-- une seule coordonnée.
insert into public.circuits (name, city, is_official) values
  ('Racing Kart de Cormeilles', 'Cormeilles-en-Vexin', true),
  ('Le Mans Karting International', 'Le Mans', true),
  ('Circuit Paul Ricard Karting', 'Le Castellet', true),
  ('Karting de Salbris', 'Salbris', true),
  ('Karting d''Angerville', 'Angerville', true),
  ('Kart''Up Paris', 'Paris', true),
  ('Karting de Trappes', 'Trappes', true),
  ('RKC Roubaix', 'Roubaix', true),
  ('Karting de Mornant', 'Mornant', true),
  ('Speed Park Lyon', 'Lyon', true),
  ('Kart Indoor Villebon', 'Villebon-sur-Yvette', true),
  ('Karting d''Aix-en-Provence', 'Aix-en-Provence', true),
  ('Circuit de Lavilledieu', 'Lavilledieu', true),
  ('Karting d''Ancenis', 'Ancenis', true),
  ('Kart''in Wittelsheim', 'Wittelsheim', true),
  ('Karting de Bordeaux Mérignac', 'Mérignac', true),
  ('Karting de Nantes', 'Nantes', true),
  ('Karting de Toulouse', 'Toulouse', true),
  ('Karting de Biscarrosse', 'Biscarrosse', true),
  ('Karting de Fontenay-le-Comte', 'Fontenay-le-Comte', true),
  ('Karting du Val d''Argenton', 'Argenton-les-Vallées', true),
  ('Circuit de Croix-en-Ternois', 'Croix-en-Ternois', true),
  ('Karting de Dijon-Prenois', 'Prenois', true),
  ('Karting de Muret', 'Muret', true);

-- Deux courses déjà jouées : l'une sur un circuit qui sera FUSIONNÉ, l'autre
-- sur un circuit qui sera SUPPRIMÉ. C'est tout l'enjeu de la manœuvre.
insert into public.races (id, admin_id, circuit_id, scheduled_at, status)
select 'dd000000-0000-0000-0000-0000000000f1', 'dd000000-0000-0000-0000-00000000000a',
       c.id, now() - interval '2 days', 'completed'
  from public.circuits c where c.name = 'Karting de Nantes';
insert into public.races (id, admin_id, circuit_id, scheduled_at, status)
select 'dd000000-0000-0000-0000-0000000000f2', 'dd000000-0000-0000-0000-00000000000a',
       c.id, now() - interval '1 day', 'completed'
  from public.circuits c where c.name = 'Karting de Toulouse';

-- ═══ Scénario 1 : la réconciliation fait ce qu'elle annonce ═══
do $$
declare
  r record;
  v_circuit_avant uuid;
  v_circuit_apres uuid;
  v_nom text;
begin
  select circuit_id into v_circuit_avant from public.races
   where id = 'dd000000-0000-0000-0000-0000000000f1';

  select * into r from public.reconcile_legacy_circuits();

  perform tests.eq(r.fusionnes, 12, 'douze circuits fusionnés');
  perform tests.eq(r.supprimes, 12, 'douze circuits fictifs supprimés');
  perform tests.eq(r.courses_orphelines, 1,
                   'une course pointait sur un circuit fictif — et le bilan le dit');

  -- (a) La course sur circuit FUSIONNÉ garde son circuit, qui a maintenant son
  --     vrai nom et des coordonnées. C'est pour cela qu'on met à jour en place
  --     au lieu de supprimer puis réinsérer.
  select circuit_id into v_circuit_apres from public.races
   where id = 'dd000000-0000-0000-0000-0000000000f1';
  if v_circuit_apres is distinct from v_circuit_avant then
    raise exception 'ÉCHEC : la course a changé de circuit pendant la fusion';
  end if;
  select name into v_nom from public.circuits where id = v_circuit_apres;
  if v_nom <> 'Le Karting' then
    raise exception 'ÉCHEC : le circuit fusionné s''appelle « % »', v_nom;
  end if;
  perform tests.eq((select count(*) from public.circuits
                    where id = v_circuit_apres and lat is not null and lon is not null),
                   1, 'le circuit fusionné est géolocalisé');

  -- (b) La course sur circuit SUPPRIMÉ perd sa piste mais survit (décision PO).
  perform tests.eq((select count(*) from public.races
                    where id = 'dd000000-0000-0000-0000-0000000000f2'), 1,
                   'la course sur circuit fictif existe toujours');
  perform tests.eq((select count(*) from public.races
                    where id = 'dd000000-0000-0000-0000-0000000000f2' and circuit_id is null), 1,
                   'elle a perdu son circuit');

  -- (c) Il ne reste AUCUN circuit sans coordonnées : c'était le symptôme du
  --     bug — 12 fiches mortes, invisibles dans « près de moi » mais bien
  --     présentes dans la recherche.
  perform tests.eq((select count(*) from public.circuits where lat is null), 0,
                   'plus aucun circuit sans coordonnées');
  perform tests.eq((select count(*) from public.circuits), 12, 'douze circuits réels restants');
  raise notice 'Scénario 1 (réconciliation du seed d''origine) ✔';
end $$;

-- ═══ Scénario 2 : rejouable sans dégât ═══
-- Le PO colle le SQL à la main dans l'éditeur Supabase : il peut très bien le
-- relancer, ou l'avoir déjà lancé.
do $$
declare r record; n_avant int;
begin
  select count(*) into n_avant from public.circuits;
  select * into r from public.reconcile_legacy_circuits();
  perform tests.eq(r.fusionnes, 0, 'second passage : plus rien à fusionner');
  perform tests.eq(r.supprimes, 0, 'second passage : plus rien à supprimer');
  perform tests.eq((select count(*) from public.circuits), n_avant,
                   'second passage : le référentiel ne bouge pas');
  raise notice 'Scénario 2 (rejouable) ✔';
end $$;

-- ═══ Scénario 3 : l'unicité est garantie par une contrainte, pas par un usage ═══
-- Avant, l'absence de doublon ne tenait qu'au « not exists » de l'insertion :
-- deux exécutions simultanées (deux onglets de l'éditeur SQL) auraient toutes
-- deux inséré.
do $$
declare refuse boolean := false;
begin
  begin
    insert into public.circuits (name, city, is_official, lat, lon)
      values ('LE  KARTING', 'nantes', true, 47.2, -1.57);   -- même identité normalisée
  exception when unique_violation then refuse := true;
  end;
  if not refuse then
    raise exception 'ÉCHEC : un doublon nom+ville a été accepté';
  end if;

  -- La même enseigne dans une AUTRE ville reste légitime (SpeedPark, BattleKart…).
  insert into public.circuits (name, city, is_official, lat, lon)
    values ('Le Karting', 'Rennes', true, 48.11, -1.68);
  raise notice 'Scénario 3 (unicité nom+ville) ✔';
end $$;

do $$ begin raise notice 'Tous les tests d''import du référentiel sont passés ✔'; end $$;
