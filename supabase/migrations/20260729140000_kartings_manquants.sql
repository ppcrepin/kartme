-- KartSquad — kartings manquants (2e passe OpenStreetMap).
--
-- Retour PO après mise en ligne de la carte : « il manque certains kartings ».
-- Exact. La première requête ne ramenait que les objets explicitement
-- étiquetés `sport=karting` ; un karting cartographié comme simple centre de
-- loisirs, ou dont seul le NOM dit « karting », passait au travers.
--
-- Seconde passe sur le nom autant que sur l'étiquette. Le filtre a dû être
-- resserré : chercher « kart » dans un nom ramène des fermes basques
-- (Karrikartea, Bizkarteko Borda), « Jakarta » et une carte géologique. Trois
-- preuves acceptables retenues : `sport` contient « kart », ou le nom contient
-- « karting » en toutes lettres, ou il contient « kart » comme mot ET l'objet
-- porte une étiquette d'équipement sportif.
--
-- 26 kartings de plus, tous géolocalisés et avec leur ville. À noter : le vrai
-- karting de Muret et celui d'Aix-en-Provence apparaissent ici — deux villes
-- dont on avait supprimé la veille des entrées fictives faute de trouver le
-- moindre équipement réel. Elles existaient, sous d'autres noms.
--
-- IDEMPOTENT, et sans effet si l'import précédent n'a pas été passé.

begin;

do $garde$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'circuits'
                    and column_name = 'lat') then
    raise exception 'Applique d''abord 20260729100000_circuits_geo.sql';
  end if;
end $garde$;

insert into public.circuits (name, city, is_official, lat, lon)
select v.name, v.city, true, v.lat, v.lon
from (values
  ('A.S. Karting Le Coteau', 'Roanne', 46.04034, 4.09016),
  ('Circuit de Karting du Parc', 'Le Parc', 48.76528, -1.28454),
  ('Circuit de karting Kart Extrem', 'Saint-Genis-de-Saintonge', 45.48885, -0.55986),
  ('Circuit Karting de Pont-L''Évêque', 'Pierrefitte-en-Auge', 49.26271, 0.19364),
  ('Complexe sportif de karting de la Hague', 'La Hague', 49.66293, -1.81437),
  ('Euro Dieppe Karting', 'Rouxmesnil-Bouteilles', 49.90147, 1.10779),
  ('Kart Landes 40', 'Escource', 44.1628, -0.96784),
  ('Karting 79', 'Chauray', 46.3442, -0.36767),
  ('Karting - Circuit de Muret', 'Muret', 43.45513, 1.28006),
  ('Karting de Monteux', 'Monteux', 44.05341, 4.9461),
  ('Karting de Saintes', 'Les Gonds', 45.69775, -0.61591),
  ('Karting des Poudrières', 'Dommartin', 46.91827, 6.33314),
  ('Karting di a Granova', 'Tavaco', 42.0167, 8.89034),
  ('Karting Haute Picardie', 'Arvillers', 49.75263, 2.65475),
  ('Karting Indoor', 'Aix-en-Provence', 43.48754, 5.37661),
  ('Karting Meisenthal', 'Meisenthal', 48.97537, 7.32938),
  ('Karting Number One', 'Agde', 43.30227, 3.45632),
  ('Karting Six-Fours', 'Six-Fours-les-Plages', 43.12156, 5.8433),
  ('La Fabrique Ludique', 'Roquefort', 44.04268, -0.32095),
  ('Landes Karting', 'Landes-le-Gaulois', 47.66872, 1.21601),
  ('Nantes Karting NEK', 'Nantes', 47.25383, -1.49823),
  ('Normandie Karting', 'Val-de-la-Haye', 49.38743, 1.00629),
  ('Piste karting Selongey', 'Selongey', 47.6108, 5.23348),
  ('Rallye Kart', 'Roquebrune-sur-Argens', 43.46119, 6.65215),
  ('Speed Fun Karting', 'Bessines', 46.29172, -0.50819),
  ('Tahiti Karting', 'Hitiaʻa ʻo te Rā', -17.53241, -149.43199)
) as v(name, city, lat, lon)
where not exists (
  select 1 from public.circuits c
   where c.is_official
     and public.kart_normalize(c.name) = public.kart_normalize(v.name)
     and public.kart_normalize(coalesce(c.city, '')) = public.kart_normalize(v.city)
);

do $bilan$
declare n int; g int;
begin
  select count(*), count(*) filter (where lat is not null) into n, g from public.circuits;
  raise notice 'Référentiel : % circuits, dont % géolocalisés', n, g;
end $bilan$;

commit;
