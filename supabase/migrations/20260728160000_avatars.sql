-- KartSquad — A7 : photo de profil.
--
-- Les initiales colorées font le travail, mais une vraie tête sur la grille
-- change l'attachement — c'est ce qui manquait le plus par rapport à l'app de
-- Maggie. Deux décisions PO (2026-07-28) structurent tout ce fichier :
--
--   1. STOCKAGE PRIVÉ + LIENS SIGNÉS. Un bucket public servirait la photo à
--      quiconque connaît l'URL, y compris pour un profil « privé » ou un compte
--      supprimé — et une URL fuit vite (capture, cache, partage). La photo suit
--      donc exactement les mêmes règles de visibilité que le profil lui-même.
--   2. SIGNALEMENT PUIS RETRAIT par un modérateur, comme pour les pseudos.
--      Pas de validation a priori : une photo en attente deux jours, c'est un
--      pilote qui décroche.
--
-- Le chemin d'un fichier est `<profile_id>/<aléatoire>.jpg`. Le préfixe sert de
-- preuve de propriété (personne n'écrit hors de son dossier) et le suffixe
-- aléatoire fait qu'une nouvelle photo n'hérite pas des liens signés de
-- l'ancienne.

alter table public.profiles add column if not exists avatar_path text;

-- ── Le client ne peut écrire QUE dans son propre dossier ──────────────────
-- La policy d'UPDATE de `profiles` autorise déjà chacun à modifier sa ligne :
-- sans ce garde, n'importe qui pourrait pointer `avatar_path` vers le fichier
-- d'un autre pilote — donc afficher sa photo sous son propre pseudo.
-- Mettre à NULL reste libre (retirer sa photo, ou retrait par la modération).
create or replace function public.guard_avatar_path() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.avatar_path is distinct from old.avatar_path
     and new.avatar_path is not null
     and current_user in ('authenticated', 'anon')
     and new.avatar_path not like auth.uid()::text || '/%' then
    raise exception 'Photo invalide (chemin hors de ton dossier)';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_avatar on public.profiles;
create trigger profiles_guard_avatar before update on public.profiles
  for each row execute function public.guard_avatar_path();

-- ── Modération : retirer une photo ────────────────────────────────────────
-- On ne supprime pas l'objet dans le bucket (le SQL n'a pas d'API de stockage) :
-- ce n'est pas nécessaire, la policy de lecture ci-dessous exige que le chemin
-- soit CELUI RÉFÉRENCÉ par le profil. Une photo retirée devient donc
-- immédiatement illisible, y compris par son propriétaire. Le fichier orphelin
-- part au prochain nettoyage de bucket.
create or replace function public.moderate_remove_avatar(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if p_profile_id is null then raise exception 'Pilote introuvable'; end if;
  update public.profiles set avatar_path = null where id = p_profile_id;
end $$;
revoke all on function public.moderate_remove_avatar(uuid) from public, anon;
grant execute on function public.moderate_remove_avatar(uuid) to authenticated;

-- ── Signaler une photo ────────────────────────────────────────────────────
alter table public.reports drop constraint if exists report_category;
alter table public.reports add constraint report_category
  check (category in ('comportement', 'fausse_course', 'classement', 'usurpation', 'photo', 'autre'));

-- ── Bucket + accès ────────────────────────────────────────────────────────
-- Le schéma `storage` n'existe que sur Supabase : le harnais de test local ne
-- l'émule pas. On enveloppe donc cette partie, pour que la migration reste
-- rejouable partout.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Schéma storage absent (base de test) : bucket et policies ignorés.';
    return;
  end if;

  -- Bucket privé. 300 Ko suffisent très largement : le client redimensionne à
  -- 512 px avant envoi. Ce plafond est la vraie maîtrise du coût de stockage —
  -- une photo de téléphone brute pèse 3 à 5 Mo.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 307200, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 307200,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  execute $pol$ drop policy if exists avatars_read on storage.objects $pol$;
  -- Lecture : la photo est visible exactement quand le profil l'est. Le lien
  -- signé demandé par le client passe par cette policy — un profil privé
  -- non-ami, un pilote bloqué ou un compte supprimé n'en obtiennent aucun.
  execute $pol$
    create policy avatars_read on storage.objects for select to authenticated
    using (
      bucket_id = 'avatars'
      and exists (
        select 1 from public.profiles p
        where p.id = ((storage.foldername(name))[1])::uuid
          and p.avatar_path = name          -- photo retirée = plus lisible
          and p.deleted_at is null
          and not public.is_blocked(p.id, auth.uid())
          and (
            not p.is_private
            or p.id = auth.uid()
            or exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and ((f.requester_id = p.id and f.addressee_id = auth.uid())
                  or (f.addressee_id = p.id and f.requester_id = auth.uid()))
            )
          )
      )
    )
  $pol$;

  execute $pol$ drop policy if exists avatars_write_own on storage.objects $pol$;
  -- Écriture : chacun dans son dossier, et nulle part ailleurs.
  execute $pol$
    create policy avatars_write_own on storage.objects for all to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  $pol$;
end $$;

-- ── RGPD : la photo part avec le compte ───────────────────────────────────
-- delete_my_account anonymise en place — la ligne `profiles` survit, donc rien
-- ne casse le lien vers le fichier. On l'efface explicitement, comme les
-- amitiés et les notifications.
-- (Reprise fidèle de la fonction du lot 2.5 + une ligne au point 1.)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non authentifié'; end if;

  update public.profiles
    set username = 'Joueur supprimé', is_private = true, deleted_at = now(),
        avatar_path = null
    where id = uid and deleted_at is null;

  delete from public.friendships where requester_id = uid or addressee_id = uid;
  delete from public.blocks where blocker_id = uid or blocked_id = uid;
  delete from public.push_subscriptions where profile_id = uid;
  delete from public.notification_preferences where profile_id = uid;
  delete from public.notifications where profile_id = uid or actor_id = uid;
  delete from public.reports where reporter_id = uid;
  delete from public.user_badges where profile_id = uid;

  begin
    delete from auth.identities where user_id = uid;
    update auth.users
      set email = 'deleted+' || uid::text || '@kartsquad.invalid',
          encrypted_password = null,
          raw_user_meta_data = '{}'::jsonb
      where id = uid;
  exception when others then
    raise warning 'delete_my_account : nettoyage de l''identité auth impossible pour % (%). deleted_at fait foi ; vérifier les droits sur le schéma auth.', uid, sqlerrm;
  end;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── Exposer le chemin dans les fiches pilote ──────────────────────────────
-- Le CHEMIN n'est pas la photo : sans lien signé il ne donne accès à rien, et
-- la policy de lecture reste seule juge. Le renvoyer permet au client de
-- demander tous les liens d'un écran en UNE fois plutôt qu'un par pilote.
drop function if exists public.search_pilots(text);
create function public.search_pilots(q text)
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
    p.avatar_path
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
    p.avatar_path
  from profiles p
  where p.id = p_id
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;
