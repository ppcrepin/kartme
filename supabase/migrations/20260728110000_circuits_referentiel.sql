-- KartSquad — A4 : circuits en RÉFÉRENTIEL maîtrisé (décision PO 2026-07-28).
--
-- Fini l'ajout libre de kartings par les utilisateurs : c'était la source
-- garantie de doublons (« Karting Villebon » / « karting de villebon » / « RKC
-- Villebon »). Le référentiel est désormais alimenté uniquement côté serveur
-- (seed / éditeur SQL / modération) — l'import « kartings de France » se fera
-- par ce canal.
--
-- En échange, la RECHERCHE devient sérieuse :
--   · tolérante (accents, casse, ponctuation — via kart_normalize) ;
--   · sur le NOM **et la VILLE** (« Villebon » ou « 91 » trouvent le circuit) ;
--   · « Tes circuits » : les pistes où TU as déjà couru, proposées d'emblée.

-- ── 1. Fermeture de l'ajout client ─────────────────────────────────────────
drop policy if exists circuits_insert on public.circuits;
revoke insert on public.circuits from authenticated;
-- (Le trigger de filtre de mots et le rate-limit restent en place : sans objet
--  pour les clients désormais, ils continuent de protéger les écritures
--  privilégiées.)

-- ── 2. Recherche tolérante nom + ville ─────────────────────────────────────
-- kart_normalize (lot 3.1a) : minuscules, sans accents, lettres/chiffres seuls.
create or replace function public.search_circuits(q text)
returns table (id uuid, name text, city text, is_official boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official
  from circuits c
  where coalesce(trim(q), '') = ''
     or public.kart_normalize(c.name) like '%' || public.kart_normalize(q) || '%'
     or public.kart_normalize(coalesce(c.city, '')) like '%' || public.kart_normalize(q) || '%'
  order by c.is_official desc, c.name
  limit 20;
$$;
revoke all on function public.search_circuits(text) from public, anon;
grant execute on function public.search_circuits(text) to authenticated;

-- ── 3. « Tes circuits » : les pistes où j'ai déjà couru, récentes d'abord ──
create or replace function public.my_recent_circuits()
returns table (id uuid, name text, city text, is_official boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official
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
