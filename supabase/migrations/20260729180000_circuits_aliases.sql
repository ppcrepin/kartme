-- KartSquad — noms alternatifs des kartings (retour PO 2026-07-29).
--
-- « Le karting de Trappes s'appelle BRK. Si je tape BRK, je dois le voir. »
-- Exact, et c'est vrai partout : les pilotes connaissent leur piste par son
-- sigle, son enseigne ou son ancien nom, rarement par le libellé officiel
-- d'OpenStreetMap. Une recherche qui ne connaît qu'un seul nom par lieu ne
-- trouve rien à celui qui y court toutes les semaines.
--
-- Les alias viennent des champs `alt_name`, `short_name`, `official_name`,
-- `operator`, `brand`, `old_name` d'OpenStreetMap, et d'une petite liste tenue
-- à la main pour ce qu'OSM ne porte pas (BRK). Ils ne s'affichent pas : ils
-- servent uniquement à être trouvé.
--
-- IDEMPOTENT.

begin;

alter table public.circuits add column if not exists aliases text;

with a(nom, ville, alias) as (values
  ('Actua kart', 'Saint-Laurent-de-Mure', 'Circuit de Lyon'),
  ('AS Karting Corsika', 'Biguglia', 'Complexe Henri Muzio'),
  ('Astra Kart Ozan', 'Ozan', 'Karting Ozan'),
  ('Boca Speed', 'Moncoutant-sur-Sèvre', 'Circuit de la Sèvre'),
  ('Cap Karting', 'Mer', 'Circuit de Mer'),
  ('Circuit automobile Maurice Tissandier', 'Montgivray', 'Circuit de la Châtre'),
  ('Circuit Beausoleil', 'Laval', 'Circuit Louis Paillard'),
  ('Circuit Beltoise-Trappes', 'Trappes', 'BRK · Beltoise Racing Kart'),
  ('Circuit de Cabourg - Team Active', 'Cabourg', 'Team Active'),
  ('Circuit de Karting de Brignoles', 'Brignoles', 'Ciricuit Jean Vial'),
  ('Circuit du Bugey', 'Château-Gaillard', 'Karting de Chateau-Gaillard'),
  ('Circuit du Périgord', 'Teyjat', 'Karting du Périgord'),
  ('Circuit International de Karting d''Aunay-les-Bois', 'Aunay-les-Bois', 'Circuit Karting Essay'),
  ('Circuit International de Lavelanet', 'Aigues-Vives', 'Circuit International Mathieu Vidal'),
  ('Circuit International de Saint-Amand', 'Colombiers', 'Circuit International de karting'),
  ('Energy Karting Saint-Cyr', 'Saint-Cyr', 'Energy Karting'),
  ('Fun-Kart', 'Le Bar-sur-Loup', 'Enedis'),
  ('Kart 56', 'Ploemel', 'Karting de Ploemel'),
  ('Kartind du Nord Mayenne', 'Montreuil-Poulay', 'Karting du Fouteau'),
  ('Karting Circuit Paul Ricard', 'Le Castellet', 'KTT'),
  ('Karting de Crolles', 'Crolles', 'Chronokart'),
  ('Karting de Magescq', 'Magescq', 'Karting des Pins'),
  ('Karting de Marcillat en Combraille', 'Marcillat-en-Combraille', 'GTR Performance'),
  ('Karting de Monteux', 'Monteux', 'privé'),
  ('Karting de Nakutakoin', 'Dumbéa', 'Kart Parc Pacific'),
  ('Karting de Pers', 'Le Rouget-Pers', 'Circuit le Lissartel'),
  ('Karting des 24h Le Mans', 'Le Mans', 'ACO · Virage Corvette'),
  ('Karting Meisenthal', 'Meisenthal', 'Club vosgien Soucht · WSV Karting'),
  ('Karting Sarron', 'Riom', 'Circuit Sarron'),
  ('Karting Sud Toulois', 'Barisey-au-Plain', 'Enedis'),
  ('Karukera Karting Cup', 'Baie-Mahault', 'KKC'),
  ('Kpb 14', 'Marolles', 'Kpb14'),
  ('Les Amis de l''UFOLEP', 'Joué-lès-Tours', 'UFOLEP'),
  ('Méga Kart', 'Saint-Louis', 'Giga Kart'),
  ('Passion Karting 17', 'Saint-Jean-d''Angély', 'Angely Racing Kart'),
  ('Piste de karting', 'Le Creusot', 'Karting Évasion'),
  ('Piste de Karting d''Anneville-Ambourville', 'Anneville-Ambourville', 'Castrol · Double gauche · Oméga · Virage de la ligne droite · Virage des stands · Virage du Bois · Virage du Stadium · Épingle du bas · Épingle du haut'),
  ('SpeedPark Conflans-Sainte-Honorine', 'Conflans-Sainte-Honorine', 'SpeedPark')
)
update public.circuits c
   set aliases = a.alias
  from a
 where c.is_official
   and public.kart_normalize(c.name) = public.kart_normalize(a.nom)
   and public.kart_normalize(coalesce(c.city, '')) = public.kart_normalize(a.ville);

-- La recherche interroge le nom, la ville ET les alias.
drop function if exists public.search_circuits(text);
create function public.search_circuits(q text)
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, aliases text, total bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon, c.aliases,
         count(*) over () as total
  from circuits c
  where coalesce(trim(q), '') = ''
     or public.kart_normalize(c.name) like '%' || public.kart_normalize(q) || '%'
     or public.kart_normalize(coalesce(c.city, '')) like '%' || public.kart_normalize(q) || '%'
     or public.kart_normalize(coalesce(c.aliases, '')) like '%' || public.kart_normalize(q) || '%'
  order by c.is_official desc, c.name
  limit 20;
$$;
revoke all on function public.search_circuits(text) from public, anon;
grant execute on function public.search_circuits(text) to authenticated;

-- La carte a besoin des alias pour filtrer sa liste sans rappeler le serveur.
drop function if exists public.nearby_circuits(double precision, double precision, int, double precision);
create function public.nearby_circuits(
  p_lat double precision, p_lon double precision,
  p_limit int default 8, p_max_km double precision default 150
)
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, aliases text, km double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon, c.aliases,
         public.km_between(p_lat, p_lon, c.lat, c.lon) as km
  from circuits c
  where c.lat is not null and c.lon is not null
    and p_lat between -90 and 90
    and p_lon between -180 and 180
    and public.km_between(p_lat, p_lon, c.lat, c.lon) <= greatest(coalesce(p_max_km, 150), 0)
  order by km, c.name
  limit greatest(coalesce(p_limit, 8), 0);
$$;
revoke all on function public.nearby_circuits(double precision, double precision, int, double precision)
  from public, anon;
grant execute on function public.nearby_circuits(double precision, double precision, int, double precision)
  to authenticated;

drop function if exists public.my_recent_circuits();
create function public.my_recent_circuits()
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, aliases text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon, c.aliases
  from circuits c
  join (
    select r.circuit_id, max(r.scheduled_at) as last_raced
    from races r
    join participations pp on pp.race_id = r.id
    where pp.profile_id = auth.uid() and r.circuit_id is not null
    group by r.circuit_id
  ) mine on mine.circuit_id = c.id
  order by mine.last_raced desc
  limit 8;
$$;
revoke all on function public.my_recent_circuits() from public, anon;
grant execute on function public.my_recent_circuits() to authenticated;

do $bilan$
declare n int;
begin
  select count(*) into n from public.circuits where aliases is not null;
  raise notice 'Alias renseignés sur % circuits', n;
end $bilan$;

commit;
