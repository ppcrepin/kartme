-- KartSquad — solde trois dettes relevées par le vérificateur.
--
-- Aucune fonctionnalité nouvelle : ce collage ferme des trous par lesquels
-- l'API laisse passer ce que l'interface, elle, interdit déjà. C'est justement
-- ce qui les rend faciles à oublier — l'écran a l'air correct.

begin;

-- ── 1. Supprimer une course TERMINÉE corrompait le classement ────────────
-- `races_delete_admin` n'autorisait la suppression que par l'admin de la
-- course, sans regarder son STATUT. L'interface cache le bouton une fois la
-- course terminée, mais un appel direct à l'API passait.
--
-- Ce que cela produisait : l'Elo a DÉJÀ été appliqué au moment de la saisie du
-- classement. Supprimer la course efface la course, ses participations, ses
-- résultats et son `elo_history` — mais PAS les points échangés, qui vivent
-- dans `profiles.elo`. Tout le monde garde donc ses gains et ses pertes, sans
-- qu'aucune trace n'explique plus d'où ils viennent. Le classement devient
-- inauditable, et le pilote qui reperd sa course garde ses points : c'est
-- exactement le levier de triche que le lot anti-triche ferme partout ailleurs.
--
-- 'upcoming' et 'locked' restent supprimables : à ces stades aucun point n'a
-- été échangé, il n'y a rien à défaire.
--
-- La MODÉRATION n'est pas concernée : `moderate_delete_race` est
-- `security definer`, elle contourne la RLS — et elle, elle REMBOBINE l'Elo
-- avant de supprimer. C'est la seule voie légitime pour effacer une course
-- jouée, et elle le reste.
drop policy if exists races_delete_admin on public.races;
create policy races_delete_admin on public.races for delete to authenticated
  using (admin_id = auth.uid() and status in ('upcoming', 'locked'));

-- ── 2. Une amitié pouvait revenir de « acceptée » à « en attente » ───────
-- `guard_rate_limit` ne s'applique qu'à l'INSERT : rien n'encadrait l'UPDATE.
-- On pouvait donc faire osciller une relation acceptée ↔ en attente en boucle,
-- et chaque bascule refait passer le déclencheur de notification.
--
-- Plutôt qu'un plafond horaire — qui exigerait de compter des modifications
-- que rien n'enregistre —, on ferme le mouvement lui-même : AUCUN geste du
-- produit ne dé-accepte une amitié. On reste amis, ou l'on supprime la
-- relation (`friendships_delete_*`). Une transition qui n'existe nulle part
-- dans l'application n'a pas à être permise par la base.
create or replace function public.guard_friendship_transition() returns trigger
language plpgsql as $$
begin
  if old.status = 'accepted' and new.status = 'pending' then
    raise exception 'Une amitié acceptée ne redevient pas une demande. Supprime-la si tu veux la défaire.';
  end if;
  return new;
end $$;

drop trigger if exists friendships_guard_transition on public.friendships;
create trigger friendships_guard_transition
  before update on public.friendships
  for each row execute function public.guard_friendship_transition();

-- ── 3. `get_leaderboard(null, …)` retombait SILENCIEUSEMENT sur « amis » ──
-- Les deux corps sont repris de leur DERNIÈRE définition (A12a/A7b) et seule
-- la garde change. Repartir d'une version antérieure a déjà failli ramener les
-- fantômes au classement Global — la régression est consignée, on ne la
-- rejoue pas.

create or replace function public.get_leaderboard(p_scope text, p_limit int default 100, p_offset int default 0)
returns table (
  rank bigint, profile_id uuid, ghost_id uuid, username text,
  elo integer, races bigint, is_me boolean, avatar_path text
)
language plpgsql security definer set search_path = public stable
as $$
begin
  -- `p_scope not in (…)` vaut NULL sur une portée NULL, et une garde qui
  -- s'évalue à NULL ne se déclenche pas : on tombait SILENCIEUSEMENT dans la
  -- branche « amis ». Même mécanique que le CHECK à trois états attrapé au lot
  -- A12a. Aucune fuite (on n'obtient que soi et ses amis) et le client n'envoie
  -- jamais NULL — mais une garde qui ne garde pas est pire qu'une garde
  -- absente : elle rassure.
  if p_scope is null or p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', coalesce(p_scope, 'NULL');
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

create or replace function public.get_my_rank(p_scope text)
returns table (rank bigint, elo integer, races bigint, total bigint)
language plpgsql security definer set search_path = public stable
as $$
declare
  v_elo integer;
  v_races bigint;
begin
  -- Même garde que `get_leaderboard`, et pour la même raison : les deux
  -- fonctions se modifient TOUJOURS ensemble (si elles filtraient
  -- différemment, « Ma position » annoncerait un rang que la liste juste en
  -- dessous contredirait).
  if p_scope is null or p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', coalesce(p_scope, 'NULL');
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

commit;
