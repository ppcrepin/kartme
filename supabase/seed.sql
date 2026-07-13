-- Seed KartSquad — circuits de karting français les plus connus.
-- Liste de départ (is_official = true) ; elle s'enrichit ensuite avec les
-- ajouts libres des utilisateurs. Le dédoublonnage se fait au fil de l'eau.
-- Idempotent : ne réinsère pas un circuit officiel déjà présent.

insert into public.circuits (name, city, is_official)
select v.name, v.city, true
from (values
  ('Racing Kart de Cormeilles', 'Cormeilles-en-Vexin'),
  ('Le Mans Karting International', 'Le Mans'),
  ('Circuit Paul Ricard Karting', 'Le Castellet'),
  ('Karting de Salbris', 'Salbris'),
  ('Karting d''Angerville', 'Angerville'),
  ('Kart''Up Paris', 'Paris'),
  ('Karting de Trappes', 'Trappes'),
  ('RKC Roubaix', 'Roubaix'),
  ('Karting de Mornant', 'Mornant'),
  ('Speed Park Lyon', 'Lyon'),
  ('Kart Indoor Villebon', 'Villebon-sur-Yvette'),
  ('Karting d''Aix-en-Provence', 'Aix-en-Provence'),
  ('Circuit de Lavilledieu', 'Lavilledieu'),
  ('Karting d''Ancenis', 'Ancenis'),
  ('Kart''in Wittelsheim', 'Wittelsheim'),
  ('Karting de Bordeaux Mérignac', 'Mérignac'),
  ('Karting de Nantes', 'Nantes'),
  ('Karting de Toulouse', 'Toulouse'),
  ('Karting de Biscarrosse', 'Biscarrosse'),
  ('Karting de Fontenay-le-Comte', 'Fontenay-le-Comte'),
  ('Karting du Val d''Argenton', 'Argenton-les-Vallées'),
  ('Circuit de Croix-en-Ternois', 'Croix-en-Ternois'),
  ('Karting de Dijon-Prenois', 'Prenois'),
  ('Karting de Muret', 'Muret')
) as v(name, city)
where not exists (
  select 1 from public.circuits c
  where c.is_official and lower(c.name) = lower(v.name)
);
