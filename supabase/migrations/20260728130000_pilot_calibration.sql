-- KartSquad — cohérence « En calibration » sur la fiche pilote publique.
--
-- Note du vérificateur (vague A3) : la grille, les classements, « Ma position »
-- et le profil affichent « En calibration » pour un pilote de moins de 5 courses,
-- mais la FICHE PILOTE publique affichait un grade — get_pilot ne renvoyait pas
-- le compteur. Deux écrans se contredisaient sur le même pilote.
--
-- On expose donc `races` sur get_pilot ET search_pilots (la recherche affiche
-- déjà le grade dans les puces d'invitation : même incohérence, même correctif).
--
-- Le compteur n'est PAS une donnée sensible : il ne révèle ni l'Elo exact ni
-- l'historique. On le renvoie donc même pour un profil privé non-ami — c'est
-- justement lui qui permet d'écrire « En calibration » plutôt qu'un grade
-- bandé trompeur.

-- Changement de type de retour → drop obligatoire (Postgres refuse un
-- create or replace qui ajoute une colonne OUT).
drop function if exists public.search_pilots(text);
create function public.search_pilots(q text)
returns table (id uuid, username text, elo integer, elo_exact boolean,
               is_private boolean, races integer)
language sql security definer set search_path = public stable as $$
  select p.id, p.username,
    case when p.is_private and p.id <> auth.uid() and not exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         )
      then case
        when p.elo >= 2100 then 2100
        when p.elo >= 1700 then 1700
        when p.elo >= 1300 then 1300
        when p.elo >= 1000 then 1000
        when p.elo >= 700 then 700
        else 100 end
      else p.elo
    end as elo,
    (not p.is_private) or p.id = auth.uid() or exists (
      select 1 from friendships f where f.status = 'accepted'
        and ((f.requester_id = p.id and f.addressee_id = auth.uid())
          or (f.addressee_id = p.id and f.requester_id = auth.uid()))
    ) as elo_exact,
    p.is_private,
    p.races
  from profiles p
  where p.id <> auth.uid()
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid())
    and p.username ilike '%' || q || '%'
  order by p.username
  limit 20;
$$;
revoke all on function public.search_pilots(text) from public;
grant execute on function public.search_pilots(text) to authenticated;

drop function if exists public.get_pilot(uuid);
create function public.get_pilot(p_id uuid)
returns table (id uuid, username text, elo integer, elo_exact boolean,
               is_private boolean, races integer)
language sql security definer set search_path = public stable as $$
  select p.id, p.username,
    case when p.is_private and p.id <> auth.uid() and not exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         )
      then case
        when p.elo >= 2100 then 2100
        when p.elo >= 1700 then 1700
        when p.elo >= 1300 then 1300
        when p.elo >= 1000 then 1000
        when p.elo >= 700 then 700
        else 100 end
      else p.elo
    end as elo,
    (not p.is_private) or p.id = auth.uid() or exists (
      select 1 from friendships f where f.status = 'accepted'
        and ((f.requester_id = p.id and f.addressee_id = auth.uid())
          or (f.addressee_id = p.id and f.requester_id = auth.uid()))
    ) as elo_exact,
    p.is_private,
    p.races
  from profiles p
  where p.id = p_id
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;
