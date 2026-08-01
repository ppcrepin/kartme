-- KartSquad — la recherche de pilotes trouve « Kévin » quand on tape « kevin ».
--
-- `search_pilots` comparait avec `p.username ilike '%' || q || '%'`. `ilike`
-- ignore la CASSE mais pas les DIACRITIQUES : « kevin » ne rencontrait jamais
-- « Kévin_R ». Personne ne tape l'accent dans un champ de recherche.
--
-- Sans conséquence tant que la recherche par pseudo était un bloc parmi trois.
-- Elle est depuis le 2026-08-01 le SEUL chemin pour ajouter quelqu'un à une
-- grille, et l'écran conclut d'une réponse vide qu'aucun inscrit ne porte ce
-- nom — puis propose d'ajouter un INVITÉ du même nom. L'invité n'échange aucun
-- point Elo : le vrai Kévin se retrouve doublé par un fantôme, et la faute ne
-- se voit qu'au classement, une fois la course validée.
--
-- On réutilise `kart_normalize` (2026-07-14), déjà le repli des noms de
-- circuits, dont `src/lib/texte.ts` est le miroir exact côté client. Trois
-- effets, tous voulus :
--   · les accents tombent des DEUX côtés de la comparaison ;
--   · les séparateurs aussi, donc « sophie k » trouve « Sophie_K » ;
--   · `%` et `_` disparaissent de la saisie, qui ne peut donc plus se
--     transformer en joker `LIKE` (« Sophie_K » ne remonte plus « SophieXK »).
--
-- Le reste de la fonction est repris À L'IDENTIQUE de sa DERNIÈRE définition
-- (2026-07-28, lot avatars) : bandage de l'Elo des profils privés, `elo_exact`,
-- compteur de courses, chemin de photo masqué comme la photo, exclusion des
-- bloqués, des suspendus et des comptes partis. Repartir d'une version
-- antérieure a déjà failli ramener les fantômes au classement Global — la
-- régression est consignée, on ne la rejoue pas.

begin;

create or replace function public.search_pilots(q text)
returns table (id uuid, username text, elo integer, elo_exact boolean,
               is_private boolean, races integer, avatar_path text)
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
    p.races,
    -- Chemin masqué exactement quand la photo l'est : le renvoyer pour un
    -- profil privé non-ami garantissait un aller-retour de signature perdant.
    case when (not p.is_private) or p.id = auth.uid() or exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         ) or public.is_moderator(auth.uid())
         then p.avatar_path else null end as avatar_path
  from profiles p
  where p.id <> auth.uid()
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid())
    -- Garde-fou : une saisie faite QUE de ponctuation (« ... », « ### ») se
    -- replie sur la chaîne vide, et `like '%%'` remonterait vingt pilotes au
    -- hasard — une liste de noms d'inconnus servie sans que rien ne l'ait
    -- demandée.
    and public.kart_normalize(q) <> ''
    and public.kart_normalize(p.username) like '%' || public.kart_normalize(q) || '%'
  order by p.username
  limit 20;
$$;
revoke all on function public.search_pilots(text) from public;
grant execute on function public.search_pilots(text) to authenticated;

commit;
