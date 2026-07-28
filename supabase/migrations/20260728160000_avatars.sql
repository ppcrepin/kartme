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
-- Le chemin d'un fichier est `<profile_id>/<aléatoire>.jpg`, dans cette forme
-- EXACTE (voir avatar_path_ok) : un simple préfixe ne prouve rien, `<moi>/../
-- <victime>/x.jpg` commence bien par mon identifiant. Le suffixe aléatoire fait
-- qu'une nouvelle photo n'hérite ni des liens signés ni des caches de l'ancienne.

alter table public.profiles add column if not exists avatar_path text;
-- Sanction PERSISTANTE. Sans elle, le pilote reposait le MÊME chemin juste
-- après le retrait : la modération de photo était purement décorative, alors
-- que le renommage de pseudo, lui, tient.
alter table public.profiles add column if not exists avatar_blocked_at timestamptz;

-- Forme du chemin, gravée dans la table. Le trigger protège du client ; cette
-- contrainte protège de tout le reste (écriture privilégiée, import, script).
-- Sans borne, un chemin d'un million de caractères passait — et search_pilots
-- le renvoyait vingt fois, soit ~20 Mo servis à qui le demandait.
alter table public.profiles drop constraint if exists profiles_avatar_path_shape;
alter table public.profiles add constraint profiles_avatar_path_shape
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.jpg$');

-- ── Forme canonique d'un chemin de photo ──────────────────────────────────
-- `like '<uuid>/%'` ne valide QUE le préfixe : `<mon_uuid>/../<victime>/x.jpg`
-- passait. Et ce chemin-là retourne la policy de lecture contre elle-même —
-- `foldername[1]` vaut MON uuid, donc c'est MA visibilité qui est évaluée, pas
-- celle de la victime. Toute la clause « profil privé → amis seulement » serait
-- court-circuitée dès que la couche de stockage normalise le « .. ».
-- On exige donc la forme exacte : un dossier, un nom, une extension.
create or replace function public.avatar_path_ok(p_path text, p_owner uuid)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select p_path ~ ('^' || p_owner::text || '/[A-Za-z0-9_-]{1,64}\.jpg$');
$$;

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
     and current_user in ('authenticated', 'anon') then
    -- `auth.uid()` NUL rendait le test NULL, donc jamais déclenché. Ce trigger
    -- est la seule barrière sur la colonne : il ne doit dépendre d'aucune autre.
    if auth.uid() is null then
      raise exception 'Photo invalide (session absente)';
    end if;
    if old.avatar_blocked_at is not null then
      raise exception 'Photo retirée par la modération';
    end if;
    if old.deleted_at is not null then
      raise exception 'Photo invalide (compte supprimé)';
    end if;
    if not public.avatar_path_ok(new.avatar_path, auth.uid()) then
      raise exception 'Photo invalide (chemin hors de ton dossier)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_avatar on public.profiles;
create trigger profiles_guard_avatar before update on public.profiles
  for each row execute function public.guard_avatar_path();

-- ── …y compris À L'INSCRIPTION ────────────────────────────────────────────
-- Le profil est créé par un INSERT client direct : un garde BEFORE UPDATE ne
-- le voit jamais. Or `avatar_path` est renvoyé à tout inscrit par get_pilot et
-- search_pilots — il suffisait de lire le chemin d'un pilote, de créer un
-- compte au pseudo voisin et d'y coller son chemin pour afficher SON visage
-- sous un autre nom. Le lot 3.1a avait bouché exactement ce trou pour `elo` et
-- `is_moderator` ; on l'y rejoint plutôt que d'ajouter un second garde.
-- (Reprise fidèle de la fonction de la vague calibration + un bloc.)
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
  -- Compteur de courses : toujours 0 à l'inscription côté client.
  if new.races is distinct from 0 and not v_priv
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    new.races := 0;
  end if;
  -- Modérateur : jamais à l'inscription.
  if new.is_moderator and not v_priv
     and coalesce(current_setting('kartsquad.grant_moderator', true), '') <> '1' then
    new.is_moderator := false;
  end if;
  -- Photo : jamais celle d'un autre. On efface plutôt que de refuser —
  -- l'inscription ne doit pas échouer pour une photo, elle se choisit après.
  if new.avatar_path is not null and not v_priv
     and not public.avatar_path_ok(new.avatar_path, new.id) then
    new.avatar_path := null;
  end if;
  -- Consentement obligatoire (RGPD) : pas de profil client sans acceptation
  -- horodatée ET versionnée (preuve de la version acceptée).
  if (new.terms_accepted_at is null or new.terms_version is null) and not v_priv then
    raise exception 'Consentement aux conditions requis pour créer un compte';
  end if;
  return new;
end $$;

-- ── Modération : retirer une photo ────────────────────────────────────────
-- Le SQL n'a pas d'API de stockage : on ne supprime pas l'objet ici. La policy
-- de lecture exige que le chemin soit CELUI RÉFÉRENCÉ par le profil, donc plus
-- aucun NOUVEAU lien ne sera signé — y compris pour le propriétaire.
--
-- À dire honnêtement : un lien DÉJÀ signé reste valable jusqu'à son expiration
-- (quelques minutes, voir SIGNED_TTL_S côté client), et le navigateur qui a
-- déjà chargé l'image la garde en cache. « Immédiat » vaut pour le serveur,
-- pas pour ce qui est déjà parti.
--
-- Le fichier, lui, est mis en file de suppression (voir avatar_gc) : sans ça,
-- effacer le pointeur ne serait pas un effacement au sens du RGPD, et le
-- bucket ne ferait que grossir.
create or replace function public.moderate_remove_avatar(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if public.is_suspended(auth.uid()) then raise exception 'Compte suspendu'; end if;
  -- Un identifiant inconnu ne doit pas passer pour un succès : l'écran de
  -- modération afficherait « fait » sans que rien n'ait été fait.
  if p_profile_id is null
     or not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Pilote introuvable';
  end if;
  update public.profiles
    set avatar_path = null, avatar_blocked_at = now()
    where id = p_profile_id;
end $$;

-- Lever la sanction (erreur de modération, ou photo corrigée hors ligne).
create or replace function public.moderate_allow_avatar(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if public.is_suspended(auth.uid()) then raise exception 'Compte suspendu'; end if;
  update public.profiles set avatar_blocked_at = null where id = p_profile_id;
end $$;
revoke all on function public.moderate_allow_avatar(uuid) from public, anon;
grant execute on function public.moderate_allow_avatar(uuid) to authenticated;
revoke all on function public.moderate_remove_avatar(uuid) from public, anon;
grant execute on function public.moderate_remove_avatar(uuid) to authenticated;

-- ── Signaler une photo ────────────────────────────────────────────────────
alter table public.reports drop constraint if exists report_category;
alter table public.reports add constraint report_category
  check (category in ('comportement', 'fausse_course', 'classement', 'usurpation', 'photo', 'autre'));

-- ── Ramasse-miettes des fichiers ──────────────────────────────────────────
-- Le SQL ne sait pas supprimer dans un bucket. Sans file d'attente, AUCUN
-- fichier ne disparaissait jamais : ni au remplacement, ni au retrait, ni à la
-- suppression de compte. Deux conséquences — le bucket ne fait que grossir
-- (et un pilote mal intentionné peut le remplir), et une photo de visage
-- survit à l'effacement du compte, ce qui n'est pas un effacement au sens du
-- RGPD. On enfile ici, un travail privilégié vide la file côté stockage.
create table if not exists public.avatar_gc (
  path       text primary key,
  queued_at  timestamptz not null default now()
);
alter table public.avatar_gc enable row level security;
-- Chacun voit et vide SA propre file : c'est le propriétaire du fichier qui a
-- le droit de le supprimer côté stockage, donc c'est lui qui ramasse. Personne
-- ne peut enfiler quoi que ce soit (pas de policy INSERT) — sinon on ferait
-- supprimer le fichier d'un autre.
grant select, delete on public.avatar_gc to authenticated;
revoke insert, update on public.avatar_gc from authenticated, anon;
revoke all on public.avatar_gc from anon;

drop policy if exists avatar_gc_own on public.avatar_gc;
create policy avatar_gc_own on public.avatar_gc for select to authenticated
  using (path like auth.uid()::text || '/%');
drop policy if exists avatar_gc_clear_own on public.avatar_gc;
create policy avatar_gc_clear_own on public.avatar_gc for delete to authenticated
  using (path like auth.uid()::text || '/%');

create or replace function public.queue_avatar_gc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.avatar_path is not null and old.avatar_path is distinct from new.avatar_path then
    insert into public.avatar_gc (path) values (old.avatar_path)
    on conflict (path) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_queue_avatar_gc on public.profiles;
-- APRÈS le garde de forme : on n'enfile que des remplacements acceptés.
create trigger profiles_queue_avatar_gc after update of avatar_path on public.profiles
  for each row execute function public.queue_avatar_gc();

-- ── Qui a le droit de voir cette photo ? ──────────────────────────────────
-- Doit accorder l'accès EXACTEMENT quand `get_pilot` renvoie une ligne — plus
-- une dérogation pour la modération, sans laquelle elle ne peut pas voir
-- l'image qu'on lui demande de retirer, et le signalement devient un droit de
-- retrait unilatéral entre pilotes.
--
-- La comparaison se fait en TEXTE : un seul objet dont le premier segment
-- n'est pas un uuid (import manuel, écriture en service_role) ferait échouer
-- `::uuid` et donc TOUTE lecture du bucket, pour tout le monde.
create or replace function public.can_read_avatar(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id::text = (string_to_array(p_name, '/'))[1]
      and p.avatar_path = p_name          -- photo retirée ou remplacée = illisible
      and p.deleted_at is null
      and p.suspended_at is null          -- comme get_pilot : un suspendu disparaît
      and not public.is_blocked(p.id, auth.uid())
      and (
        not p.is_private
        or p.id = auth.uid()
        or public.is_moderator(auth.uid())
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = p.id and f.addressee_id = auth.uid())
              or (f.addressee_id = p.id and f.requester_id = auth.uid()))
        )
      )
  );
$$;
revoke all on function public.can_read_avatar(text) from public, anon;
grant execute on function public.can_read_avatar(text) to authenticated;

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
  -- Le prédicat vit dans une fonction (can_read_avatar, définie juste au-dessus) :
  -- la policy est la SEULE barrière entre une photo privée et le reste du monde,
  -- et le harnais local n'a pas de schéma storage pour la tester. Extraite,
  -- elle se teste comme n'importe quelle fonction.
  execute $pol$
    create policy avatars_read on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and public.can_read_avatar(name))
  $pol$;

  execute $pol$ drop policy if exists avatars_write_own on storage.objects $pol$;
  execute $pol$ drop policy if exists avatars_insert_own on storage.objects $pol$;
  execute $pol$ drop policy if exists avatars_update_own on storage.objects $pol$;
  execute $pol$ drop policy if exists avatars_delete_own on storage.objects $pol$;
  -- Écriture : chacun dans son dossier, et nulle part ailleurs. TROIS policies
  -- distinctes, surtout PAS un « for all » : les policies permissives d'une
  -- même commande sont OR-ées, donc un « for all » aurait aussi accordé le
  -- SELECT — le propriétaire aurait lu n'importe quel fichier de son dossier,
  -- y compris une photo retirée par la modération. Le retrait n'aurait alors
  -- rien retiré du tout pour l'intéressé, qui pouvait continuer à en signer
  -- des liens et à les diffuser hors de l'app.
  execute $pol$
    create policy avatars_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and public.avatar_path_ok(name, auth.uid()))
  $pol$;
  execute $pol$
    create policy avatars_update_own on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and public.avatar_path_ok(name, auth.uid()))
    with check (bucket_id = 'avatars' and public.avatar_path_ok(name, auth.uid()))
  $pol$;
  execute $pol$
    create policy avatars_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and public.avatar_path_ok(name, auth.uid()))
  $pol$;
end $$;

-- ── RGPD : la photo part avec le compte ───────────────────────────────────
-- delete_my_account anonymise en place — la ligne `profiles` survit, donc rien
-- ne casse le lien vers le fichier. On efface le pointeur, et le trigger de
-- ramasse-miettes met le FICHIER en file de suppression : une photo de visage
-- est une donnée personnelle, effacer le pointeur n'est pas un effacement.
-- (Reprise fidèle de la fonction du lot 2.5 + une ligne au point 1.)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non authentifié'; end if;

  update public.profiles
    set username = 'Joueur supprimé', is_private = true, deleted_at = now()
    where id = uid and deleted_at is null;
  -- Hors de l'UPDATE conditionnel : au deuxième appel, `deleted_at` n'est plus
  -- nul et la clause excluait la ligne — une photo reposée entre-temps (le
  -- jeton reste valide un moment) n'était alors plus jamais effacée.
  update public.profiles set avatar_path = null where id = uid;

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
    case when (not p.is_private) or p.id = auth.uid() or exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         ) or public.is_moderator(auth.uid())
         then p.avatar_path else null end as avatar_path
  from profiles p
  where p.id = p_id
    and p.deleted_at is null
    and p.suspended_at is null
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;

-- ── La modération doit voir ce qu'on lui demande de retirer ───────────────
-- Sans le chemin dans la liste des signalements, un modérateur cliquait
-- « Retirer la photo » à l'aveugle, sur la seule foi du signalement : le
-- signalement devenait un droit de retrait unilatéral entre pilotes.
-- (Reprise fidèle de la fonction du lot 3.1b + une colonne.)
drop function if exists public.list_reports(boolean);
create function public.list_reports(p_only_open boolean default false)
returns table (
  id uuid, category text, message text, status text, created_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_suspended boolean,
  reported_avatar_path text,
  race_id uuid, race_circuit text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.category, r.message, r.status, r.created_at,
         r.reporter_id, rep.username,
         r.reported_profile_id, tgt.username, (tgt.suspended_at is not null),
         tgt.avatar_path,
         r.race_id, c.name
  from reports r
  left join profiles rep on rep.id = r.reporter_id
  left join profiles tgt on tgt.id = r.reported_profile_id
  left join races ra on ra.id = r.race_id
  left join circuits c on c.id = ra.circuit_id
  where public.is_moderator(auth.uid())
    and (not p_only_open or r.status = 'open')
  order by (r.status = 'open') desc, r.created_at desc;
$$;
revoke all on function public.list_reports(boolean) from public, anon;
grant execute on function public.list_reports(boolean) to authenticated;
