-- KartSquad — A7b : la photo là où on regarde vraiment.
--
-- Retour PO après mise en ligne : « j'arrive à ajouter une photo, mais dans le
-- classement ou ailleurs je ne la vois pas apparaître ». Exact — A7 ne
-- l'affichait que sur le profil, la fiche pilote, la grille et le podium.
-- Manquaient les CLASSEMENTS et la liste d'AMIS, qui sont justement les écrans
-- où l'on parcourt beaucoup de monde d'un coup.
--
-- Le chemin est renvoyé, pas la photo : sans lien signé il ne donne accès à
-- rien, et la policy de lecture reste seule juge. Le renvoyer permet au client
-- de demander tous les liens d'un écran en UNE fois.

-- ── Classements ───────────────────────────────────────────────────────────
-- Reprise FIDÈLE de la version durcie anti-triche (lot du 2026-07-13 :
-- les fantômes ne figurent plus au classement), + une colonne. La signature
-- change (colonne de sortie ajoutée) : il faut donc un drop explicite, un
-- « create or replace » refuserait de modifier le type de retour.
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
           -- Pas de masquage à faire ici : la clause du dessous ne laisse
           -- passer un profil privé que si c'est moi ou un ami — exactement
           -- les cas où la photo est lisible. Une photo retirée par la
           -- modération a déjà `avatar_path` à null.
           p.avatar_path
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
    -- (pas de branche fantômes : ils n'ont plus d'Elo compétitif)
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
