-- KartSquad — A12(a) : la géographie entre dans le référentiel.
--                + décision PO 2026-07-29 : les suspendus sortent du classement.
--
-- Deux sujets sans rapport, réunis parce qu'ils sont tous deux petits et que
-- le PO colle le SQL à la main : une migration de moins à lancer.
--
-- ── Pourquoi la géographie ────────────────────────────────────────────────
-- Le référentiel est fermé depuis A4 (plus d'ajout libre), et l'import des
-- kartings de France va le faire passer de 24 à quelques centaines de lignes.
-- À cette taille, une liste alphabétique est inutilisable : la seule question
-- que se pose un pilote, c'est « lequel est près de moi ? ». On ajoute donc
-- les coordonnées et un tri par distance.
--
-- Pas de PostGIS : à quelques centaines de circuits, un balayage complet avec
-- une formule de haversine coûte moins qu'une extension à installer, à mettre
-- à jour et à faire vivre. Le jour où le référentiel dépasse quelques milliers
-- de lignes, ce sera le moment d'y passer — pas avant.

-- ═══ 1. Classement : les comptes suspendus et supprimés en sortent ════════
-- Décision PO 2026-07-29. La fiche pilote et la recherche les excluaient déjà
-- (`get_pilot`, `search_pilots`) : le classement était le dernier endroit où
-- un pilote sanctionné restait en vitrine.
--
-- `get_leaderboard` ET `get_my_rank` sont modifiées ENSEMBLE : la seconde
-- calcule mon rang en COMPTANT les pilotes devant moi. Si les deux ne
-- filtraient pas à l'identique, la carte « Ma position » annoncerait un rang
-- que la liste juste en dessous contredirait.
drop function if exists public.get_leaderboard(text, int, int);
create function public.get_leaderboard(p_scope text, p_limit int default 100, p_offset int default 0)
returns table (
  rank bigint, profile_id uuid, ghost_id uuid, username text,
  elo integer, races bigint, is_me boolean, avatar_path text
)
language plpgsql security definer set search_path = public stable
as $$
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  return query
  with pilots as (
    select p.id as profile_id, null::uuid as ghost_id, p.username, p.elo,
           h.races, (p.id = auth.uid()) as is_me,
           -- Le chemin suit la visibilité de la ligne : la clause ci-dessous
           -- ne laisse passer un profil privé que si c'est moi ou un ami, et
           -- une photo retirée par la modération a déjà son chemin à null.
           -- Depuis l'exclusion des suspendus, l'équivalence avec
           -- `can_read_avatar` est enfin exacte.
           p.avatar_path
    from profiles p
    join lateral (
      select count(*) as races from elo_history eh where eh.profile_id = p.id
    ) h on true
    where h.races > 0
      and p.deleted_at is null
      and p.suspended_at is null
      and not public.is_blocked(p.id, auth.uid())
      and (
        p.id = auth.uid()
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = p.id and f.addressee_id = auth.uid())
              or (f.addressee_id = p.id and f.requester_id = auth.uid()))
        )
        or (p_scope = 'global' and not p.is_private)
      )
    -- (pas de branche fantômes : ils n'ont plus d'Elo compétitif — anti-triche
    --  du 2026-07-13, à ne surtout pas rouvrir)
  )
  select rank() over (order by pl.elo desc) as rank,
         pl.profile_id, pl.ghost_id, pl.username, pl.elo, pl.races, pl.is_me,
         pl.avatar_path
  from pilots pl
  -- « order by 1 » (le rang) : un « order by rank » nu serait capturé par le
  -- paramètre de sortie homonyme (plpgsql, variable_conflict). Les critères
  -- suivants rendent l'ordre des ex æquo déterministe (pagination stable).
  order by 1, pl.races desc, pl.username asc, coalesce(pl.profile_id, pl.ghost_id) asc
  -- coalesce AVANT greatest : greatest(null, 0) vaudrait 0 (NULL ignoré).
  limit greatest(coalesce(p_limit, 100), 0) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.get_leaderboard(text, int, int) from public;
grant execute on function public.get_leaderboard(text, int, int) to authenticated;

-- Le type de retour porte AUSSI `total` (carte « Ma position » : Top X%) —
-- version du 2026-07-14, pas celle du lot 2.2.
create or replace function public.get_my_rank(p_scope text)
returns table (rank bigint, elo integer, races bigint, total bigint)
language plpgsql security definer set search_path = public stable
as $$
declare
  v_elo integer;
  v_races bigint;
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  -- Un compte suspendu n'a plus de position : il ne figure plus dans la liste,
  -- lui annoncer un rang serait un mensonge.
  select p.elo into v_elo from profiles p
   where p.id = auth.uid() and p.deleted_at is null and p.suspended_at is null;
  if v_elo is null then return; end if;
  select count(*) into v_races from elo_history eh where eh.profile_id = auth.uid();
  if v_races = 0 then return; end if;

  return query
  select
    -- rang : nombre de pilotes de la portée avec un Elo strictement supérieur, +1
    1 + (select count(*)
       from profiles p
       where p.id <> auth.uid()
         and p.elo > v_elo
         and p.deleted_at is null
         and p.suspended_at is null
         and exists (select 1 from elo_history eh where eh.profile_id = p.id)
         and not public.is_blocked(p.id, auth.uid())
         and (
           exists (
             select 1 from friendships f
             where f.status = 'accepted'
               and ((f.requester_id = p.id and f.addressee_id = auth.uid())
                 or (f.addressee_id = p.id and f.requester_id = auth.uid()))
           )
           or (p_scope = 'global' and not p.is_private)
         )),
    v_elo, v_races,
    -- total classés dans la portée (moi inclus) : même éligibilité, sans le
    -- filtre « Elo supérieur ». Les deux comptages DOIVENT filtrer à
    -- l'identique, sinon le Top X% dépasserait 100 %.
    1 + (select count(*)
       from profiles p
       where p.id <> auth.uid()
         and p.deleted_at is null
         and p.suspended_at is null
         and exists (select 1 from elo_history eh where eh.profile_id = p.id)
         and not public.is_blocked(p.id, auth.uid())
         and (
           exists (
             select 1 from friendships f
             where f.status = 'accepted'
               and ((f.requester_id = p.id and f.addressee_id = auth.uid())
                 or (f.addressee_id = p.id and f.requester_id = auth.uid()))
           )
           or (p_scope = 'global' and not p.is_private)
         ));
end;
$$;
revoke all on function public.get_my_rank(text) from public, anon;
grant execute on function public.get_my_rank(text) to authenticated;

-- ═══ 2. Coordonnées des circuits ══════════════════════════════════════════
alter table public.circuits add column if not exists lat double precision;
alter table public.circuits add column if not exists lon double precision;

-- Les deux ensemble ou aucune : une latitude seule ne situe rien, et un
-- circuit à moitié géocodé se serait glissé dans les tris par distance avec
-- une longitude NULL — donc une distance NULL, donc une place arbitraire.
--
-- `num_nonnulls` plutôt que « lat is null and lon is null or lat between… » :
-- un CHECK qui s'évalue à NULL est ACCEPTÉ par Postgres. Avec la seconde
-- forme, poser une latitude en laissant la longitude à NULL rendait la
-- comparaison NULL — et la contrainte laissait passer très exactement le cas
-- qu'elle existait pour interdire. Attrapé par le test, pas à la relecture.
alter table public.circuits drop constraint if exists circuits_coords_shape;
alter table public.circuits add constraint circuits_coords_shape check (
  num_nonnulls(lat, lon) = 0
  or (num_nonnulls(lat, lon) = 2
      and lat between -90 and 90 and lon between -180 and 180)
);

-- Le référentiel reste FERMÉ côté client (A4) : personne d'autre que le seed,
-- l'éditeur SQL et la modération n'écrit ici. Rien à ajouter côté RLS.

-- ═══ 3. Recherche : les coordonnées suivent ═══════════════════════════════
-- Elles sont renvoyées pour que la carte (phase b) et l'affichage de la
-- distance n'exigent pas un second aller-retour. Une position de karting
-- n'est pas une donnée sensible : c'est un commerce, il est sur la carte.
-- `total` : le nombre de circuits qui CORRESPONDENT, avant la troncature à 20.
-- Avec 24 circuits au référentiel, une liste de 20 était quasi complète ;
-- avec 251, c'est une troncature muette — l'écran doit pouvoir dire « 20 sur
-- 251, affine ta recherche » plutôt que de laisser croire que c'est tout.
-- Une fonction de fenêtrage s'évalue AVANT le LIMIT : le compte est juste.
drop function if exists public.search_circuits(text);
create function public.search_circuits(q text)
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, total bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon, count(*) over () as total
  from circuits c
  where coalesce(trim(q), '') = ''
     or public.kart_normalize(c.name) like '%' || public.kart_normalize(q) || '%'
     or public.kart_normalize(coalesce(c.city, '')) like '%' || public.kart_normalize(q) || '%'
  order by c.is_official desc, c.name
  limit 20;
$$;
revoke all on function public.search_circuits(text) from public, anon;
grant execute on function public.search_circuits(text) to authenticated;

drop function if exists public.my_recent_circuits();
create function public.my_recent_circuits()
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon
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

-- ═══ 4. « Près de moi » ═══════════════════════════════════════════════════
-- Haversine en dur : distance orthodromique en kilomètres. `immutable` parce
-- qu'elle ne lit aucune table et rend toujours la même valeur pour les mêmes
-- arguments — ce qui autorise son inlining. Elle reste évaluée DEUX fois par
-- ligne dans nearby_circuits (projection + filtre) : négligeable à quelques
-- centaines de circuits, et c'est aussi pourquoi il n'y a pas d'index
-- géographique ici. À revoir si le référentiel change d'ordre de grandeur.
create or replace function public.km_between(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select 6371.0 * 2 * asin(sqrt(
    -- `least(1, …)` : sans lui, une erreur d'arrondi peut pousser l'argument
    -- juste au-dessus de 1 pour deux points confondus, et asin() lève alors
    -- une erreur de domaine — un circuit sur MA position ferait planter la
    -- recherche entière.
    least(1.0,
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )
  ));
$$;

-- Calcul pur, sans accès aux tables : rien à protéger sur le fond. Mais la
-- laisser exécutable par PUBLIC l'expose en /rpc/km_between à `anon`, et rien
-- dans ce lot n'a de raison d'être joignable sans compte.
revoke all on function public.km_between(double precision, double precision,
                                         double precision, double precision)
  from public, anon;
grant execute on function public.km_between(double precision, double precision,
                                            double precision, double precision)
  to authenticated;

/**
 * Les circuits les plus proches d'une position.
 *
 * La position vient du navigateur et n'est jamais stockée : elle ne vit que le
 * temps de l'appel. Une réserve à connaître : PostgREST passe les paramètres
 * de façon liée (donc absents de pg_stat_statements), mais si le journal des
 * requêtes lentes est actif, un appel lent écrit `p_lat`/`p_lon` en clair dans
 * les logs Postgres. C'est précisément pourquoi le client ARRONDIT la position
 * avant l'envoi (au centième de degré, ≈ 1 km) : ce qui peut atterrir dans un
 * journal ne désigne pas un domicile.
 *
 * `p_max_km` borne le résultat : sans lui, un pilote en Alsace se verrait
 * proposer un karting breton sous l'étiquette « près de moi ».
 */
create or replace function public.nearby_circuits(
  p_lat double precision, p_lon double precision,
  p_limit int default 8, p_max_km double precision default 150
)
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, km double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon,
         public.km_between(p_lat, p_lon, c.lat, c.lon) as km
  from circuits c
  where c.lat is not null and c.lon is not null
    -- Une position hors bornes (ou absente) ne renvoie RIEN plutôt que le
    -- référentiel entier trié n'importe comment.
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
