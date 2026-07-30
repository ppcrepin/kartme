-- KartSquad — A16 : import du référentiel karting consolidé (fichier PO).
--
-- Le PO a fourni un relevé vérifié à la main (2026-07-21) : 310 pistes sur
-- 270 lieux, 13 régions métropolitaines. Il apporte ce qu'OpenStreetMap ne
-- pouvait pas donner, et que l'étude A11 avait mesuré manquant. Symétriquement,
-- le fichier n'a AUCUNE coordonnée : les deux jeux sont complémentaires, pas
-- concurrents. On garde donc notre géographie, et on prend son métier.
--
-- CE QUE CE COLLAGE ÉCRIT RÉELLEMENT (chiffres de l'import, pas du fichier —
-- la décision « une piste par lieu » en écarte une partie) :
--   · 163 circuits existants enrichis · 101 nouveaux · 3 alias ajoutés ;
--   · 142 longueurs de piste (contre UNE avant) · 262 intérieur/extérieur ;
--   · 190 motorisations · 253 usages · 63 homologations FFSA/CIK-FIA ;
--   · 33 lieux notent leurs tracés multiples.
-- Le NOTICE final réimprime ces nombres : ils doivent concorder.
--
-- ── Décisions PO (2026-07-30), appliquées telles quelles ──────────────────
--   · UN CIRCUIT PAR LIEU (piste principale = la plus longue connue) ; les
--     autres tracés restent en note, pour ne rien perdre et pour qu'un futur
--     modèle « par piste » n'exige pas un réimport.
--   · Rapprochement AUTOMATIQUE avec alias de sécurité : l'identifiant
--     existant est PRÉSERVÉ (les courses jouées gardent leur circuit) et
--     l'ancien nom part en alias, donc la recherche le trouve encore.
--   · LE FICHIER GAGNE les conflits (téléphone, site, nom).
--   · Les lieux au statut « inconnu » sont importés ; le signalement (A13) est
--     le bon outil pour les sortir s'ils ont fermé.
--
-- ── Le rapprochement est VÉRIFIÉ GÉOGRAPHIQUEMENT ────────────────────────
-- Première version : rapprochement sur le NOM seul. La revue adversariale a
-- mesuré le résultat — sept circuits « déménageaient » de 40 à 470 km, nom et
-- ville écrasés, coordonnées inchangées : une course jouée près de Nantes se
-- serait affichée « Karting City — Dordogne ». Corruption d'historique, pire
-- qu'un orphelin. Trois de ces sept étaient des pièges d'HOMONYMIE de commune
-- (Saint-Cyprien, Aigues-Vives et Neuilly existent dans plusieurs
-- départements), et pour deux autres la bonne cible dormait intacte dans la
-- même table, à un kilomètre.
--
-- Le rapprochement retenu croise donc TROIS signaux :
--   (78) nom ou alias + ville normalisés — les alias du lot A4c portent les
--       sigles (BRK, RKC, CKB…) et font une partie du travail ;
--   (19) nom seul, MAIS la ville du fichier doit se géocoder à moins de 30 km
--       de nos coordonnées — un rapprochement invérifiable est REJETÉ, jamais
--       conservé par défaut (c'est ce défaut qui laissait passer « Karting
--       City / Dordogne ») ;
--   (58) même ville, nom différent — le plus fréquent et le plus utile :
--       27 de nos circuits s'appelaient « Piste de Karting » ou « Karting »
--       (objets OSM sans nom) et reçoivent leur nom commercial ;
--   (8) proximité + parenté de nom (moins de 3 km et un jeton distinctif
--       commun, nom de commune exclu) — c'est cette passe qui a retrouvé les
--       bonnes cibles rejetées par le contrôle géographique.
-- Enfin UN SEUL lieu par circuit : quatre circuits étaient visés deux fois et
-- la seconde mise à jour écrasait la première EN SILENCE.
--
-- Attribution : relevé appuyé sur la FFSA et des annuaires publics ;
-- l'attribution OpenStreetMap reste due pour les coordonnées et l'import
-- d'origine (ODbL). Les deux sont citées dans Aide & légal.

begin;

-- ── 1. Colonnes du « métier » ────────────────────────────────────────────
alter table public.circuits add column if not exists length_m numeric(6,1);
alter table public.circuits add column if not exists width_m numeric(4,1);
alter table public.circuits add column if not exists env_kind text;
alter table public.circuits add column if not exists motor_kind text;
alter table public.circuits add column if not exists usage_kind text;
alter table public.circuits add column if not exists homologation text;
alter table public.circuits add column if not exists address text;
alter table public.circuits add column if not exists postal_code text;
alter table public.circuits add column if not exists tracks_note text;

-- Vocabulaires FERMÉS : une valeur libre finirait affichée telle quelle.
alter table public.circuits drop constraint if exists circuits_env_kind;
alter table public.circuits add constraint circuits_env_kind
  check (env_kind is null or env_kind in ('indoor','outdoor','temporaire'));
alter table public.circuits drop constraint if exists circuits_motor_kind;
alter table public.circuits add constraint circuits_motor_kind
  check (motor_kind is null or motor_kind in ('thermique','electrique','mixte'));
alter table public.circuits drop constraint if exists circuits_usage_kind;
alter table public.circuits add constraint circuits_usage_kind
  check (usage_kind is null or usage_kind in ('loisir','competition','mixte'));
alter table public.circuits drop constraint if exists circuits_homologation;
alter table public.circuits add constraint circuits_homologation
  check (homologation is null or homologation in ('FFSA','CIK-FIA','FIA'));
-- 200 à 1600 m. La borne haute n'est pas cosmétique : à 2000 m et plus, ce
-- sont des circuits AUTO ou MOTO que le relevé attribue au karting (Circuit
-- Carole 2055 m est la piste moto de Tremblay, le Bourbonnais 2300 m le
-- circuit auto de Moulins). La plus longue piste de karting crédible du
-- relevé fait 1500 m : la borne ne rejette rien de légitime.
alter table public.circuits drop constraint if exists circuits_length_sane;
alter table public.circuits add constraint circuits_length_sane
  check (length_m is null or length_m between 200 and 1600);

-- ── 2. Mises à jour : 163 circuits existants enrichis ──────────────────────
-- L'IDENTIFIANT NE BOUGE PAS : garantie que les courses jouées gardent leur
-- circuit (une suppression/recréation les aurait orphelinisées — leçon A4b).
create temp table maj_circuits (
  old_name text, old_city text, new_name text, new_city text,
  length_m numeric, width_m numeric, env_kind text, motor_kind text,
  usage_kind text, homologation text, address text, postal_code text,
  phone text, website text, tracks_note text, add_aliases text
) on commit drop;

insert into maj_circuits values
  ('Abbeville Somme Karting', 'Abbeville', 'Abbeville Somme Karting (Stadium Automobile)', 'Abbeville', 1163.0, null, 'outdoor', 'thermique', 'competition', 'FFSA', 'Route d''Hesdin', '80100', '0322210841', 'https://abbeville-somme-karting.fr', 'Piste 900 m · Piste 1163 m', 'Abbeville Somme Karting'),
  ('Actua kart', 'Saint-Laurent-de-Mure', 'Actua Kart', 'Saint-Laurent-de-Mure', null, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Chemin de Fournéa (La Savane)', '69720', '0437259008', null, null, 'Circuit de Lyon'),
  ('Circuit Beltoise-Trappes', 'Trappes', 'BRK – Beltoise Racing Kart', 'Trappes', 990.0, 7.5, 'outdoor', 'thermique', 'mixte', null, 'Avenue des Frères Lumière, Z.A. Trappes Élancourt', '78190', '0130697880', 'https://brk.fr', 'Piste compétition · Piste loisir', 'Circuit Beltoise-Trappes'),
  ('Bretagne Karting', 'Combrit', 'Bretagne Karting', 'Combrit', 700.0, null, 'outdoor', 'thermique', 'mixte', null, 'Ménez Frug, Axe Quimper–Pont-l''Abbé (sortie L''Avantage)', '29120', '0298942509', 'https://bretagne-karting.bzh', null, null),
  ('Cap Karting', 'Mer', 'Cap Karting', 'Mer', 1500.0, null, 'outdoor', 'thermique', 'mixte', null, null, '41500', null, 'https://val-de-loire-41.com', null, 'Circuit de Mer'),
  ('Circuit Beausoleil', 'Laval', 'Circuit International de Karting Beausoleil', 'Laval', null, null, 'outdoor', 'thermique', 'competition', null, 'Chemin de la Croix Bataille', '53000', '0243491595', 'https://karting-laval.fr', null, 'Circuit Beausoleil | Circuit Louis Paillard'),
  ('Circuit Jean Brun', 'Paray-sous-Briailles', 'Circuit Intl Jean Brun (ASK Varennes)', 'Paray-sous-Briailles', 1500.0, null, 'outdoor', 'thermique', 'competition', 'CIK-FIA', 'Route de la Tour de Villemouze', '03500', '0609138332', 'https://karting-varennes.fr', null, 'Circuit Jean Brun'),
  ('Kartland', 'Moissy-Cramayel', 'Circuit Kartland', 'Moissy-Cramayel', 830.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '77550', '0164419661', 'https://kartland.fr', 'Piste A 830 m · Piste B 810 m · Circuit enfants 300 m', 'Kartland'),
  ('Circuit Léopard', 'Andrézieux-Bouthéon', 'Circuit Léopard', 'Andrézieux-Bouthéon', 670.0, null, 'outdoor', 'thermique', 'loisir', 'FFSA', 'Rue Maurice Bellonte, ZAC L''Orme Les Sources', '42160', '0629498103', 'https://circuitleopard.fr', null, null),
  ('Karting Mecamax', 'L''Île-d''Olonne', 'Circuit Mecamax (karting & quad)', 'L''Île-d''Olonne', null, null, 'outdoor', null, 'loisir', null, 'Route de Challans, Les Gâches', '85340', '0251331182', 'https://mecamax.com', null, 'Karting Mecamax'),
  ('Karting Sarron', 'Riom', 'Circuit Sarron', 'Riom', null, null, 'outdoor', null, 'loisir', null, '1 Avenue Hector Berlioz', '63200', '0473646161', null, null, 'Karting Sarron'),
  ('Karting de Caen', 'Démouville', 'Circuit de Caen', 'Démouville', 900.0, null, 'outdoor', 'thermique', 'mixte', null, null, '14840', null, null, 'Piste Monaco 650 m · Piste Monza 900 m', 'Karting de Caen'),
  ('Karting - Circuit de Muret', 'Muret', 'Circuit de Muret (HGK)', 'Muret', 1420.0, null, 'outdoor', 'thermique', 'competition', 'FFSA', null, '31600', '0645523138', 'https://karting-haute-garonne.com', null, 'Karting - Circuit de Muret'),
  ('Karting des 3 Lacs', 'Piégut', 'Circuit de karting des 3 Lacs', 'Piégut', null, null, 'outdoor', null, 'loisir', null, null, '05000', null, null, null, 'Karting des 3 Lacs'),
  ('Circuit de l''Europe', 'Sotteville-sous-le-Val', 'Circuit de l''Europe', 'Sotteville-sous-le-Val', 1200.0, null, 'outdoor', 'thermique', 'mixte', null, 'Le Bois Bocquet', '76410', null, null, null, null),
  ('Kart-Circuit des Renardières', 'Pageas', 'Circuit des Renardières', 'Pageas', 1200.0, null, 'outdoor', 'thermique', 'mixte', null, 'Le Puy', '87230', null, null, null, 'Kart-Circuit des Renardières'),
  ('ClotKart', 'Vaudoy-en-Brie', 'Clotkart', 'Vaudoy-en-Brie', 1000.0, 8.0, 'outdoor', null, null, null, 'D209', '77141', '0164075565', 'https://clotkart.com', null, null),
  ('Db Karting', 'Saint-Lyé', 'DB Karting', 'Saint-Lyé', 680.0, 7.2, 'outdoor', 'thermique', 'mixte', null, 'RD619 (Rte Nationale 19), ZI La Perrière', '10180', '0325765615', 'https://dbkarting.fr', null, null),
  ('DKS-Motors', 'Rouvignies', 'DKS Motors (Circuit International du Hainaut)', 'Rouvignies', 800.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '59220', null, 'https://dks-motors.com', null, 'DKS-Motors'),
  ('Défikart', 'Toulouse', 'DéfiKart', 'Toulouse', 400.0, null, 'indoor', 'thermique', 'loisir', null, null, '31000', null, 'https://defikart.fr', null, null),
  ('Euro Dieppe Karting', 'Rouxmesnil-Bouteilles', 'Euro Dieppe Karting', 'Rouxmesnil-Bouteilles', null, null, 'outdoor', null, null, null, 'Zone d''activité Verte', '76370', null, null, null, null),
  ('Fast & Green', 'Saint-Étienne', 'Fast & Green', 'Saint-Étienne', null, null, 'indoor', 'electrique', 'loisir', null, null, null, null, null, null, null),
  ('Fun-Kart', 'Le Bar-sur-Loup', 'Fun-Kart (Fun Kart Racing)', 'Le Bar-sur-Loup', 1000.0, null, 'outdoor', 'thermique', 'competition', 'FFSA', 'La Sarrée, Route de Gourdon', '06620', null, 'https://funkartracing.com', 'Grand circuit (>1 km) · Circuit 350 m', 'Fun-Kart'),
  ('Go Kart 90', 'Danjoutin', 'GO KART 90', 'Danjoutin', null, null, 'indoor', null, 'loisir', null, null, '90400', null, 'https://gokart90.fr', null, null),
  ('Garden Karting', 'La Douze', 'Garden Karting', 'La Douze', 900.0, null, 'outdoor', 'thermique', 'mixte', null, null, '24330', '0553352855', 'https://perigord.com', null, null),
  ('Green Kart', 'Échirolles', 'Green Kart', 'Échirolles', 500.0, null, 'indoor', null, 'loisir', 'FFSA', null, '38130', null, null, null, null),
  ('KHUB Arras', 'Sainte-Catherine', 'KHUB Arras', 'Sainte-Catherine', null, null, 'indoor', 'electrique', 'mixte', null, '78 rue de Béthune', '62223', null, null, null, null),
  ('Kart 56', 'Ploemel', 'Kart 56', 'Ploemel', 800.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'ZA de la Madeleine', '56400', null, 'https://kart56.com', 'Piste 800 m · Pistes enfants (karts élec.)', 'Karting de Ploemel'),
  ('KartCenter', 'Pluméliau-Bieuzy', 'Kart Center', 'Pluméliau-Bieuzy', 700.0, null, 'outdoor', 'thermique', 'mixte', null, 'Zone de Port Arthur', '56930', null, 'https://kartcenter56.fr', null, null),
  ('Kart Center Biscarrosse', 'Biscarrosse', 'Kart Center Biscarrosse', 'Biscarrosse', null, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '40600', '0558788850', null, null, null),
  ('Kart Escale', 'Bort-l''Étang', 'Kart Escale', 'Bort-l''Étang', null, null, 'outdoor', null, 'loisir', null, 'La Gravière', '63190', null, null, null, null),
  ('Kart Landes 40', 'Escource', 'Kart Landes 40', 'Escource', null, null, 'outdoor', 'thermique', 'competition', null, null, '40210', '0558089877', 'https://kartlandes.com', null, null),
  ('Kart Origins', 'Corbas', 'Kart''Origins', 'Corbas', 500.0, null, 'outdoor', 'thermique', 'loisir', null, '300 route de Marennes', '69960', null, null, null, null),
  ('Kart Race', 'Witry-lès-Reims', 'Kart''Race (Karting 51 Witry)', 'Witry-lès-Reims', 1152.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Route de Berru', '51420', '0326496408', 'https://kartrace.org', null, 'Kart Race'),
  ('Kart Ouest', 'Ploumoguer', 'KartOuest', 'Ploumoguer', 800.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Keronvel', '29810', null, 'https://kartouest29.fr', null, null),
  ('Karthors', 'Cieurac', 'Karthors', 'Cieurac', 800.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Parc d''activités de Cahors Sud', '46230', null, 'https://karthors.fr', null, null),
  ('Karting 45', 'Saint-Benoît-sur-Loire', 'Karting 45', 'Saint-Benoît-sur-Loire', 1200.0, null, 'outdoor', 'thermique', 'loisir', null, '9 Route du Vieux Chemin', '45730', '0238357378', 'https://karting45.com', 'Piste principale 1200 m · Piste secondaire 700 m', null),
  ('Karting 55', 'Verdun', 'Karting 55', 'Verdun', 420.0, null, 'outdoor', 'thermique', 'loisir', null, 'Boulevard Stratégique', '55100', null, 'https://lameuse.fr', null, null),
  ('Karting 79', 'Chauray', 'Karting 79 (Speed Fun Karting)', 'Chauray', 850.0, 9.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '79180', null, null, null, 'Karting 79'),
  ('Piste de Karting d''Anneville-Ambourville', 'Anneville-Ambourville', 'Karting Anneville-Ambourville (Association Circuit Rouen Anneville)', 'Anneville-Ambourville', null, null, 'outdoor', 'thermique', 'mixte', null, '1444 Chemin d''Ambourville', '76480', null, null, null, 'Piste de Karting d''Anneville-Ambourville'),
  ('Karting Club Gravelinois', 'Gravelines', 'Karting Club Gravelinois', 'Gravelines', 725.0, null, 'outdoor', 'thermique', 'competition', null, null, '59820', null, null, null, null),
  ('Circuit de Karting de Dijon-Prenois', 'Prenois', 'Karting Dijon-Prenois', 'Prenois', null, null, 'outdoor', 'thermique', 'loisir', null, 'Circuit de Prenois', '21370', null, 'https://circuit-dijon-prenois.com', null, 'Circuit de Karting de Dijon-Prenois'),
  ('Karting Haute Picardie', 'Arvillers', 'Karting Haute Picardie', 'Arvillers', 1300.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'La Râperie', '80910', '0322374677', 'https://kartingarvillers.fr', 'Piste 600 m · Piste 1300 m', null),
  ('Karting Manosque', 'Manosque', 'Karting Manosque (Maurice Chomat)', 'Manosque', 700.0, null, 'outdoor', 'thermique', 'mixte', null, 'Route de la Durance, Les Signores', '04100', null, 'https://kartingmanosque.fr', null, 'Karting Manosque'),
  ('Astra Kart Ozan', 'Ozan', 'Karting Ozan', 'Ozan', null, null, 'outdoor', 'thermique', 'loisir', null, null, '01190', null, null, null, 'Astra Kart Ozan'),
  ('Karting Plus', 'Belmont-sur-Rance', 'Karting Plus', 'Belmont-sur-Rance', 1500.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '12370', '0565999667', 'https://kartingplus.com', null, null),
  ('Karting Sud Toulois', 'Barisey-au-Plain', 'Karting Sud Toulois', 'Barisey-au-Plain', 464.0, 6.0, 'outdoor', 'thermique', 'loisir', null, 'RD4, 4 Pâquis de Naveroy', '54170', null, null, null, null),
  ('West Aventure', 'Saint-Révérend', 'Karting West Aventure', 'Saint-Révérend', null, null, 'outdoor', null, 'loisir', null, 'Rue du Point du Jour', '85220', '0251546693', 'https://west-aventure.com', null, 'West Aventure'),
  ('Karting de Chartres', 'Chartres', 'Karting de Chartres (KDC)', 'Chartres', 420.0, null, 'indoor', 'electrique', 'loisir', null, 'Jardin d''entreprises, 08 Le Bois des Poteries', '28000', null, 'https://kartingdechartres.fr', null, 'Karting de Chartres'),
  ('Karting de Crolles', 'Crolles', 'Karting de Crolles', 'Crolles', 604.0, 6.5, 'outdoor', 'thermique', 'mixte', 'FFSA', 'A41 sortie Brignoud, D1090', '38920', '0474545280', 'https://kartingdecrolles.com', null, 'Chronokart'),
  ('Karting de Magescq', 'Magescq', 'Karting de Magescq', 'Magescq', null, null, 'outdoor', 'thermique', 'mixte', null, null, '40140', '0558477766', null, null, 'Karting des Pins'),
  ('Karting de Rumilly', 'Rumilly', 'Karting de Rumilly (GTS)', 'Rumilly', 1150.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Base de loisirs de Rumilly', '74150', null, 'https://kartingderumilly.com', 'Grande piste 1150 m · Petite piste 550 m', 'Karting de Rumilly'),
  ('Karting de Saint-Malo', 'Saint-Méloir-des-Ondes', 'Karting de Saint-Malo', 'Saint-Méloir-des-Ondes', null, null, 'outdoor', 'thermique', 'mixte', null, null, '35350', null, 'https://karting-saint-malo.com', null, null),
  ('Karting de Torreilles', 'Torreilles', 'Karting de Torreilles', 'Torreilles', null, null, 'outdoor', null, 'loisir', null, 'Zone des Loisirs, Route des Plages', '66440', null, null, null, null),
  ('Karting du Gaillou', 'Capbreton', 'Karting du Gaillou', 'Capbreton', 1000.0, null, 'outdoor', 'thermique', 'mixte', null, null, '40130', '0558418009', null, null, null),
  ('Karting du Grand Arc', 'Tournon', 'Karting du Grand Arc', 'Tournon', 1100.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'La Combe', '73460', '0479384344', 'https://kartingdugrandarc.fr', null, null),
  ('Karting du Laquais', 'Champier', 'Karting du Laquais', 'Champier', 900.0, null, 'outdoor', 'thermique', 'loisir', 'FFSA', 'Au Laquay', '38260', null, 'https://kartingdulaquais.com', null, null),
  ('Karting du Mont-Blanc', 'Passy', 'Karting du Mont-Blanc', 'Passy', null, null, 'outdoor', null, 'loisir', null, null, '74190', null, 'https://kartingdumontblanc.com', null, null),
  ('Piste de karting', 'Le Creusot', 'Karting Évasion (Parc des Combes)', 'Le Creusot', 817.0, null, 'outdoor', 'thermique', 'mixte', null, 'Parc Touristique des Combes', '71200', null, null, null, 'Piste de karting | Karting Évasion'),
  ('Lille Karting', 'Ennetières-en-Weppes', 'Lille Karting', 'Ennetières-en-Weppes', 900.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Centre Commercial Englos les Géants', '59320', '0320176080', 'https://lillekarting.com', 'Piste indoor 600 m · Piste outdoor 900 m (éclairée)', null),
  ('Circuit de karting Loc''karting', 'Pérols', 'Loc''Karting', 'Pérols', 700.0, 6.5, 'outdoor', 'thermique', 'mixte', null, 'RD172, Domaine Pailletrice', '34470', null, null, null, 'Circuit de karting Loc''karting'),
  ('MK Karting', 'Scientrier', 'MK Circuit (Scientrier)', 'Scientrier', null, null, 'outdoor', 'thermique', 'loisir', null, '2930 route de l''Arve', '74930', null, 'https://mk-circuit.com', null, 'MK Karting'),
  ('MP Karting', 'Lanas', 'MP Karting', 'Lanas', null, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Aérodrome Aubenas-Lanas', '07200', null, null, null, null),
  ('Made In Kart', 'Joigny', 'Made in Kart', 'Joigny', 1050.0, null, 'outdoor', 'thermique', 'loisir', null, 'Route de Longueron', '89300', '0386193232', 'https://madeinkart.com', null, null),
  ('Manacha Kart', 'Gerbépal', 'Manacha Kart', 'Gerbépal', 600.0, null, 'outdoor', 'thermique', 'loisir', 'FFSA', null, '88430', null, 'https://manachakart.com', null, null),
  ('Metz Kart Indoor', 'Augny', 'Metz Kart Indoor', 'Augny', 700.0, null, 'indoor', 'thermique', 'loisir', null, 'Rue Carcantin, ZAC d''Augny', '57685', '0372396320', 'https://metzkartindoor.fr', null, null),
  ('Mistral Karting', 'Montélimar', 'Mistral Karting', 'Montélimar', null, null, 'outdoor', null, 'loisir', null, 'Route du Teil', '26200', '0475014633', null, null, null),
  ('Normandie Karting', 'Val-de-la-Haye', 'Normandie Karting', 'Val-de-la-Haye', null, null, 'outdoor', null, null, null, 'Avenue de Quenneport', '76380', null, null, null, null),
  ('OnlyKart', 'Dagneux', 'OnlyKart', 'Dagneux', 502.0, null, 'indoor', 'electrique', 'loisir', null, '195 avenue de l''Industrie', '01120', null, 'https://onlykart.com', 'Piste indoor élec. 502 m · Piste outdoor bio-éthanol', null),
  ('Pro Kart Figari', 'Figari', 'Prokart Figari', 'Figari', null, null, 'outdoor', 'thermique', 'mixte', null, null, '20114', null, null, 'Piste principale · Piste enfants', null),
  ('RMT Karting', 'Limoges', 'RMT Karting', 'Limoges', null, null, 'indoor', 'electrique', 'loisir', null, null, '87000', null, null, null, null),
  ('Racing Kart du Mans', 'Montfort-le-Gesnois', 'Racing Kart du Mans', 'Montfort-le-Gesnois', 1150.0, null, 'outdoor', 'thermique', 'competition', null, null, '72450', null, null, 'Piste loisir 900 m · Piste compétition 1150 m', null),
  ('Sologne Karting', 'Salbris', 'Sologne Karting', 'Salbris', 1500.0, null, 'outdoor', 'thermique', 'mixte', 'FIA', 'Les Maisons Rouges', '41300', null, 'https://sologne-karting.com', null, null),
  ('Speed2Max', 'Clermont-Ferrand', 'Speed2max', 'Clermont-Ferrand', null, null, null, 'electrique', 'loisir', null, '160 avenue Jean Mermoz', '63100', null, null, null, null),
  ('SpeedPark Conflans-Sainte-Honorine', 'Conflans-Sainte-Honorine', 'Speedpark (Karting Bowling)', 'Conflans-Sainte-Honorine', null, null, 'indoor', null, 'loisir', null, 'Z.A. Les Boutries, 18 rue de l''Hautil', '78700', '0820208208', 'https://kartingbowling.com', null, 'SpeedPark Conflans-Sainte-Honorine | SpeedPark'),
  ('Stras Kart', 'Eckbolsheim', 'Stras''Kart', 'Eckbolsheim', 400.0, null, 'indoor', 'electrique', 'loisir', null, '14 Rue des Frères Lumière', '67201', '0367860016', 'https://straskart.fr', null, null),
  ('Selest''Kart''in', 'Sélestat', 'Sélest''Kart''In', 'Sélestat', null, null, 'indoor', null, 'loisir', null, 'Zone artisanale sud', '67600', null, null, null, null),
  ('Tours Kart Indoor', 'Saint-Avertin', 'Tours Kart Indoor (Pole Karting Service)', 'Saint-Avertin', null, null, 'indoor', null, 'loisir', 'FFSA', '11 rue Louis Pasteur', '37550', '0247800327', 'https://tours-kart-indoor.fr', null, 'Tours Kart Indoor'),
  ('Atlantic Kart System', 'Les Sables-d''Olonne', 'Atlantic Kart System (AKS)', 'Les Sables-d''Olonne', null, null, 'outdoor', 'thermique', 'mixte', null, 'D36A, Le Coudriou', '85180', '0251325252', 'https://akskart.fr', null, 'Atlantic Kart System'),
  ('Base US Karting', 'Étrechet', 'Base US Karting', 'Châteauroux', 700.0, null, 'outdoor', 'thermique', 'mixte', null, 'Ancienne base militaire de La Martinerie', '36000', null, 'https://baseuskarting.com', 'Piste indoor (2 niveaux) · Piste outdoor 700 m', null),
  ('Brest karting électrique', 'Brest', 'Brest Karting Électrique', 'Plouzané', 240.0, null, 'indoor', 'electrique', 'loisir', null, 'voisin du golf de Brest-Iroise', '29280', null, null, null, null),
  ('Circuit Espace Plus', 'Ollainville', 'Circuit Espace Plus', 'Marcoussis', 780.0, 6.0, 'outdoor', 'thermique', 'mixte', null, 'Domaine de Couard, Route de Couard', '91460', '0164493013', 'https://circuitespaceplus.com', 'Piste 780 m · Piste 360 m', null),
  ('Circuit International de Karting d''Aunay-les-Bois', 'Aunay-les-Bois', 'Circuit International d''Essay (Ouest Karting / K61)', 'Essay', 800.0, null, 'outdoor', 'thermique', 'mixte', null, '10 rue Roederer', '61500', null, 'https://karting61.com', null, 'Circuit International de Karting d''Aunay-les-Bois | Circuit Karting Essay'),
  ('Circuit de l''Indre', 'Clion', 'Circuit de l''Indre (Renaux Racing)', 'Clion', 1000.0, 7.5, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '36700', null, null, null, 'Circuit de l''Indre'),
  ('Circuit du Périgord', 'Teyjat', 'Circuit du Périgord', 'Teyjat', 1100.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '24300', null, 'https://circuit-karting-perigord-24.fr', null, 'Karting du Périgord'),
  ('Dunois Kart', 'Villemaury', 'Dunois Kart', 'Lutz-en-Dunois', 1200.0, null, 'outdoor', 'thermique', 'mixte', null, null, '28200', null, 'https://dunoiskart.com', 'Piste outdoor · Piste indoor', null),
  ('Inwall Kart', 'Les Ponts-de-Cé', 'Inwall Kart', 'Les Ponts-de-Cé', 600.0, 5.0, 'indoor', 'thermique', 'loisir', null, null, '49130', null, 'https://inwallkart.com', null, null),
  ('Kart71', 'Dracy-le-Fort', 'Kart 71', 'Champforgeuil', null, null, 'indoor', 'thermique', 'mixte', null, null, '71530', null, null, null, null),
  ('Kart Racer', 'Saran', 'Kart Racer', 'Orléans', null, null, 'indoor', 'thermique', 'mixte', null, null, '45000', null, null, null, null),
  ('Kerlabo Kart', 'Cohiniac', 'Karting de Kerlabo', 'Boqueho', 805.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Kerlabo (axe Châtelaudren-Quintin)', '22170', null, 'https://kerlabo-kart.com', 'Piste 805 m · Piste enfants (karts élec.)', 'Kerlabo Kart'),
  ('Karting de Saintes', 'Les Gonds', 'Karting de Saintes', 'Les Gonds', 700.0, null, 'outdoor', null, null, 'FFSA', '93 rue des Coudrasses', '17100', '0615357354', 'https://kartingdesaintes.com', null, null),
  ('On''Kart', 'Viry', 'On''Kart', 'Ville-la-Grand', 1014.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '74100', null, null, null, null),
  ('Passion Karting 16', 'Taponnat-Fleurignac', 'Passion Karting 16', 'La Rochefoucauld', 750.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '16110', '0545621818', 'https://passionkarting16.fr', null, null),
  ('Sud Karting', 'Bouillargues', 'Sud Karting', 'Bouillargues', null, null, 'outdoor', 'thermique', 'loisir', null, null, '30000', null, 'https://sudkarting.fr', null, null),
  ('Sun Karting', 'Sérignan', 'Sunkart', 'Gruissan', 700.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Route de Narbonne-Plage', '11430', null, null, null, 'Sun Karting'),
  ('Piste de Karting', 'Wittenheim', 'ASK Wittenheim', 'Wittenheim', 610.0, 6.5, 'outdoor', 'thermique', 'competition', null, null, '68270', null, 'https://askwittenheim.fr', null, 'Piste de Karting'),
  ('Circuit du Bugey', 'Château-Gaillard', 'Ain Karting', 'Château-Gaillard', 850.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '01500', null, null, null, 'Circuit du Bugey | Karting de Chateau-Gaillard'),
  ('Piste de Karting', 'Le Sequestre', 'Albi Kart Expérience', 'Le Séquestre', null, null, 'outdoor', 'thermique', 'mixte', null, 'Circuit Automobile d''Albi', '81990', null, 'https://albikartexperience.fr', null, 'Piste de Karting'),
  ('Xtreme fun 08', 'Douzy', 'Ardennes Karting', 'Douzy', null, null, 'indoor', 'thermique', 'mixte', null, 'Route de Mouzon', '08140', null, 'https://ardenneskarting.fr', null, 'Xtreme fun 08'),
  ('Circuit de Karting de la Roche de Glun', 'La Roche-de-Glun', 'Arena 45 – Centre Intl de Karting', 'La Roche-de-Glun', null, null, 'outdoor', 'thermique', 'mixte', null, '3630 route de Valence', '26600', '0481666076', 'https://arena45.fr', null, 'Circuit de Karting de la Roche de Glun'),
  ('Circuit de Karting de Caussiniojouls', 'Caussiniojouls', 'BSO Karting (Karting de Caussiniojouls)', 'Caussiniojouls', 1100.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '34600', null, 'https://karting-caussiniojouls.com', null, 'Circuit de Karting de Caussiniojouls'),
  ('Circuit Karting Besançon', 'Autoreille', 'CKB – Circuit Karting Besançon', 'Autoreille', 1200.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Route de Courcuire', '70700', null, 'https://ckbesancon.com', null, 'Circuit Karting Besançon'),
  ('Circuit Berderry', 'Lescar', 'Circuit Berdery', 'Lescar', null, null, 'outdoor', 'thermique', 'mixte', null, null, '64230', null, null, null, 'Circuit Berderry'),
  ('Piste de Karting Extérieur', 'Moirans-en-Montagne', 'Circuit Jura Sud', 'Moirans-en-Montagne', null, null, 'indoor', 'thermique', 'mixte', null, 'Route de la Grange au Gui', '39260', '0384426958', null, 'Piste indoor · Piste outdoor', 'Piste de Karting Extérieur'),
  ('Karting de Pont d''Ain', 'Pont-d''Ain', 'Circuit Pondinois – JPB Karting', 'Pont-d''Ain', null, null, 'outdoor', 'thermique', 'mixte', null, null, '01160', null, null, null, 'Karting de Pont d''Ain'),
  ('KLL Loisirs', 'Douvrin', 'Circuit de Douvrin (ASK Douvrin/KLL)', 'Douvrin', 1000.0, 7.0, 'outdoor', 'thermique', 'mixte', null, '315 Avenue de Paris', '62138', '0321777331', null, null, 'KLL Loisirs'),
  ('Circuit de Bucy', 'Bucy-le-Long', 'Circuit de Karting Maraikart', 'Bucy-le-Long', null, null, 'outdoor', 'thermique', 'mixte', null, null, '02200', null, 'https://kartingmaraikart-bucylelong-soissons-aisne.fr', null, 'Circuit de Bucy'),
  ('Circuit de Ouistreham - Team Active', 'Ouistreham', 'Circuit de Ouistreham', 'Ouistreham', 550.0, null, 'outdoor', 'thermique', 'loisir', null, null, '14150', null, null, null, 'Circuit de Ouistreham - Team Active'),
  ('Ludi Kart', 'Argelès-sur-Mer', 'Circuit de karting d''Argelès-sur-Mer', 'Argelès-sur-Mer', null, null, 'outdoor', null, null, null, 'Route de Saint-Cyprien, Espace de Loisirs', '66700', null, null, null, 'Ludi Kart'),
  ('Circuit de karting Kart Extrem', 'Saint-Genis-de-Saintonge', 'Circuit de karting de Charente-Maritime', 'Saint-Genis-de-Saintonge', 1137.0, null, 'outdoor', 'thermique', 'mixte', null, null, '17240', null, null, null, 'Circuit de karting Kart Extrem'),
  ('Grand Circuit du Roussillon', 'Rivesaltes', 'Circuit de karting de Rivesaltes', 'Rivesaltes', null, null, 'outdoor', null, null, null, 'Route du Barcarès, Mas de la Garrigue Nord', '66600', null, null, null, 'Grand Circuit du Roussillon'),
  ('BattleKart', 'Dreux', 'Circuit du Bois Guyon', 'Dreux', null, null, 'outdoor', null, 'mixte', null, 'ZI Nord, R-nd de la Ronde', '28100', null, null, null, 'BattleKart'),
  ('City Kart', 'Sautron', 'City Kart Sautron', 'Sautron', 700.0, null, 'outdoor', 'thermique', 'mixte', null, null, '44880', null, 'https://city-kart.fr', null, 'City Kart'),
  ('Ecokart', 'Saint-Lô', 'Complexe Saint-Lois', 'Saint-Lô', 250.0, null, 'indoor', 'electrique', 'loisir', null, null, '50000', null, null, null, 'Ecokart'),
  ('Jovikart Karting Nantes 44', 'Le Bignon', 'Jovikart', 'Le Bignon', 900.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '44140', null, null, null, 'Jovikart Karting Nantes 44'),
  ('K1 Speed', 'Le Mans', 'K1 Speed Le Mans', 'Le Mans', null, null, 'indoor', 'electrique', 'loisir', null, null, '72100', null, 'https://k1speed.com', null, 'K1 Speed'),
  ('Kart System Indoor', 'Bordeaux', 'KART System Bordeaux-Lac', 'Bordeaux', 600.0, null, 'indoor', 'thermique', 'loisir', null, null, '33300', null, 'https://kartsystem.com', null, 'Kart System Indoor'),
  ('Circuit de Karting', 'Mérignac', 'KART System Mérignac', 'Mérignac', null, null, 'outdoor', 'thermique', 'mixte', null, null, '33700', null, 'https://kartsystem.com', null, 'Circuit de Karting'),
  ('Kart de Foulain', 'Foulain', 'Kart 52 (Foulain)', 'Foulain', 710.0, 7.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '52800', null, 'https://kart52.fr', null, 'Kart de Foulain'),
  ('Piste de Karting', 'Noiron-sous-Gevrey', 'Karting 2 Noiron', 'Noiron-sous-Gevrey', 300.0, null, 'outdoor', null, 'loisir', 'FFSA', '44 route d''Izeure', '21910', null, null, 'Piste outdoor 300 m · Piste indoor (couverte)', 'Piste de Karting'),
  ('AS Karting Corsika', 'Biguglia', 'Karting Biguglia', 'Biguglia', 1000.0, null, 'outdoor', 'thermique', 'mixte', null, null, '20620', null, null, null, 'AS Karting Corsika | Complexe Henri Muzio'),
  ('Circuit Jean Sainrame', 'Briscous', 'Karting Briscous', 'Briscous', 1200.0, null, 'outdoor', 'thermique', 'mixte', null, null, '64240', null, null, null, 'Circuit Jean Sainrame'),
  ('Karting Tours', 'La Ville-aux-Dames', 'Karting Center Tours (KCT)', 'La Ville-aux-Dames', 500.0, null, 'outdoor', 'thermique', 'loisir', 'FFSA', 'L''Ouche St Martin, Rue Lucie Aubrac', '37700', '0247320913', 'https://karting-center-tours.fr', 'Piste outdoor · Piste enfants', 'Karting Tours'),
  ('Centre de Karting', 'Malafretaz', 'Karting Montrevel-en-Bresse', 'Malafretaz', null, null, 'outdoor', 'thermique', 'mixte', 'FFSA', '999 route d''Etrez', '01340', '0617791840', 'https://karting-montrevel-en-bresse.fr', null, 'Centre de Karting'),
  ('Karting sur Glace Orcières', 'Orcières', 'Karting Orcières Merlette', 'Orcières', null, null, 'outdoor', null, 'loisir', null, 'Base de loisirs, 8 km de la station', '05170', null, null, null, 'Karting sur Glace Orcières'),
  ('Kpb 14', 'Marolles', 'Karting Paintball 14 (ACS Karting)', 'Marolles', 450.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '14100', null, null, null, 'Kpb 14'),
  ('Loisirs O'' d''Espoey', 'Espoey', 'Karting d''Espoey', 'Espoey', null, null, 'outdoor', null, 'loisir', null, null, '64420', null, null, null, 'Loisirs O'' d''Espoey'),
  ('Karting 47', 'Caudecoste', 'Karting de Caudecoste (K47)', 'Caudecoste', 1068.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Lieu-dit Peyroche, Route d''Astaffort', '47220', '0553873142', 'https://k47.fr', 'Piste outdoor 1068 m · Piste indoor', 'Karting 47'),
  ('Cosne Karting', 'Cosne-Cours-sur-Loire', 'Karting de Cosne-Cours-sur-Loire', 'Cosne-Cours-sur-Loire', 900.0, null, 'outdoor', null, 'loisir', null, 'Route de l''Aérodrome', '58200', '0386280958', null, null, 'Cosne Karting'),
  ('Karting Philippe Lavilledieu', 'Lavilledieu', 'Karting de Lavilledieu', 'Lavilledieu', 1300.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Chemin de Chance', '07170', '0475942019', 'https://karting-lavilledieu.com', 'Piste 1300 m · Petit circuit enfants élec.', 'Karting Philippe Lavilledieu'),
  ('Circuit de Karting KDM', 'Marseillan', 'Karting de Marseillan', 'Marseillan', null, null, 'outdoor', null, 'loisir', null, 'Chemin Prieur', '34340', null, null, null, 'Circuit de Karting KDM'),
  ('Piste de karting', 'Magny-Cours', 'Karting de Nevers Magny-Cours', 'Magny-Cours', null, null, 'outdoor', 'thermique', 'mixte', null, 'Circuit de Nevers Magny-Cours', '58470', '0386218043', 'https://kartingmagnycours.com', null, 'Piste de karting'),
  ('Karting de Beauvais', 'Rochy-Condé', 'Karting de Rochy-Condé', 'Rochy-Condé', 1000.0, null, 'outdoor', 'thermique', 'mixte', null, null, '60510', null, null, null, 'Karting de Beauvais'),
  ('Karting des 24h Le Mans', 'Le Mans', 'Karting des 24 Heures du Mans (Circuit Alain Prost)', 'Le Mans', null, null, 'outdoor', 'thermique', 'mixte', 'CIK-FIA', null, '72100', '0243402140', 'https://lemans-karting.com', null, 'Karting des 24h Le Mans | ACO · Virage Corvette'),
  ('Kartind du Nord Mayenne', 'Montreuil-Poulay', 'Karting du Nord Mayenne', 'Montreuil-Poulay', 900.0, 3.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '53640', null, 'https://kartingdunordmayenne.fr', null, 'Kartind du Nord Mayenne | Karting du Fouteau'),
  ('Piste de Karting', 'Meilly-sur-Rouvres', 'Kartmania Auxois Sud', 'Meilly-sur-Rouvres', 1090.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Aérodrome Pouilly-Maconge, Rte Maconge', '21320', '0380528877', 'https://kartmania.com', null, 'Piste de Karting'),
  ('Kartmania', 'Chenôve', 'Kartmania Dijon (Chenôve)', 'Chenôve', null, null, 'indoor', null, 'loisir', null, '12 Rue Antoine Becquerel', '21300', null, 'https://kartmania.com', null, 'Kartmania'),
  ('Monky', 'Laval', 'Laval Kart', 'Laval', 300.0, null, 'indoor', null, 'loisir', null, null, '53000', null, null, null, 'Monky'),
  ('Piste de Karting', 'Frontenaud', 'Le Circuit de Bresse', 'Frontenaud', null, null, 'outdoor', 'thermique', 'mixte', null, '460 route de Milleure (ZA Milleure Sud)', '71580', null, 'https://circuitdebresse.com', null, 'Piste de Karting'),
  ('Circuit Vendée Kart Center', 'Fontenay-le-Comte', 'Les Circuits de Vendée (karting électrique indoor)', 'Fontenay-le-Comte', 350.0, null, 'indoor', 'electrique', 'loisir', null, null, '85200', null, 'https://vendee-tourisme.com', null, 'Circuit Vendée Kart Center'),
  ('Milhaud Karting', 'Milhaud', 'NimesKarting', 'Milhaud', 525.0, null, 'outdoor', 'thermique', 'mixte', null, null, '30540', null, 'https://nimeskarting.fr', null, 'Milhaud Karting'),
  ('Piste de Karting de Charmes', 'Charmes', 'Piste du Saulcy (ASK Charmes)', 'Charmes', null, null, 'outdoor', 'thermique', 'competition', null, 'Rue Sainte-Barbe', '88130', null, null, null, 'Piste de Karting de Charmes'),
  ('Rouen Espace Loisirs', 'Rouen', 'Rouen Espace Karting', 'Rouen', 400.0, null, 'indoor', 'electrique', 'loisir', null, '149 Chemin de Croisset', '76000', null, 'https://rouenespaceloisirs.fr', null, 'Rouen Espace Loisirs'),
  ('Piste de Karting de Lessay', 'Lessay', 'SMKart#50 (Circuit de la Manche / ASK Lessay)', 'Lessay', 1005.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '50340', null, 'https://smkart50.fr', null, 'Piste de Karting de Lessay'),
  ('SpeedPark', 'Vannes', 'SpeedPark Vannes', 'Vannes', null, null, 'indoor', null, 'loisir', null, null, '56000', null, null, null, 'SpeedPark'),
  ('Piste de Karting', 'Pusey', 'Sport Karting – Circuit de la Vallée', 'Pusey', 300.0, null, 'outdoor', 'thermique', 'loisir', 'FFSA', null, '70000', '0384750495', 'https://sportkarting.com', 'Piste karting · Mini piste enfants 300 m', 'Piste de Karting'),
  ('Circuit de Karting du Bassin D''Arcachon', 'Biganos', 'TopGun Evasion (Circuit de Karting Bassin d''Arcachon)', 'Biganos', null, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '33380', null, 'https://topgun-evasion.com', null, 'Circuit de Karting du Bassin D''Arcachon'),
  ('Karting Philippe Alliot', 'Bellevigny', 'Vendée Espace Karting (Circuit Philippe Alliot)', 'Bellevigny', null, null, 'outdoor', 'thermique', 'mixte', null, 'Les Prés Hauts', '85170', '0251410505', 'https://karting-philippealliot.com', null, 'Karting Philippe Alliot'),
  ('Win''Kart de Carcassonne', 'Carcassonne', 'WIN''KART', 'Carcassonne', 976.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Route de Bram', '11000', null, 'https://winkart-11.fr', null, 'Win''Kart de Carcassonne'),
  ('Piste de Karting Indoor', 'Toulouse', 'Karting Toulouse Montaudran', 'Toulouse', null, null, 'indoor', 'electrique', 'loisir', null, null, '31400', null, 'https://kartingtoulouse.com', null, 'Piste de Karting Indoor'),
  ('Circuit International de Saint-Amand', 'Colombiers', 'Karting de Colombiers (Saint-Amand)', 'Colombiers', 1200.0, null, 'outdoor', 'thermique', 'mixte', null, null, '18200', null, null, null, 'Circuit International de Saint-Amand | Circuit International de karting'),
  ('Nantes Karting NEK', 'Nantes', 'Karting de Nantes (Électrique)', 'Nantes', null, null, 'indoor', 'electrique', 'loisir', null, null, '44800', null, 'https://karting-de-nantes.fr', null, 'Nantes Karting NEK'),
  ('Piste de Karting', 'Ancenis-Saint-Géréon', 'Plein Gaz Karting 44 (Circuit Roger Gaillard)', 'Ancenis', 1170.0, 7.0, 'outdoor', 'thermique', 'mixte', null, null, '44150', null, null, null, 'Piste de Karting'),
  ('Karting', 'Le Thou', 'Aunis Karting', 'Le Thou', 800.0, null, 'outdoor', null, null, 'FFSA', 'ZI du Fief Girard', '17290', null, 'https://auniskarting.fr', null, 'Karting'),
  ('Circuit Eisen - Kart 90', 'Pérouse', 'Kart 90 (Circuit Eisen)', 'Pérouse', 700.0, null, 'outdoor', 'thermique', 'mixte', null, 'D419 (6 km est de Belfort)', '90340', null, null, null, 'Circuit Eisen - Kart 90'),
  ('Karting Cap Malo', 'La Mézière', 'Karting Rennes Cap Malo', 'La Mézière', 600.0, null, 'indoor', null, 'mixte', null, 'Avenue du Phare du Grand Lejeon, ZAC Cap Malo', '35520', '0299133500', 'https://karting-rennes.fr', null, 'Karting Cap Malo'),
  ('Karting de Pers', 'Le Rouget-Pers', 'Karting de Pers – Le Lissartel', 'Le Rouget-Pers', 1105.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Selves', '15290', '0471622626', 'https://cantalkarting.fr', null, 'Karting de Pers | Circuit le Lissartel'),
  ('Karting Buffo', 'Ozouer-le-Voulgis', 'Racing Kart Buffo', 'Ozouer-le-Voulgis', 1000.0, 7.5, 'outdoor', 'thermique', 'mixte', 'FFSA', 'RN19', '77390', '0164076166', 'https://karting-buffo.com', 'Grande piste 1000 m · Piste 600 m · Piste indoor', 'Karting Buffo'),
  ('Karting Saint-Cyprien', 'Saint-Cyprien', 'Saint Cyp Kart', 'Saint-Cyprien', 600.0, null, 'outdoor', 'thermique', 'mixte', null, 'Chemin du Prat d''en Veil', '66750', null, 'https://kartingstcyprien.fr', 'Piste 600 m (pont + tunnel) · Circuit enfants (100cc) · Circuit baby (électrique)', 'Karting Saint-Cyprien'),
  ('Circuit de Karting du Parc', 'Le Parc', 'Circuit Karting du Parc (Team ASK)', 'Le Parc', 1300.0, 7.0, 'outdoor', null, null, 'FFSA', 'RN/D175, Sainte-Pience', '50870', '0233585024', 'https://kartingduparc.fr', null, 'Circuit de Karting du Parc'),
  ('Family Fun Kart', 'Lagord', 'Family Fun Park', 'Lagord', null, null, 'indoor', 'electrique', 'loisir', null, null, '17140', null, null, null, 'Family Fun Kart'),
  -- Ces deux lignes du relevé ont d'abord été REJETÉES par le contrôle
  -- géographique (leur ville géocode loin de nos coordonnées), puis insérées
  -- comme circuits neufs — donc en doublon, sur la position d'une commune
  -- HOMONYME : Aigues-Vives de l'Aude au lieu de l'Ariège (59 km), un
  -- « Neuilly » qui n'existe pas au lieu de Neuilly-sous-Clermont (85 km).
  -- Le contrôle avait raison de douter ; la conclusion tirée était fausse.
  -- « Je ne sais pas situer cette ligne » n'est pas « ce n'est pas le même
  -- circuit » : ici c'est bien le même, et c'est NOTRE géographie qui vaut.
  ('Circuit International de Lavelanet', 'Aigues-Vives', 'Kart''Are Aigues-Vives', 'Aigues-Vives', 1400.0, 8.5, 'outdoor', 'thermique', 'mixte', 'FFSA', 'D625 entre Lavelanet et Mirepoix', '09500', '0632099616', 'https://karting-ariege.fr', null, 'Circuit International de Lavelanet'),
  ('Karting', 'Neuilly-sous-Clermont', 'Karting Loisirs Neuilly', 'Neuilly-sous-Clermont', 720.0, null, 'outdoor', 'thermique', 'mixte', null, null, '60290', null, null, null, 'Karting')
;

-- ── 2bis. PRÉ-VOL : l'identité cible est-elle déjà prise ? ───────────────
-- `circuits_ident_uniq` est un index unique NON déférable sur (nom normalisé,
-- ville normalisée). Un renommage vers une identité déjà occupée fait échouer
-- TOUTE la migration sur un message anglais, sans dire laquelle des 163
-- lignes fautait. Or la base du PO n'est pas la base de référence : l'ajout
-- libre de circuits a été ouvert quelques jours en juillet, et le PO traite
-- les signalements A13 à la main — un renommage manuel vers le nom commercial
-- (exactement ce que ce fichier utilise) suffirait à tout bloquer.
-- On refuse donc AVANT d'écrire, en NOMMANT les collisions.
do $$
declare v_txt text;
begin
  select string_agg(format('« %s » (%s) → « %s » (%s), déjà occupé par « %s » (%s)',
                           m.old_name, m.old_city, m.new_name, m.new_city, c.name, c.city), E'\n')
    into v_txt
  from maj_circuits m
  join public.circuits c
    on public.kart_normalize(c.name) = public.kart_normalize(m.new_name)
   and public.kart_normalize(coalesce(c.city,'')) = public.kart_normalize(coalesce(m.new_city,''))
  where public.kart_normalize(c.name) <> public.kart_normalize(m.old_name)
     or public.kart_normalize(coalesce(c.city,'')) <> public.kart_normalize(coalesce(m.old_city,''));
  if v_txt is not null then
    raise exception E'Collision d''identité : ces renommages heurtent un circuit existant.\n%\nRien n''a été écrit. Renomme ou supprime le circuit en conflit, puis recolle.', v_txt;
  end if;
end $$;

do $upd$
declare v_attendu int; v_fait int;
begin
update public.circuits c set
  name         = m.new_name,
  city         = m.new_city,
  length_m     = coalesce(m.length_m, c.length_m),
  width_m      = coalesce(m.width_m, c.width_m),
  env_kind     = coalesce(m.env_kind, c.env_kind),
  motor_kind   = coalesce(m.motor_kind, c.motor_kind),
  usage_kind   = coalesce(m.usage_kind, c.usage_kind),
  homologation = coalesce(m.homologation, c.homologation),
  address      = coalesce(m.address, c.address),
  postal_code  = coalesce(m.postal_code, c.postal_code),
  phone        = coalesce(m.phone, c.phone),
  website      = coalesce(m.website, c.website),
  tracks_note  = coalesce(m.tracks_note, c.tracks_note),
  is_indoor    = case when m.env_kind is not null then m.env_kind = 'indoor' else c.is_indoor end,
  -- Alias FUSIONNÉS, pas écrasés : un `nullif(m.add_aliases,'')` sec
  -- détruirait sans trace tout alias posé entre la génération de ce fichier et
  -- son collage (correction manuelle du PO, lot futur). On réunit les deux
  -- listes, on dédoublonne sur la forme normalisée, et on retire l'alias qui
  -- serait devenu le nom.
  aliases = (
    select nullif(string_agg(distinct u.a, ' | '), '')
    from (
      select trim(x) as a
      from unnest(string_to_array(
             coalesce(c.aliases, '') || '|' || coalesce(m.add_aliases, ''), '|')) as x
      where trim(x) <> ''
        and public.kart_normalize(trim(x)) <> public.kart_normalize(m.new_name)
    ) u
  )
from maj_circuits m
where public.kart_normalize(c.name) = public.kart_normalize(m.old_name)
  and public.kart_normalize(coalesce(c.city, '')) = public.kart_normalize(coalesce(m.old_city, ''));

  -- `row_count` et NON un recomptage par nom : la première version comptait les
  -- circuits qui PORTENT les nouveaux noms, si bien qu'un SECOND collage
  -- affichait « 163 sur 163 » sans rien renommer du tout. Un import partiel se
  -- serait annoncé complet. `get diagnostics` n'est fiable que dans le bloc qui
  -- exécute la requête — d'où cet emballage.
  get diagnostics v_fait = row_count;
  select count(*) into v_attendu from maj_circuits;
  raise notice 'Mises à jour : % lignes écrites sur % attendues', v_fait, v_attendu;
  if v_fait <> v_attendu then
    raise exception 'Mises à jour perdues (% / %) — un circuit visé a changé de nom ou de ville depuis la génération de ce fichier. Rien n''a été écrit.', v_fait, v_attendu;
  end if;
end $upd$;

-- ── 2ter. Alias seuls : 3 lieux du fichier sont le MÊME site qu'un
-- circuit déjà enrichi par une autre ligne (mesuré à moins de 3 km, avec un
-- nom apparenté). On n'insère rien — un doublon sur la carte est pire qu'un
-- nom manquant — on ajoute seulement l'appellation en alias.
create temp table alias_circuits (old_name text, old_city text, add_alias text) on commit drop;
insert into alias_circuits values
  ('Circuit de Karting de la Roche de Glun', 'La Roche-de-Glun', 'Driv''Kart (La Roche-de-Glun)'),
  ('Kart71', 'Dracy-le-Fort', 'Kartmania Dracy-le-Fort'),
  ('City Kart', 'Saint-Sébastien-sur-Loire', 'City Kart Saint-Sébastien')
;

update public.circuits c set aliases = (
  select nullif(string_agg(distinct u.a, ' | '), '')
  from (
    select trim(x) as a
    from unnest(string_to_array(coalesce(c.aliases,'') || '|' || a.add_alias, '|')) as x
    where trim(x) <> '' and public.kart_normalize(trim(x)) <> public.kart_normalize(c.name)
  ) u
)
from alias_circuits a
where public.kart_normalize(c.name) = public.kart_normalize(a.old_name)
  and public.kart_normalize(coalesce(c.city,'')) = public.kart_normalize(coalesce(a.old_city,''));

-- ── 3. Nouveaux lieux : 101 kartings absents de notre base ────────────────
-- Géocodés (Nominatim, 1 requête/seconde) : 26 à l'adresse, 68 au code
-- postal, 9 à la commune. Un lieu que le relevé lui-même ne sait pas situer
-- (« commune à préciser ») est ÉCARTÉ : sans coordonnées il serait invisible
-- sur la carte.
--
-- Le garde `not exists` ci-dessous ne compare que les NOMS : c'est la
-- protection contre l'échec de migration, pas contre le doublon physique.
-- Celui-là a été traité en amont, en mesurant la distance de chaque nouveau
-- lieu à tous les circuits existants — le garde SQL seul aurait planté dix
-- épingles au même endroit, coupant en deux le record et les compteurs du
-- circuit concerné.
insert into public.circuits
  (name, city, is_official, lat, lon, length_m, width_m, env_kind, motor_kind,
   usage_kind, homologation, address, postal_code, phone, website, tracks_note, is_indoor)
select v.name, v.city, true, v.lat, v.lon, v.length_m, v.width_m, v.env_kind,
       v.motor_kind, v.usage_kind, v.homologation, v.address, v.postal_code,
       v.phone, v.website, v.tracks_note, coalesce(v.env_kind = 'indoor', false)
from (values
  ('27 Mot''Eure', 'Évreux', 49.02725, 1.14239, null, null, 'outdoor', null, 'mixte', null, '8 rue Rochette', '27000', null, null, null),
  ('Adren''Action', 'Montceau-les-Mines', 46.67405, 4.36317, null, null, 'outdoor', null, 'loisir', null, null, '71300', null, null, null),
  ('Aerokart', 'Argenteuil', 48.95365, 2.20556, 605.0, null, 'indoor', null, 'loisir', null, '199-203 route de Pontoise', '95100', '0130257190', 'https://aerokart.fr', null),
  ('Alcava Karting (Gueugnonnais)', 'Vitry-en-Charollais', 46.45434, 4.05927, null, null, 'outdoor', 'thermique', 'mixte', null, 'Bourg', '71600', null, null, null),
  ('Anneau Jaune', 'Haguenau', 48.83874, 7.83182, null, null, 'outdoor', null, 'loisir', null, null, '67500', null, null, null),
  ('Aqua Speed', 'Hourtin', 45.18212, -1.08425, null, null, 'outdoor', 'electrique', 'loisir', null, 'Île aux Enfants', '33990', null, null, null),
  ('Ardèche Loisirs Mécaniques', 'Grospierres', 44.4002, 4.28953, 700.0, 7.0, 'outdoor', 'thermique', 'loisir', null, null, '07120', null, 'https://ardecheloisirsmecaniques.com', null),
  ('B''Kart', 'Maurepas', 48.76187, 1.94515, 600.0, 6.5, 'indoor', null, 'loisir', null, 'Avenue Gutenberg, Z.A. Pariwest', '78310', '0130053131', 'https://bkart.fr', null),
  ('Bailly Loisirs', 'Bailly-en-Rivière', 49.91287, 1.33821, null, null, 'outdoor', null, null, null, '10 Rue de la Gare', '76630', null, null, null),
  ('BattleKart Metz', 'Metz', 49.1197, 6.17636, null, null, 'indoor', 'electrique', 'loisir', null, null, '57000', null, null, null),
  ('BattleKart Orléans', 'Fleury-les-Aubrais', 47.91991, 1.91477, null, null, 'indoor', 'electrique', 'loisir', null, '332 rue Marcelin Berthelot', '45400', '0238143864', 'https://battlekart.com/fr/orleans', null),
  ('BattleKart Paris Nord Villepinte', 'Villepinte', 48.96366, 2.53475, null, null, 'indoor', 'electrique', 'loisir', null, 'Parc des Expositions Paris Nord Villepinte, ZAC Paris Nord 2', '93420', null, 'https://paris-nord-villepinte.battlekart.com', null),
  ('BattleKart Tours', 'Tours', 47.39005, 0.68893, null, null, 'indoor', 'electrique', 'loisir', null, null, '37000', null, 'https://tours.battlekart.com', null),
  ('Bergerac Karting', 'Bergerac', 44.85346, 0.48753, null, null, 'outdoor', null, 'loisir', null, null, '24100', null, 'https://bergerac-karting.com', null),
  ('Cannes Karting', 'Cannes', 43.55152, 7.01344, null, null, 'indoor', 'electrique', 'loisir', null, null, '06400', null, 'https://canneskarting.com', null),
  ('Center Kart Noisiel', 'Noisiel', 48.84573, 2.62, 350.0, null, 'indoor', null, 'loisir', null, '7 rue de la Mare Blanche (Z.I.)', '77186', '0164804257', 'https://centerkart.fr', null),
  ('Chrono Kart 32', 'Pavie', 43.62042, 0.57833, null, null, 'indoor', null, 'loisir', null, 'ZI du Sousson', '32550', '0562664809', null, null),
  ('Circuit Carole', 'Tremblay-en-France', 48.9802, 2.55896, null, null, 'outdoor', 'thermique', 'mixte', null, 'Route Départementale 40', '93290', null, 'https://circuit-carole.com', null),
  ('Circuit Flatten', 'Waldwisse', 49.41375, 6.52952, null, null, 'outdoor', null, 'loisir', null, null, '57480', null, null, null),
  ('Circuit Intl Anthoine Hubert (RKO/ASK Angerville)', 'Angerville', 48.31067, 1.99798, 1200.0, 8.0, 'outdoor', 'thermique', 'mixte', 'CIK-FIA', 'Villeneuve, RD6 (dir. Pithiviers)', '91670', '0169950000', 'https://rko.fr', 'Piste 1200 m · Piste 1080 m'),
  ('Circuit Pau Arnos (piste karting)', 'Arnos', 43.45741, -0.53225, null, null, 'outdoor', null, 'mixte', null, null, null, null, null, null),
  ('Circuit de Karting Indoor Biarritz', 'Biarritz', 43.48325, -1.55928, 400.0, 6.0, 'indoor', 'thermique', 'loisir', null, null, '64200', null, null, null),
  ('Circuit de Loudun', 'Loudun', 47.01023, 0.08183, 1150.0, 8.0, 'outdoor', 'thermique', 'mixte', null, null, '86200', null, null, null),
  ('Circuit de Mantes-la-Jolie (ASK Mantes)', 'Mantes-la-Jolie', 48.9892, 1.71407, 709.0, 7.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Nationale 13 (dir. Vernon), ''La Butte Verte''', null, '0134781283', null, null),
  ('Circuit de Mornay', 'Bonnat', 46.32765, 1.90391, null, null, 'outdoor', 'thermique', 'mixte', null, null, '23220', null, null, null),
  ('Circuit du Bois Bidaut', 'Aubusson', 45.95538, 2.16745, null, null, 'outdoor', null, 'loisir', null, null, '23200', null, null, null),
  ('Circuit du Bourbonnais', 'Montbeugny', 46.5286, 3.4889, null, 10.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Aérodrome de Moulins-Montbeugny', '03340', '0470348002', 'https://circuitdubourbonnais.com', null),
  ('Circuits de Montemart', 'Malemort', 45.17968, 1.58948, 770.0, null, 'outdoor', 'thermique', 'mixte', null, null, '19360', null, null, 'Piste outdoor 770 m · Piste indoor 250 m'),
  ('Circuits du Nonnenfels', 'Klang', 49.3198, 6.3722, 800.0, null, 'outdoor', 'thermique', 'loisir', null, null, '57220', null, null, null),
  ('Cognac Karting Competition', 'Salles-d''Angles', 45.63185, -0.34634, 450.0, null, 'indoor', 'thermique', 'mixte', null, '2 chemin Notaire Royal', '16130', null, null, 'Piste indoor 450 m · Piste outdoor n°1 · Piste outdoor n°2'),
  ('Distra Kart', 'Saint-Paulien', 45.13585, 3.81311, 700.0, null, 'outdoor', 'thermique', 'loisir', null, 'Lieu-dit Le Versonne, RD906', '43350', '0471042375', 'https://distrakart-43.fr', null),
  ('Dynamic Kart (Quinssaines)', 'Quinssaines', 46.32762, 2.51057, null, null, 'outdoor', 'thermique', 'loisir', null, 'Lieu-dit Le Cordeau', '03380', '0470518569', 'https://dynamic-kart.fr', null),
  ('Défis Parc', 'Gauchy', 49.8254, 3.28146, null, null, 'indoor', null, 'loisir', null, null, '02100', null, 'https://defisparc.com', null),
  ('E-Kart''in Park', 'Andrézieux-Bouthéon', 45.52509, 4.25948, null, null, 'indoor', 'electrique', 'loisir', null, null, '42160', null, 'https://ekartin.fr', null),
  ('EIA (Circuits auto et karting de Pont-l''Évêque)', 'Pont-l''Évêque', 49.28498, 0.18326, 800.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '14130', null, null, null),
  ('Espace Henry Kart', 'Lons', 43.31541, -0.40976, null, null, 'indoor', null, 'loisir', null, null, '64140', null, null, null),
  ('Eurokart Valence', 'Châteauneuf-sur-Isère', 45.01484, 4.93914, 700.0, null, 'outdoor', 'thermique', 'loisir', null, '745 RN7, Le Saut des Chèvres (haut)', '26300', '0475846877', 'https://eurokart-location.com', null),
  ('Fun Kart Paris Sud', 'Vitry-sur-Seine', 48.78111, 2.4079, 400.0, null, 'indoor', 'mixte', 'loisir', null, '118-122 rue Léon Geffroy', '94400', '0146823200', 'https://fun-kart.com', null),
  ('Fun Kart''in D''oc', 'Aiguefonde', 43.49378, 2.31684, null, null, 'outdoor', 'electrique', 'loisir', null, '10 Route de Caucalières', '81200', null, null, null),
  ('Game Factory Besançon', 'Besançon', 47.23802, 6.02436, 400.0, null, 'indoor', 'thermique', 'loisir', null, 'Planoise (ZAC de Chateaufarine)', '25000', null, null, null),
  ('Games Factory', 'Dijon', 47.35113, 5.05908, null, null, 'indoor', null, 'loisir', null, '10 Rue Marguerite Yourcenar', '21000', null, 'https://gamesfactory.fr', null),
  ('K1 Speed Caen', 'Caen', 49.18134, -0.36356, null, null, 'indoor', 'electrique', 'loisir', null, null, '14000', null, 'https://k1speed.com', null),
  ('Kart Indoor Chrono', 'Fegersheim', 48.48973, 7.6798, 400.0, null, 'indoor', 'thermique', 'loisir', null, null, '67640', null, 'https://kartindoorchrono.fr', null),
  ('Kart Sensation', 'Bourg-Lastic', 45.64795, 2.55863, null, null, 'outdoor', null, 'loisir', null, 'D2089', '63760', '0473218889', 'https://kart-quad-sensations.com', null),
  ('Kart and Kart', 'Poincy', 48.96926, 2.93499, 600.0, null, 'indoor', null, 'loisir', null, 'Rue de la Briqueterie, Z.I. Entrepôt Piot', '77470', '0164365555', 'https://kartandkart.fr', 'Piste 600 m · Piste enfants'),
  ('Kart''Alp', 'Crots', 44.53293, 6.47095, null, null, 'outdoor', null, 'loisir', null, 'Le Boscodon, La Garenne', '05200', null, null, null),
  ('Kart''Eam', 'Nancy', 48.69372, 6.18341, 1200.0, null, 'outdoor', 'thermique', 'mixte', null, null, '54000', null, null, null),
  ('Kart''In Brive Indoor', 'Brive-la-Gaillarde', 45.1585, 1.53324, null, null, 'indoor', null, 'loisir', null, null, '19100', '0555240038', null, null),
  ('Kart''Indoor Bel Air', 'Rodez', 44.374, 2.53656, null, null, 'indoor', null, 'loisir', null, 'Rue des Artisans, ZA Bel Air', '12000', '0565784489', null, null),
  ('Kart''Innov', 'Bruay-la-Buissière', 50.4822, 2.54619, 350.0, null, 'indoor', 'electrique', 'loisir', null, null, '62700', null, null, null),
  ('Kart''Thiais', 'Thiais', 48.74621, 2.37295, 600.0, null, 'outdoor', 'thermique', 'loisir', null, '2 avenue du Docteur Marie', '94320', '0170251295', 'https://kartingthiais.com', null),
  ('Kart''West Indoor', 'Quimper', 47.99603, -4.10248, null, null, 'indoor', null, 'loisir', null, '4 rue Stade de Kerhuel', '29000', null, null, null),
  ('Karting 51 Indoor (Lasermaxx)', 'Cormontreuil', 49.21719, 4.05917, 300.0, 8.0, 'indoor', 'thermique', 'loisir', 'FFSA', '43 Rue du Commerce', '51350', null, 'https://karting-51.com', null),
  ('Karting Arena Bourges (STARGAMES)', 'Bourges', 47.08117, 2.39913, null, null, 'indoor', 'electrique', 'loisir', null, null, '18000', null, 'https://bourges-stargames.fr', null),
  ('Karting Belval', 'Belval-sous-Châtillon', 49.12228, 3.85504, 1500.0, null, 'outdoor', 'thermique', 'competition', null, null, '51160', null, 'https://karting-belval.fr', 'Piste 1500 m (compétition) · Piste 870 m (location) · Piste 650 m (entraînement)'),
  ('Karting Blois', 'Blois', 47.58769, 1.33376, 1100.0, null, 'outdoor', 'thermique', 'loisir', null, null, '41000', null, null, null),
  ('Karting Dellaroli', 'Barcelonnette', 44.3862, 6.65136, null, null, 'outdoor', null, 'loisir', null, 'ZI Saint Pons', '04400', null, null, null),
  ('Karting Indoor 88', 'Gérardmer', 48.07058, 6.8777, null, null, 'indoor', null, 'loisir', null, '1 Rue de l''Industrie', '88400', null, null, null),
  ('Karting Loisir 86 (Circuit des 3 Chênes)', 'Usseau', 46.87565, 0.50953, 800.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '86230', '0549851261', 'https://karting-loisir-86.fr', 'Piste outdoor 800 m · Piste indoor 450 m'),
  ('Karting de Guillac', 'Guillac', 47.9111, -2.46604, 618.0, 6.5, 'outdoor', 'thermique', 'mixte', null, null, '56800', null, null, null),
  ('Karting de Royan', 'Royan', 45.62453, -1.02876, 600.0, 8.0, 'outdoor', null, null, 'FFSA', '13 rue d''Arsonval, ZC Royan 2', '17000', '0546057994', 'https://karting-royan.com', null),
  ('Karting de Serre Chevalier', 'La Salle-les-Alpes', 44.94538, 6.57198, null, null, 'outdoor', null, 'loisir', null, null, '05240', null, null, null),
  ('Karting de la Gravona', 'Ajaccio', 41.9264, 8.7376, 600.0, null, 'outdoor', 'thermique', 'mixte', 'FFSA', null, '20167', null, 'https://karting-gravona.corsica', null),
  ('Karting du Tydos', 'Lourdes', 43.09409, -0.0465, null, null, 'outdoor', null, 'loisir', null, null, '65100', null, null, null),
  ('Katr''Aid', 'La Rochelle', 46.17645, -1.13692, null, null, 'outdoor', null, 'mixte', null, '147 rue Marius Lacroix', '17000', null, null, null),
  ('Le Blizz', 'Rennes', 48.13254, -1.65072, null, null, 'indoor', 'electrique', 'loisir', null, '8 Avenue des Gayeulles', '35000', '0299362810', 'https://leblizz.com', null),
  ('Le Réservoir (SARL)', 'Le Havre', 49.50008, 0.19023, null, null, 'outdoor', null, null, null, '581 Boulevard Jules Durand', '76600', null, null, null),
  ('Ledoux Karting', 'Levet', 46.92546, 2.40699, 1200.0, 7.5, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Montavelange', '18340', null, 'https://ledoux-karting.fr', null),
  ('Loisi Flandres', 'Saint-Omer', 50.75158, 2.25342, null, null, 'indoor', null, 'loisir', null, null, '62500', null, null, null),
  ('LoisiGames Wittenheim (BattleKart)', 'Wittenheim', 47.80808, 7.33737, null, null, 'indoor', 'electrique', 'loisir', null, 'ZAC du Carreau, Rue des Mines Anna', '68270', null, 'https://wittenheim.loisigames.fr', null),
  ('MG Kart', 'Souppes-sur-Loing', 48.18681, 2.74267, 400.0, 6.0, 'outdoor', null, 'loisir', null, 'Parc Municipal, Rue des Mariniers', '77460', '0164281132', 'https://mgkart77.com', null),
  ('Millau Center Karts (Parc des Bouscaillous)', 'Castelnau-Pégayrols', 44.12974, 2.93255, 780.0, null, 'outdoor', 'thermique', 'loisir', null, 'RN911', '12620', null, null, null),
  ('PKI – Plérin Komplex Indoor', 'Plérin', 48.53488, -2.76958, null, null, 'indoor', null, 'loisir', null, null, '22190', null, 'https://le-pki.fr', null),
  ('Parc de Loisirs de l''Escotais', 'Neuillé-Pont-Pierre', 47.54854, 0.54815, null, null, 'outdoor', null, 'loisir', null, 'Le Moulin de Perron, D28', '37360', null, null, null),
  ('Paris Kart Indoor', 'Wissous', 48.73164, 2.32687, null, null, 'indoor', null, 'loisir', null, 'Z.I. de Villemilan, 6 bd Arago', '91320', '0160111313', 'https://pariskart.com', 'Piste indoor · Piste outdoor · Piste glisse / funny-bike'),
  ('Performances Loisirs', 'Verneuil-sur-Seine', 48.97921, 1.97564, 400.0, 6.0, 'outdoor', null, 'loisir', null, 'Z.I. du Rouillard', '78480', '0139710111', null, null),
  ('Planet Minia', 'Bourg-en-Bresse', 46.20512, 5.22503, null, null, null, 'electrique', 'loisir', null, null, '01000', null, null, null),
  ('Pro Race Café', 'Montpellier', 43.61124, 3.87673, null, null, 'indoor', 'electrique', 'loisir', null, null, '34000', null, 'https://proracecafe.com', null),
  ('RKO – Karting de Lohéac', 'Lohéac', 47.86666, -1.88547, null, null, 'outdoor', 'thermique', 'mixte', null, null, '35550', null, 'https://rko-loheac.fr', null),
  ('Racing Kart Loisirs', 'Albi', 43.90129, 2.14312, null, null, 'indoor', null, 'loisir', null, 'Chemin Albert Einstein', '81000', null, null, null),
  ('Racing Kart de Cormeilles (RKC)', 'Boissy-l''Aillerie', 49.07706, 2.02917, 1200.0, 8.0, 'outdoor', 'thermique', 'mixte', 'FFSA', 'Aérodrome de Cormeilles-en-Vexin', '95650', '0130732800', 'https://rkc.fr', 'Grande piste 1200 m · Piste 900 m · Circuit enfants'),
  ('Royal Tuning Club', 'Bernay', 49.18916, 0.72884, null, null, 'outdoor', null, 'mixte', null, '2 rue Jean Jacques Rousseau', '27300', null, null, null),
  ('SKLC 55', 'Chaumont-sur-Aire', 48.92778, 5.25622, 713.0, 6.5, 'outdoor', 'thermique', 'mixte', null, null, '55260', null, null, null),
  ('Sens Espaces Karting', 'Soucy', 48.25689, 3.31825, null, null, 'outdoor', 'thermique', 'mixte', null, 'Route de la Chapelle-sur-Oreuse', '89100', null, null, null),
  ('Speed Karting (Speed Loisirs)', 'Saint-Georges-de-Reneins', 46.05455, 4.71901, null, null, 'indoor', 'thermique', 'loisir', null, '436 boulevard Napoléon Bullukian', '69830', '0474090549', 'https://speedloisirs.net', null),
  ('Speed Karting Saint-Marcel', 'Saint-Marcel', 46.77594, 4.88756, null, null, 'indoor', 'thermique', 'loisir', null, null, '71380', '0469002048', 'https://speedloisirs.net', null),
  ('Speed Zone', 'Flers', 48.74842, -0.56973, null, null, 'indoor', 'electrique', 'loisir', null, 'Route de Banvou, Z.I. La Crochère', '61100', null, null, null),
  ('SpeedPark Jaux-Compiègne', 'Jaux', 49.40296, 2.77503, null, null, 'indoor', 'thermique', 'loisir', null, 'Place Jacques Tati', '60880', '0344367023', 'https://speedpark.fr/jaux-compiegne', null),
  ('Starlight (S-Kart)', 'Saint-Denis', 48.90405, 2.35896, 700.0, null, 'indoor', null, 'loisir', null, '56-58 avenue du Président Wilson', '93210', '0149469393', 'https://s-kart.com', null),
  ('Team Marius Karting', 'Nancy', 48.69372, 6.18341, 600.0, null, 'indoor', 'thermique', 'loisir', 'FFSA', null, '54000', null, null, null),
  ('Vendée Kart', 'La Jonchère', 46.42134, -1.39115, null, null, 'outdoor', null, 'loisir', null, '16 Rue des Artisans', '85540', '0251308996', 'https://vendeekart.fr', null),
  ('Vertig''O Parc (circuit karting)', 'La Jarne', 46.12861, -1.07278, null, null, 'outdoor', null, 'loisir', null, null, '17220', null, null, null),
  ('Wakalase Cernay', 'Cernay', 47.80868, 7.17877, 450.0, null, 'indoor', 'electrique', 'loisir', null, null, '68700', null, 'https://cernay.wakalase.com', null),
  ('X Motorsport Indoor', 'Saint-Dizier', 48.6513, 4.96409, null, null, 'indoor', null, 'loisir', null, 'Rue de la Vacquerie', '52100', '0325069597', null, null),
  ('Xtrem Center', 'Valence', 44.89705, 4.88884, null, null, 'indoor', null, 'loisir', null, '126 route de Beauvallon', '26000', null, null, null),
  ('Karting Évasion (Bully)', 'Bully', 45.85758, 4.56107, 400.0, null, 'outdoor', 'thermique', 'loisir', null, 'Chemin de la Plagne', '69210', null, 'https://karting-evasion.fr', null),
  ('MP Karting', 'Saint-Martin-de-Valgalgues', 44.16208, 4.08322, null, null, 'outdoor', 'thermique', 'loisir', null, null, '30520', null, null, null),
  ('BKI – Brest Kart Indoor', 'Brest', 48.42415, -4.4691, null, null, 'indoor', null, 'loisir', null, '10 rue Alain Le Berre', '29200', null, null, null),
  ('Kart''In (Park Events)', 'Vénissieux', 45.71566, 4.8599, 600.0, null, 'indoor', 'mixte', 'loisir', 'FFSA', '17 chemin du Génie', '69200', '0472780505', null, null),
  ('Le Kart', 'Saint-Gorgon', 48.32454, 6.64758, 490.0, null, 'indoor', 'thermique', 'mixte', null, null, '88700', null, 'https://le-kart.fr', null),
  ('Performances Drive', 'Saint-Cyprien', 45.53777, 4.23605, null, null, 'outdoor', null, 'loisir', null, null, '42160', null, 'https://performances-drive.fr', null)
) as v(name, city, lat, lon, length_m, width_m, env_kind, motor_kind, usage_kind,
       homologation, address, postal_code, phone, website, tracks_note)
where not exists (
  select 1 from public.circuits c
  where public.kart_normalize(c.name) = public.kart_normalize(v.name)
    and public.kart_normalize(coalesce(c.city,'')) = public.kart_normalize(coalesce(v.city,''))
);

-- ── 4. Contrôles ─────────────────────────────────────────────────────────
do $$
declare
  v_total int; v_long int; v_env int; v_motor int; v_usage int; v_homol int;
  v_pistes int; v_hors int; v_proches int;
begin
  select count(*) into v_total from public.circuits;
  select count(*) into v_long from public.circuits where length_m is not null;
  select count(*) into v_env from public.circuits where env_kind is not null;
  select count(*) into v_motor from public.circuits where motor_kind is not null;
  select count(*) into v_usage from public.circuits where usage_kind is not null;
  select count(*) into v_homol from public.circuits where homologation is not null;
  select count(*) into v_pistes from public.circuits where tracks_note is not null;
  select count(*) into v_hors from public.circuits where lat is null or lon is null;
  raise notice 'Circuits : % au total · % longueurs · % types · % motorisations · % usages · % homologations · % tracés multiples',
    v_total, v_long, v_env, v_motor, v_usage, v_homol, v_pistes;
  if v_hors > 0 then
    raise exception 'Des circuits sans coordonnées : ils seraient invisibles sur la carte';
  end if;

  -- Deux épingles au même endroit coupent en deux le record du circuit et ses
  -- compteurs, et les pilotes en choisissent une au hasard. On le MESURE ici :
  -- c'est le contrôle qui manquait à la première version.
  select count(*) into v_proches from (
    select 1 from public.circuits a join public.circuits b on a.id < b.id
    where public.km_between(a.lat, a.lon, b.lat, b.lon) < 0.3
  ) x;
  -- UNE paire attendue : deux salles de Nancy que le relevé ne situe qu'à
  -- « Est de Nancy ». Géocodées à la commune, elles tombent sur le même point.
  -- Ce sont deux établissements distincts : les empiler est moins faux que
  -- d'en écarter un, ou que de leur inventer des coordonnées.
  raise notice 'Circuits à moins de 300 m d''un autre : % (1 attendue : deux salles de Nancy situées à la commune)', v_proches;
end $$;

-- ── 5. La fiche circuit sert les nouvelles données ───────────────────────
-- Reprise depuis sa DERNIÈRE définition (A11) : repartir d'une version
-- antérieure ferait retomber les règles des tableaux (courses ≥ 2 inscrits,
-- suspendus exclus) — régression déjà vécue et consignée.
--
-- `drop` d'abord : `create or replace` REFUSE de changer le type de retour, et
-- on ajoute neuf colonnes. Aucune fonction ni vue ne référence celle-ci (seul
-- le client l'appelle), la suppression est donc sans effet de bord.
drop function if exists public.get_circuit_page(uuid);
create function public.get_circuit_page(p_circuit_id uuid)
returns table (
  id uuid, name text, city text, lat double precision, lon double precision,
  aliases text, website text, phone text, is_indoor boolean,
  races_count bigint, pilots_count bigint, last_race_at timestamptz,
  my_races_count bigint, my_best_lap_ms integer,
  laps_all bigint, laps_year bigint, laps_month bigint,
  length_m numeric, width_m numeric, env_kind text, motor_kind text,
  usage_kind text, homologation text, address text, postal_code text,
  tracks_note text
)
language sql stable security definer set search_path = public as $$
  with jouees as (
    select ra.id, ra.completed_at
    from races ra
    where ra.circuit_id = p_circuit_id and ra.status = 'completed'
  ),
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
      where e.completed_at > now() - interval '30 days'),
    c.length_m, c.width_m, c.env_kind, c.motor_kind, c.usage_kind,
    c.homologation, c.address, c.postal_code, c.tracks_note
  from circuits c
  where c.id = p_circuit_id;
$$;
revoke all on function public.get_circuit_page(uuid) from public, anon;
grant execute on function public.get_circuit_page(uuid) to authenticated;

commit;
