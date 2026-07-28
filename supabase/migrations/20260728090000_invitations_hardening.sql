-- KartSquad — durcissement des invitations (suites Reviewer A2, 2026-07-28).
--
-- L'invitation par pseudo (sans amitié préalable) retire un consentement
-- implicite : on encadre.
--   1. QUITTER une course : un pilote inscrit d'office peut se retirer lui-même
--      tant que la course est ouverte (jusqu'ici, seule l'admin gérait le
--      roster → un pilote ajouté contre son gré ne pouvait que subir).
--   2. Les comptes SUSPENDUS disparaissent de la recherche de pilotes et de la
--      fiche pilote (ils ne peuvent plus courir : les proposer à l'invitation
--      n'a pas de sens et rouvrirait un échange d'Elo avec un compte gelé).

-- ── 1. Se retirer soi-même d'une course ouverte ────────────────────────────
-- Policy PERMISSIVE : s'ajoute aux droits admin existants sans les élargir.
-- La grille figée (locked) et les courses terminées restent intouchables ;
-- guard_not_suspended (trigger) bloque déjà un acteur suspendu.
drop policy if exists participations_delete_self on public.participations;
create policy participations_delete_self on public.participations for delete to authenticated
  using (
    profile_id = auth.uid()
    and exists (select 1 from public.races r where r.id = race_id and r.status = 'upcoming')
  );

-- ── 1bis. RLS : un pilote SUSPENDU n'est plus inscriptible à une course ────
-- Le retirer de la recherche ne suffit pas : l'API permettrait toujours à un
-- admin d'insérer sa participation par id, et le moteur échangerait de l'Elo
-- avec un compte gelé. On ferme au niveau de la policy elle-même.
-- (Reprise fidèle de la policy du lot 2.6 : admin + grille ouverte + blocages,
--  PLUS le prédicat de suspension.)
drop policy if exists participations_write_admin on public.participations;
create policy participations_write_admin on public.participations for all to authenticated
  using (exists (select 1 from public.races r
                 where r.id = race_id and r.admin_id = auth.uid() and r.status = 'upcoming'))
  with check (
    exists (select 1 from public.races r
            where r.id = race_id and r.admin_id = auth.uid() and r.status = 'upcoming')
    and (profile_id is null or profile_id = auth.uid() or not public.is_blocked(profile_id, auth.uid()))
    and (profile_id is null or profile_id = auth.uid() or not public.is_suspended(profile_id))
  );

-- ── 2. search_pilots / get_pilot : exclure les comptes suspendus ───────────
-- (Reprise fidèle des fonctions du lot 2.5 + le filtre suspended_at.)
create or replace function public.search_pilots(q text)
returns table (id uuid, username text, elo integer, elo_exact boolean, is_private boolean)
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
    p.is_private
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

create or replace function public.get_pilot(p_id uuid)
returns table (id uuid, username text, elo integer, elo_exact boolean, is_private boolean)
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
    p.is_private
  from profiles p
  where p.id = p_id
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;
