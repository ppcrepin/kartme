-- KartSquad — lot 2.2 : classements Amis / Global (écran L1).
--
-- Règles actées (cahier §6, décisions A6/B1) :
--   · Amis   = moi + mes amis acceptés, jamais de fantômes (B1).
--   · Global = profils publics + mes amis (même privés) + moi + fantômes
--     non réclamés (un fantôme réclamé est déjà représenté par son profil).
--   · Un profil privé non-ami n'apparaît PAS en Global : le classer par son
--     Elo exact révélerait ce que l'option « amis uniquement » cache (A6).
--   · Les pilotes bloqués (dans un sens ou l'autre) sont masqués, comme dans
--     la recherche.
--   · N'est classé que qui a couru au moins une course (sinon tout le monde
--     stagnerait à 1000 sans avoir roulé).
--   · Ex æquo : même Elo → même rang (rank(), pas d'ordre inventé) ; l'ordre
--     d'affichage des ex æquo (courses puis pseudo) n'est qu'esthétique.
-- Le rang est calculé sur l'ensemble visible PAR l'appelant — deux amis
-- peuvent donc voir des rangs différents, c'est le prix de la
-- confidentialité.

-- Index de service : les recherches d'amitié se font par côté (demandeur /
-- destinataire) et le blocage se vérifie dans les deux sens ; l'index unique
-- fonctionnel least/greatest ne sert à aucune de ces requêtes.
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, addressee_id);
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, requester_id);
create index if not exists blocks_blocked_idx
  on public.blocks (blocked_id, blocker_id);

create or replace function public.get_leaderboard(p_scope text, p_limit int default 100, p_offset int default 0)
returns table (
  rank bigint,
  profile_id uuid,
  ghost_id uuid,
  username text,
  elo integer,
  races bigint,
  is_me boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  return query
  with pilots as (
    select p.id as profile_id, null::uuid as ghost_id, p.username, p.elo,
           h.races, (p.id = auth.uid()) as is_me
    from profiles p
    join lateral (
      select count(*) as races from elo_history eh where eh.profile_id = p.id
    ) h on true
    where h.races > 0
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

    union all

    select null::uuid, g.id, g.display_name, g.elo, h.races, false
    from ghost_profiles g
    join lateral (
      select count(*) as races from elo_history eh where eh.ghost_id = g.id
    ) h on true
    where p_scope = 'global' and g.claimed_by is null and h.races > 0
  )
  select rank() over (order by pl.elo desc) as rank,
         pl.profile_id, pl.ghost_id, pl.username, pl.elo, pl.races, pl.is_me
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

-- Ma propre ligne (rang, Elo, nb de courses) même hors de la fenêtre chargée.
-- Aucune ligne si je n'ai pas encore couru. Version comptage : rang = 1 +
-- nombre de classés visibles STRICTEMENT au-dessus de mon Elo (cohérent avec
-- rank() : les ex æquo partagent le rang) — pas de tri ni de fenêtre sur
-- l'ensemble complet.
create or replace function public.get_my_rank(p_scope text)
returns table (rank bigint, elo integer, races bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_elo integer;
  v_races bigint;
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  select p.elo into v_elo from profiles p where p.id = auth.uid();
  if v_elo is null then return; end if;
  select count(*) into v_races from elo_history eh where eh.profile_id = auth.uid();
  if v_races = 0 then return; end if;

  return query
  select 1
    + (select count(*)
       from profiles p
       where p.id <> auth.uid()
         and p.elo > v_elo
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
         ))
    + (select count(*)
       from ghost_profiles g
       where p_scope = 'global'
         and g.claimed_by is null
         and g.elo > v_elo
         and exists (select 1 from elo_history eh where eh.ghost_id = g.id)),
    v_elo, v_races;
end;
$$;

revoke all on function public.get_my_rank(text) from public;
grant execute on function public.get_my_rank(text) to authenticated;
