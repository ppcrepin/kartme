-- KartSquad — UX : « Ma position » dans les classements (rang + Top X%).
--
-- On étend get_my_rank pour renvoyer AUSSI le nombre total de classés dans la
-- portée (même ensemble d'éligibilité que le calcul du rang), afin de dériver
-- un percentile côté client : Top X% = ceil(rang / total × 100).
-- Le type de retour change (colonne `total` ajoutée) → on DOIT dropper d'abord
-- (CREATE OR REPLACE ne peut pas modifier la signature de sortie).
drop function if exists public.get_my_rank(text);

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

  select p.elo into v_elo from profiles p where p.id = auth.uid();
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
    -- filtre « Elo supérieur ».
    1 + (select count(*)
       from profiles p
       where p.id <> auth.uid()
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
