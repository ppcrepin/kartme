-- KartSquad — lot 2.5 : Réglages (pseudo, confidentialité, déblocage) + RGPD.
--
-- Pseudo et confidentialité passent par un UPDATE client (RLS profiles_update_self
-- déjà en place) ; le déblocage par un DELETE client (blocks_delete). Cette
-- migration ne gère que ce qui exige le serveur :
--   1. un drapeau `deleted_at` sur profiles + l'exclusion des comptes supprimés
--      de la recherche / fiche pilote ;
--   2. la SUPPRESSION DE COMPTE RGPD : on ANONYMISE le profil (username →
--      « Joueur supprimé ») au lieu de le supprimer, car ses participations /
--      résultats / historique Elo sont référencés par les courses des AUTRES
--      pilotes (le supprimer casserait leur historique). Les données
--      personnelles & sociales, elles, sont bien effacées.

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ── Recherche & fiche pilote : ne plus montrer les comptes supprimés ────────
-- (redéfinitions à l'identique du lot 2.1 + « and p.deleted_at is null »)
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
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;

-- ── Liste des pilotes que J'AI bloqués (pour l'écran de déblocage) ──────────
-- SECURITY DEFINER pour montrer le pseudo même d'un profil privé : c'est
-- légitime, le bloqueur doit pouvoir identifier qui il débloque.
create or replace function public.list_blocked()
returns table (id uuid, username text)
language sql security definer set search_path = public stable as $$
  select p.id, p.username
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid() and p.deleted_at is null
  order by p.username;
$$;
revoke all on function public.list_blocked() from public, anon;
grant execute on function public.list_blocked() to authenticated;

-- ── Suppression de compte (RGPD) ────────────────────────────────────────────
-- Anonymise le profil (garde l'intégrité Elo des autres) et efface toutes les
-- données personnelles & sociales. La neutralisation de l'identité de connexion
-- (e-mail / OAuth dans le schéma auth) est « best effort » : si les droits
-- manquent, le drapeau deleted_at bloque déjà l'accès côté app.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non authentifié'; end if;

  -- 1) Anonymiser le profil (NE PAS le supprimer : ses résultats servent
  --    l'historique Elo des autres pilotes).
  update public.profiles
    set username = 'Joueur supprimé', is_private = true, deleted_at = now()
    where id = uid and deleted_at is null;

  -- 2) Effacer les données personnelles & sociales.
  delete from public.friendships where requester_id = uid or addressee_id = uid;
  delete from public.blocks where blocker_id = uid or blocked_id = uid;
  delete from public.push_subscriptions where profile_id = uid;
  delete from public.notification_preferences where profile_id = uid;
  delete from public.reports where reporter_id = uid;
  delete from public.user_badges where profile_id = uid;

  -- 3) Neutraliser l'identité de connexion (best effort ; PII e-mail / OAuth).
  begin
    delete from auth.identities where user_id = uid;
    update auth.users
      set email = 'deleted+' || uid::text || '@kartsquad.invalid',
          encrypted_password = null,
          raw_user_meta_data = '{}'::jsonb
      where id = uid;
  exception when others then
    null; -- droits insuffisants sur le schéma auth → deleted_at fait foi
  end;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
