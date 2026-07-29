-- KartSquad — A11 : la fiche circuit et les meilleurs temps.
--
-- Décisions PO 2026-07-29 :
--   · VIE PRIVÉE : le temps d'un profil privé APPARAÎT au tableau, mais sans
--     son nom (« Pilote privé »). Un chrono est une donnée de course ; le
--     pseudo est une donnée de personne. Les amis, eux, voient le nom.
--   · ANTI-TRICHE : seuls les chronos de courses « qui comptent » (≥ 2
--     inscrits) alimentent les tableaux publics — la règle des badges,
--     réutilisée mot pour mot. Un temps saisi seul dans son canapé ne coiffe
--     pas les tableaux de France.
--   · INVITÉS : exclus des tableaux publics (aucun compte responsable
--     derrière le chrono) ; ils gardent leur temps sur l'écran de LEUR course.
--   · Pas de longueur de piste ni de cylindrées : la donnée N'EXISTE PAS
--     (1 circuit sur 277 a une longueur dans OpenStreetMap, les cylindrées
--     nulle part). Site web (137 circuits) et téléphone (79) : oui.

-- ═══ 1. Le pratique : site, téléphone, indoor (source OpenStreetMap) ══════
alter table public.circuits add column if not exists website text;
alter table public.circuits add column if not exists phone text;
alter table public.circuits add column if not exists is_indoor boolean not null default false;

-- Pas d'horaires, à dessein : 15 % de couverture, et un horaire périmé fait
-- faire 50 km pour un rideau fermé. Le site de l'exploitant est responsable
-- de sa propre fraîcheur.
with e(nom, ville, site, tel, indoor) as (values
  ('Abbeville Somme Karting', 'Abbeville', 'https://abbeville-somme-karting.fr/', null, false),
  ('Acro''Kart Racing', 'Les Trois-Îlets', 'https://www.acrokart.fr/', null, false),
  ('Actua kart', 'Saint-Laurent-de-Mure', 'https://www.actua-organisation.fr/', '+33 4 37 25 90 08', false),
  ('Astra Kart Ozan', 'Ozan', 'https://astrakartozan.fr/', null, false),
  ('Atlantic Kart System', 'Les Sables-d''Olonne', 'https://www.akskart.fr/', null, false),
  ('Base US Karting', 'Étrechet', 'https://baseuskarting.com/', null, false),
  ('Battle Kart', 'Champlan', 'https://www.battlekart.com/fr/paris-sud-massy/', '+33188812133', false),
  ('BattleKart', 'Notre-Dame-d''Oé', 'https://www.battlekart.com/fr/tours/', null, true),
  ('BattleKart', 'Dreux', 'https://www.battlekart.com/fr/paris-ouest-dreux', null, false),
  ('BattleKart Lyon-Mornant', 'Mornant', 'https://www.battlekart.com/fr/lyon-mornant/', '+33 9 83 29 20 14', false),
  ('Brenne Découverte', 'Mézières-en-Brenne', 'https://www.brenne-decouverte.com/karting/', '+33 2 54 38 10 27', false),
  ('Brest karting électrique', 'Brest', null, null, true),
  ('Bretagne Karting', 'Combrit', 'http://www.bretagne-karting.fr/', null, false),
  ('Cap Karting', 'Mer', 'https://www.capkarting.com/', null, false),
  ('Circuit automobile Maurice Tissandier', 'Montgivray', 'https://www.circuitdelachatre.fr/*', null, false),
  ('Circuit Beausoleil', 'Laval', 'https://www.karting-laval.fr', null, false),
  ('Circuit de Barcelonnette', 'Saint-Pons', 'https://www.passionkart.fr/listings/karting-saint-pons-circuit-barcelonnette/', '+33 6 15 18 74 74', false),
  ('Circuit de Bucy', 'Bucy-le-Long', 'https://www.circuit-de-bucy.com/', null, false),
  ('Circuit de Cabourg - Team Active', 'Cabourg', 'https://www.teamactive.fr/nos-sites/grand-ouest/circuit-de-cabourg/', '+33 9 67 26 32 32', false),
  ('Circuit de Deauville - Team Active', 'Saint-Arnoult', 'https://www.teamactive.fr/nos-sites/grand-ouest/circuit-de-deauville/', '+33 2 58 54 00 21', false),
  ('Circuit de Karting', 'Mérignac', 'https://kartsystem.com/fr/kart-system-plein-air-merignac', '+33 5 56 47 64 19', false),
  ('Circuit de Karting de Caussiniojouls', 'Caussiniojouls', 'https://karting-caussiniojouls.com/', null, false),
  ('Circuit de Karting de la Roche de Glun', 'La Roche-de-Glun', 'http://www.kartingvalence.com/', null, false),
  ('Circuit de Karting du Bassin D''Arcachon', 'Biganos', 'https://www.topgun-evasion.com/contact-topgun-evasion.html', null, false),
  ('Circuit de karting Loc''karting', 'Pérols', 'https://www.lockarting.fr/', null, false),
  ('Circuit de karting Technikart', 'Saint Pierre-sur-Dives', 'https://www.technikart.fr/', '+33 2 31 20 30 50', false),
  ('Circuit de l''Enclos - Piste de compétition', 'Septfontaines', 'http://www.circuitdelenclos.com/', '+33 3 81 49 55 44', false),
  ('Circuit de l''Indre', 'Clion', 'https://circuit-de-lindre.com/', '+33 2 54 38 67 35', false),
  ('Circuit de la Calmette', 'La Calmette', 'https://www.lacalmettekarting.fr/', '+33 4 66 63 12 89', false),
  ('Circuit de la Jamaïque', 'Sainte-Clotilde', 'https://www.circuitdelajamaique.re/', null, false),
  ('Circuit de Ouistreham - Team Active', 'Ouistreham', 'https://www.teamactive.fr/nos-sites/grand-ouest/circuit-de-ouistreham/', '+33 2 31 96 65 62', false),
  ('Circuit du Bugey', 'Château-Gaillard', 'https://www.circuitdubugey.com/', '+33 4 74 38 89 67', false),
  ('Circuit du Mistral', 'Eyguières', 'https://aerodrome-eyguieres.fr/circuit-kart-auto-moto/', null, false),
  ('Circuit du Val d''Argenton', 'Argentonnay', 'https://pks-loisirs.fr/', null, false),
  ('Circuit International de Karting d''Aunay-les-Bois', 'Aunay-les-Bois', 'https://www.ouest-karting.fr/', '+33 2 33 27 65 87', false),
  ('Circuit International de Saint-Amand', 'Colombiers', null, '+33 2 48 96 61 78', false),
  ('Circuit Jean Brun', 'Paray-sous-Briailles', 'https://karting-varennes.fr/', null, false),
  ('Circuit Jean Sainrame', 'Briscous', null, '+33 5 59 26 28 27', false),
  ('Circuit Karting Besançon', 'Autoreille', 'https://ckbesancon.com/', null, false),
  ('Circuit national de la Boule d''Or', 'Bournand', 'https://www.loudun-karting.com/', '+33 5 49 98 75 12', false),
  ('Circuit Vendée Kart Center', 'Fontenay-le-Comte', null, null, true),
  ('City Kart', 'Saint-Sébastien-sur-Loire', 'https://www.city-kart.fr/karting-indoor-de-nantes/', null, false),
  ('ClotKart', 'Vaudoy-en-Brie', 'https://www.clotkart.com', '+33 1 64 07 55 65', false),
  ('Complexe sportif de karting de la Hague', 'La Hague', 'https://karting50.fr/', null, false),
  ('Défikart', 'Toulouse', null, null, true),
  ('DKS-Motors', 'Rouvignies', 'https://www.dks-motors.com/', null, false),
  ('Dunois Kart', 'Villemaury', 'https://www.dunoiskart.com/', '+33 2 37 66 31 66', false),
  ('Ecokart', 'Saint-Lô', null, null, true),
  ('Energy Karting Saint-Cyr', 'Saint-Cyr', 'https://www.energykarting-stcyr.com', null, true),
  ('Family Fun Kart', 'Lagord', 'https://www.family-fun-park-lagord.com/', '+33 5 46 56 06 39', false),
  ('Fast & Green', 'Saint-Étienne', 'https://www.fast-and-green.fr/', null, false),
  ('Formule Kart', 'Villeperdue', 'http://www.formulekart.com/', '+33 2 47 260 700', false),
  ('Fun-Kart', 'Le Bar-sur-Loup', 'https://www.fun-karting.com/', '+33955000438', false),
  ('Go Kart 90', 'Danjoutin', null, null, true),
  ('GP Circuit', 'Lamballe', 'https://www.gp-circuit.fr/', null, false),
  ('Green Kart', 'Échirolles', 'https://green-kart.com/', null, true),
  ('Grimaud Karting Loisirs', 'Grimaud', 'https://www.gkl-karting.fr', null, false),
  ('Inter Racing Kart', 'Fréjus', 'https://www.interracingkart.com/', null, false),
  ('Itekkarting', 'Champniers', 'https://www.itekkarting.com/', null, false),
  ('JCS Karting', 'Lubersac', null, null, true),
  ('Jovikart Karting Nantes 44', 'Le Bignon', 'https://www.jovikart.com/', null, false),
  ('K1 Speed', 'Hérouville-Saint-Clair', 'https://k1speed.fr/caen', '+33 2 31 46 03 10', false),
  ('K1 Speed', 'Le Mans', null, null, true),
  ('Kart 56', 'Ploemel', 'https://www.kart56.com/', null, false),
  ('Kart Center', 'Migné-Auxances', 'https://www.newkartpoitiers.com/', '+33549512371', false),
  ('Kart Center Biscarrosse', 'Biscarrosse', null, '+33 5 58 78 88 50', false),
  ('Kart Escale', 'Bort-l''Étang', 'https://www.kartescale.com/', null, false),
  ('Kart indoor', 'Appoigny', null, null, true),
  ('Kart Landes 40', 'Escource', 'https://kartlandes.com/', null, false),
  ('Kart Origins', 'Corbas', 'https://kartorigins.fr/', '+33 4 78 96 98 52', false),
  ('Kart Ouest', 'Ploumoguer', 'https://www.kartouest29.fr/', null, false),
  ('Kart Race', 'Witry-lès-Reims', 'https://www.kartrace.org/', null, false),
  ('Kart Racer', 'Saran', 'https://www.kartracer.fr/', null, true),
  ('Kart System Indoor', 'Bordeaux', null, null, true),
  ('Kart''Up', 'Vitrolles', 'https://www.kartup-vitrolles.com/', '+33 4 42 79 08 80', false),
  ('Kart71', 'Dracy-le-Fort', 'https://www.kart71.com/', '+33 3 85 87 70 24', true),
  ('KartCenter', 'Pluméliau-Bieuzy', 'https://www.kartcenter56.fr/', '+33297519811', false),
  ('Karthors', 'Cieurac', 'https://www.karthors.fr', null, false),
  ('Kartind du Nord Mayenne', 'Montreuil-Poulay', 'https://www.kartingdunordmayenne.fr/', null, false),
  ('Karting 45', 'Saint-Benoît-sur-Loire', 'https://www.karting45.com/', '+33 2 38 35 73 78', true),
  ('Karting 47', 'Caudecoste', 'https://k47.fr/', '+33 5 53 87 31 42', false),
  ('Karting 55', 'Verdun', 'https://k55.fr/accueil-karting/', null, false),
  ('Karting Cap Malo', 'La Mézière', null, null, true),
  ('Karting - Circuit de Muret', 'Muret', 'https://www.kartingmuret.fr', null, false),
  ('Karting City Périgord', 'Journiac', 'https://kartingcityperigord.fr/', null, false),
  ('Karting de Beauvais', 'Rochy-Condé', 'https://kartingdebeauvais.fr/', '+33 3 44 07 63 03', false),
  ('Karting de Caen', 'Démouville', 'http://www.karting-caen.fr', '+33 2 31 72 20 00', false),
  ('Karting de Chartres', 'Chartres', null, '+33 2 37 28 70 07', false),
  ('Karting de Crolles', 'Crolles', 'https://kartingdecrolles.com/', '+33 4 76 22 58 90', true),
  ('Karting de Magescq', 'Magescq', 'https://www.karting-de-magescq.fr/', '+33 5 58 47 77 66', true),
  ('Karting de Marcillat en Combraille', 'Marcillat-en-Combraille', 'https://www.gtr-performance.fr/activites/karting-marcillat-en-combraille', null, false),
  ('Karting de Monteux', 'Monteux', 'https://kartingdemonteux.fr/', null, false),
  ('Karting de Nakutakoin', 'Dumbéa', 'https://karting.nc/', null, false),
  ('Karting de Pers', 'Le Rouget-Pers', 'https://www.cantalkarting.fr/', null, false),
  ('Karting de Rumilly', 'Rumilly', 'http://kartingderumilly.fr/index.html', '+33 4 50 64 62 90', false),
  ('Karting de Saint-Malo', 'Saint-Méloir-des-Ondes', 'https://www.karting-saint-malo.com/', null, false),
  ('Karting de Saintes', 'Les Gonds', 'https://kartingdesaintes.com/', null, false),
  ('Karting di a Granova', 'Tavaco', 'https://karting-gravona.corsica/', null, false),
  ('Karting du Gaillou', 'Capbreton', 'http://www.kartingdugaillou.com', '+33 5 58 41 80 09', false),
  ('Karting du Grand Arc', 'Tournon', 'https://kartingdugrandarc.fr/', '+33 4 79 38 43 44', false),
  ('Karting du Sundgau', 'Steinsoultz', 'https://www.sundgaukart.com/', null, false),
  ('Karting Family Fun Park', 'Meschers-sur-Gironde', 'https://www.familyfunpark.fr/', '+33 5 46 03 15 58', false),
  ('Karting Haute Picardie', 'Arvillers', 'https://www.kartingarvillers.fr/', '+33 3 22 37 46 77', false),
  ('Karting Indoor', 'Aix-en-Provence', null, null, true),
  ('Karting Manosque', 'Manosque', 'https://www.kartingmanosque.fr/', '+33 4 92 75 93 02', false),
  ('Karting Martigues', 'Martigues', 'https://askmartigues.fr/', null, false),
  ('Karting Meisenthal', 'Meisenthal', 'https://www.kartingmeisenthal.fr/', '+33 3 66 72 38 04', false),
  ('Karting Number One', 'Agde', 'https://www.kartingnumberone.com/', null, false),
  ('Karting Philippe Alliot', 'Bellevigny', 'https://karting-philippealliot.com/', null, false),
  ('Karting Philippe Lavilledieu', 'Lavilledieu', 'https://www.karting-lavilledieu.com/', null, false),
  ('Karting''s Passion', 'Saint-Aubin-des-Landes', null, '+33677277580', false),
  ('Karting Saint-Cyprien', 'Saint-Cyprien', 'https://kartingstcyprien.fr/', '+33 4 68 21 41 76', false),
  ('Karting Sarron', 'Riom', 'https://www.circuit-sarron.com/', null, false),
  ('Karting Tours', 'La Ville-aux-Dames', 'https://karting-center-tours.fr', '+33 2 47 32 09 13', false),
  ('Kartingliss', 'Cournon-d''Auvergne', null, null, true),
  ('Kartland', 'Moissy-Cramayel', null, null, true),
  ('Kartmania', 'Chenôve', 'https://kartmania.com/', '+33 3 80 52 88 77', false),
  ('Karukera Karting Cup', 'Baie-Mahault', 'https://www.kkcup.fr/', '+590 690 556 948', false),
  ('Kerlabo Kart', 'Cohiniac', 'https://kerlabo-kart.com/', '+33 6 75 78 47 32', false),
  ('KHUB Arras', 'Sainte-Catherine', 'https://khub-arras.com/', '+33 366869833', false),
  ('KLL Loisirs', 'Douvrin', 'https://kll.fr/', null, false),
  ('Kpb 14', 'Marolles', 'https://kartingpaintball14.fr/', '+33 2 31 63 83 92', false),
  ('L''Indykarte', 'Le Ménil', 'http://www.vp-kart.com/', null, true),
  ('La Fabrique Ludique', 'Roquefort', null, '+33 5 58 05 65 08', true),
  ('Laville Karting Service', 'Champforgeuil', 'http://lkskarting.free.fr', '+33 6 11 40 16 79', false),
  ('Le Karting', 'Nantes', null, null, true),
  ('LF Karting', 'Layrac', 'https://lfkarting.fr/', '+33 5 53 87 84 52', false),
  ('Lille Karting', 'Ennetières-en-Weppes', 'https://www.lillekarting.fr/', '+33320176080', true),
  ('Made In Kart', 'Joigny', 'https://www.madeinkart.com/', '+33 3 86 19 32 32', false),
  ('Manacha Kart', 'Gerbépal', 'https://www.manachakart.com/', null, false),
  ('Méga Kart', 'Saint-Louis', null, '+262 692 66 22 77', false),
  ('Metz Kart Indoor', 'Augny', 'https://gamesfactory.fr/metz/', '+33 3 72 39 63 20', true),
  ('Milhaud Karting', 'Milhaud', 'https://www.nimeskarting.fr/', null, false),
  ('MP Karting', 'Lanas', 'https://www.karting-ardeche.com/', null, false),
  ('NTKart', 'Lexy', 'https://ntkart.com/', '+33 3 82 23 79 39', false),
  ('On''Kart', 'Viry', 'https://on-kart.com/', '+33 4 50 38 34 13', false),
  ('OnlyKart', 'Dagneux', 'https://www.onlykart.com/', '+33 4 30 33 33 33', true),
  ('Opale Karting', 'Berck', 'https://www.opalekarting.fr/', '+33321944445', false),
  ('Parc Sports & Loisirs Gorges de l''Hérault - Cévennes', 'Brissac', 'https://www.parc-loisir-cevennes.fr', null, false),
  ('Passion Karting 16', 'Taponnat-Fleurignac', 'https://www.passionkarting16.fr', '+33 5 45 62 18 18', false),
  ('Passion Karting 17', 'Saint-Jean-d''Angély', 'https://www.passionkarting17.fr/', '+33 5 16 51 78 69', false),
  ('Piste de Karting', 'Noiron-sous-Gevrey', 'https://www.karting2noiron.fr/', null, false),
  ('Piste de Karting Extérieur', 'Moirans-en-Montagne', null, null, true),
  ('Piste de Karting Indoor', 'Toulouse', 'https://kartingtoulouse.com/', '+33 562 163 200', true),
  ('Planet Karting', 'Saint-Martin-lez-Tatinghem', 'https://www.planet-karting.com/', '+33 321389450', false),
  ('Puissance Kart Indoor', 'Audincourt', 'https://www.puissancekartindoor.com/', null, true),
  ('Racing Kart JPR', 'Ostricourt', 'https://www.karting-lille-jpr.fr', '+33 327899050', false),
  ('Rallye Kart', 'Roquebrune-sur-Argens', 'https://rallyekart.org/', '+33 6 09 77 26 73', false),
  ('RKC Karting', 'Cormeilles-en-Vexin', 'https://www.rkc.fr/', '+33 1 30 73 28 00', false),
  ('RMT Karting', 'Limoges', null, null, true),
  ('Roazhon Kart', 'Montgerval', null, null, true),
  ('Rouen Espace Loisirs', 'Rouen', 'https://www.rouenespaceloisirs.fr/', '+33232123405', false),
  ('Saint-Paul Kart Team', 'Saint-Paul-lès-Romans', null, null, true),
  ('Selest''Kart''in', 'Sélestat', 'https://selestkart-in.com/', '+33 3 88 82 77 21', false),
  ('Speed Park', 'Brétigny-sur-Orge', 'https://www.kartingbowling.com/bretigny-sur-orge/page-contact-et-plan-d-acces-11.html', '+331 69 88 34 78', false),
  ('Speed Park', 'Brest', null, null, true),
  ('Speed2Max', 'Clermont-Ferrand', 'https://speed2max.com/', '+33 4 73 14 14 28', false),
  ('SpeedPark Conflans-Sainte-Honorine', 'Conflans-Sainte-Honorine', 'https://speedpark.fr/?', '+33 1 34 90 23 10', false),
  ('Sport-In Park', 'Saint-Berthevin', null, null, true),
  ('Stras Kart', 'Eckbolsheim', 'http://www.straskart.fr/', null, false),
  ('Sud Karting', 'Bouillargues', 'https://sudkarting.fr/fr/', null, false),
  ('Sun Karting', 'Sérignan', 'http://www.sunkarting.fr', '+33 4 67 39 57 11', false),
  ('Tahiti Karting', 'Hitiaʻa ʻo te Rā', null, '+689 40 82 87 36', false),
  ('Tours Kart Indoor', 'Saint-Avertin', 'https://www.tours-kart-indoor.fr/', '+33 2 47 80 03 27', true),
  ('West Mecapark', 'Corcoué-sur-Logne', 'https://www.west-mecapark.com/', '+33 6 45 49 80 70', false),
  ('Xtreme fun 08', 'Douzy', null, null, true)
)
update public.circuits c
   set website = e.site, phone = e.tel, is_indoor = e.indoor
  from e
 where c.is_official
   and public.kart_normalize(c.name) = public.kart_normalize(e.nom)
   and public.kart_normalize(coalesce(c.city, '')) = public.kart_normalize(e.ville);

-- ═══ 2. Qui a le droit de voir quel nom ═══════════════════════════════════
-- LE prédicat du lot, factorisé : le nom d'un pilote au tableau d'un circuit
-- est visible si le profil est public, si c'est moi, ou si nous sommes amis.
create or replace function public.can_name_pilot(p_pilot uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_pilot
      and (not p.is_private
           or p.id = auth.uid()
           or exists (select 1 from friendships f
                       where f.status = 'accepted'
                         and ((f.requester_id = p.id and f.addressee_id = auth.uid())
                           or (f.addressee_id = p.id and f.requester_id = auth.uid()))))
  );
$$;

-- ═══ 3. La fiche : une ligne, tout le contexte ════════════════════════════
create or replace function public.get_circuit_page(p_circuit_id uuid)
returns table (
  id uuid, name text, city text, lat double precision, lon double precision,
  aliases text, website text, phone text, is_indoor boolean,
  races_count bigint, pilots_count bigint, last_race_at timestamptz,
  my_races_count bigint, my_best_lap_ms integer,
  -- Nombre de PILOTES éligibles au tableau par période : le client s'en sert
  -- pour ne faire apparaître les onglets « Cette année » / « Ce mois-ci »
  -- qu'à partir de 5 — jamais d'étagère vide en vitrine.
  laps_all bigint, laps_year bigint, laps_month bigint
)
language sql stable security definer set search_path = public as $$
  with jouees as (
    select ra.id, ra.completed_at
    from races ra
    where ra.circuit_id = p_circuit_id and ra.status = 'completed'
  ),
  -- L'ensemble ÉLIGIBLE aux tableaux publics : inscrits, courses qui
  -- comptent, comptes ni supprimés ni suspendus.
  eligibles as (
    select pp.profile_id, res.best_lap_ms, j.completed_at
    from results res
    join jouees j on j.id = res.race_id
    join participations pp on pp.id = res.participation_id
    join profiles p on p.id = pp.profile_id
    where res.best_lap_ms is not null
      and pp.profile_id is not null
      and public.race_is_ranked(res.race_id)
      and p.deleted_at is null and p.suspended_at is null
  )
  select c.id, c.name, c.city, c.lat, c.lon, c.aliases, c.website, c.phone, c.is_indoor,
    (select count(*) from jouees),
    (select count(distinct pp.profile_id) from participations pp
      join jouees j on j.id = pp.race_id where pp.profile_id is not null),
    (select max(j.completed_at) from jouees j),
    (select count(*) from participations pp
      join jouees j on j.id = pp.race_id where pp.profile_id = auth.uid()),
    (select min(res.best_lap_ms) from results res
      join jouees j on j.id = res.race_id
      join participations pp on pp.id = res.participation_id
      where pp.profile_id = auth.uid() and res.best_lap_ms is not null),
    (select count(distinct e.profile_id) from eligibles e),
    (select count(distinct e.profile_id) from eligibles e
      where e.completed_at > now() - interval '1 year'),
    (select count(distinct e.profile_id) from eligibles e
      where e.completed_at > now() - interval '30 days')
  from circuits c
  where c.id = p_circuit_id;
$$;
revoke all on function public.get_circuit_page(uuid) from public, anon;
grant execute on function public.get_circuit_page(uuid) to authenticated;

-- ═══ 4. Le tableau des meilleurs temps ════════════════════════════════════
-- Un pilote = une ligne (son meilleur temps de la période), les dix premiers.
create or replace function public.get_circuit_top_times(p_circuit_id uuid, p_period text)
returns table (
  rank bigint, pilot_id uuid, username text, best_lap_ms integer,
  achieved_at timestamptz, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_depuis timestamptz;
begin
  if p_period not in ('all', 'year', 'month') then
    raise exception 'Période inconnue : %', p_period;
  end if;
  v_depuis := case p_period
                when 'year' then now() - interval '1 year'
                when 'month' then now() - interval '30 days'
                else '-infinity'::timestamptz
              end;

  return query
  with bruts as (
    select pp.profile_id, res.best_lap_ms as lap, ra.completed_at
    from results res
    join races ra on ra.id = res.race_id
    join participations pp on pp.id = res.participation_id
    join profiles p on p.id = pp.profile_id
    where ra.circuit_id = p_circuit_id
      and ra.status = 'completed'
      and ra.completed_at > v_depuis
      and res.best_lap_ms is not null
      and pp.profile_id is not null          -- invités : hors tableau public
      and public.race_is_ranked(res.race_id) -- courses qui comptent seulement
      and p.deleted_at is null and p.suspended_at is null
  ),
  meilleurs as (
    select distinct on (b.profile_id)
           b.profile_id, b.lap, b.completed_at
    from bruts b
    order by b.profile_id, b.lap asc, b.completed_at asc
  )
  select row_number() over (order by m.lap asc, m.completed_at asc) as rank,
         -- Profil privé non-ami : le TEMPS sort, le NOM et l'identifiant non.
         -- Renvoyer l'identifiant permettrait d'ouvrir la fiche du pilote et
         -- de lever l'anonymat en un tap.
         case when public.can_name_pilot(m.profile_id) then m.profile_id end,
         case when public.can_name_pilot(m.profile_id)
              then (select p.username from profiles p where p.id = m.profile_id) end,
         m.lap, m.completed_at, (m.profile_id = auth.uid())
  from meilleurs m
  order by m.lap asc, m.completed_at asc
  limit 10;
end;
$$;
revoke all on function public.get_circuit_top_times(uuid, text) from public, anon;
grant execute on function public.get_circuit_top_times(uuid, text) to authenticated;

-- ═══ 5. Le record existant s'aligne sur les mêmes règles ══════════════════
-- Avant : le record incluait les fantômes et nommait les profils privés
-- (« contournement assumé pour UN record »). Un tableau permanent rend
-- l'exception indéfendable : mêmes règles partout. L'écran de course affiche
-- « Pilote privé » quand le détenteur est masqué.
create or replace function public.get_circuit_record(p_circuit_id uuid)
returns table (best_lap_ms integer, holder text)
language sql stable security definer set search_path = public as $$
  select res.best_lap_ms,
         case when public.can_name_pilot(pp.profile_id) then pr.username end
  from results res
  join races ra on ra.id = res.race_id
  join participations pp on pp.id = res.participation_id
  join profiles pr on pr.id = pp.profile_id
  where ra.circuit_id = p_circuit_id
    and ra.status = 'completed'
    and res.best_lap_ms is not null
    and pp.profile_id is not null
    and public.race_is_ranked(res.race_id)
    and pr.deleted_at is null and pr.suspended_at is null
  order by res.best_lap_ms asc
  limit 1;
$$;
revoke all on function public.get_circuit_record(uuid) from public, anon;
grant execute on function public.get_circuit_record(uuid) to authenticated;
