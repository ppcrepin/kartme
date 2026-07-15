-- KartSquad — lot 3.3 : légal & onboarding beta.
--
-- Décisions PO 2026-07-14 : beta en LIEN OUVERT (aucune barrière d'accès),
-- AUCUNE barrière d'âge, pages légales finalisées (bandeau « brouillon » retiré).
-- Reste ici l'obligation RGPD conservée : le CONSENTEMENT aux CGU + politique de
-- confidentialité à l'inscription (horodaté + versionné, et exigé côté serveur).

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version     text;

-- On étend le garde d'insertion existant : un client (rôle authenticated) ne
-- peut pas créer un profil sans avoir accepté les conditions. Les inserts
-- privilégiés (service_role / superuser : migrations, seed, dashboard) restent
-- exemptés pour ne pas casser les outils.
create or replace function public.guard_profile_insert() returns trigger
language plpgsql as $$
declare v_priv boolean;
begin
  v_priv := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') = 'service_role'
            or current_user = 'service_role'
            or coalesce((select rolsuper from pg_roles where rolname = current_user), false);
  -- Elo : jamais choisi par le client (réservé au moteur / seed).
  if new.elo is distinct from 1000 and not v_priv
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    new.elo := 1000;
  end if;
  -- Modérateur : jamais à l'inscription.
  if new.is_moderator and not v_priv
     and coalesce(current_setting('kartsquad.grant_moderator', true), '') <> '1' then
    new.is_moderator := false;
  end if;
  -- Consentement obligatoire (RGPD) : pas de profil client sans acceptation
  -- horodatée ET versionnée (preuve de la version acceptée).
  if (new.terms_accepted_at is null or new.terms_version is null) and not v_priv then
    raise exception 'Consentement aux conditions requis pour créer un compte';
  end if;
  return new;
end $$;
