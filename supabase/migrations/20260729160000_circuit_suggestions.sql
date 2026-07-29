-- KartSquad — signaler un karting manquant ou à corriger (demande PO 2026-07-29).
--
-- Le référentiel vient d'OpenStreetMap : il est incomplet par nature (un
-- karting n'y figure que si un contributeur l'a cartographié) et il vieillit
-- (un karting ferme sans que personne ne le sache). Les pilotes, eux, savent.
-- Ce lot leur donne le seul canal qui manquait, et prévient les modérateurs
-- par le MÊME chemin que les signalements de comportement — rien de neuf à
-- inventer, et une boîte de réception de moins à surveiller.
--
-- Décisions PO : nom + ville seulement (pas de commentaire libre — un champ
-- de texte ouvert est une porte d'entrée pour les insultes, et le filtre de
-- mots ne rattrape pas tout) ; le bouton couvre AUSSI les corrections (un
-- karting fermé gêne autant qu'un karting absent) ; cloche + push.

-- ═══ 1. Table ═════════════════════════════════════════════════════════════
create table if not exists public.circuit_suggestions (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  kind         text not null,
  name         text not null,
  city         text,
  -- Le circuit concerné, pour une correction. `on delete set null` : si la
  -- modération supprime le circuit entre-temps, le signalement survit — c'est
  -- justement lui qui explique pourquoi il a été supprimé.
  circuit_id   uuid references public.circuits (id) on delete set null,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  constraint suggestion_kind check (kind in ('manquant', 'ferme', 'erreur')),
  constraint suggestion_status check (status in ('open', 'done', 'rejected')),
  constraint suggestion_name_len check (char_length(name) between 2 and 80),
  constraint suggestion_city_len check (city is null or char_length(city) <= 80),
  -- Une correction sans circuit désigné n'est pas exploitable ; un karting
  -- manquant, par définition, n'en a pas.
  constraint suggestion_cible check (
    (kind = 'manquant' and circuit_id is null) or (kind <> 'manquant')
  )
);

create index if not exists circuit_suggestions_open_idx
  on public.circuit_suggestions (created_at desc) where status = 'open';

alter table public.circuit_suggestions enable row level security;
grant select, insert on public.circuit_suggestions to authenticated;
-- Pas de `update`/`delete` au client : un signalement ne se retire pas, et son
-- statut n'appartient qu'à la modération (via la RPC dédiée, plus bas).

-- Je vois les miens ; un modérateur voit tout. Deux policies distinctes plutôt
-- qu'un `or` : les permissives d'une même commande sont OR-ées de toute façon,
-- et séparées elles restent lisibles.
drop policy if exists suggestions_select_own on public.circuit_suggestions;
create policy suggestions_select_own on public.circuit_suggestions
  for select to authenticated using (author_id = auth.uid());
drop policy if exists suggestions_select_mod on public.circuit_suggestions;
create policy suggestions_select_mod on public.circuit_suggestions
  for select to authenticated using (public.is_moderator(auth.uid()));

drop policy if exists suggestions_insert on public.circuit_suggestions;
create policy suggestions_insert on public.circuit_suggestions
  -- `status = 'open'` : sans lui, un INSERT direct pouvait naître déjà classé
  -- « traité » — l'auteur sortait sa propre ligne de la file du modérateur.
  -- Auto-préjudice, mais une file de modération doit voir TOUT ce qui entre.
  for insert to authenticated with check (author_id = auth.uid() and status = 'open');

-- ═══ 2. Garde-fous ════════════════════════════════════════════════════════
-- Filtre de mots : le nom d'un karting est LU par les modérateurs et finira
-- affiché si le circuit est créé. C'est le même filtre que les pseudos et les
-- noms de circuits.
create or replace function public.guard_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  new.name := trim(new.name);
  new.city := nullif(trim(coalesce(new.city, '')), '');

  if public.contains_banned_word(new.name)
     or public.contains_banned_word(coalesce(new.city, '')) then
    raise exception 'Nom ou ville non conforme';
  end if;

  -- Plafond horaire : sans lui, un pilote agacé remplit la boîte des
  -- modérateurs en trente secondes, et le vrai signalement se perd dedans.
  select count(*) into v_recent from public.circuit_suggestions
   where author_id = new.author_id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Trop de signalements en une heure — réessaie plus tard';
  end if;

  -- Déduplication : le même karting signalé deux fois par la même personne
  -- n'apporte rien. On regarde le nom NORMALISÉ (accents, casse, ponctuation).
  if exists (
    select 1 from public.circuit_suggestions s
     where s.author_id = new.author_id
       and s.status = 'open'
       and public.kart_normalize(s.name) = public.kart_normalize(new.name)
  ) then
    raise exception 'Tu as déjà signalé ce karting — il est en attente';
  end if;

  return new;
end $$;

drop trigger if exists circuit_suggestions_guard on public.circuit_suggestions;
create trigger circuit_suggestions_guard before insert on public.circuit_suggestions
  for each row execute function public.guard_suggestion();

-- ═══ 3. Notification des modérateurs ══════════════════════════════════════
-- Même chemin que `notify_report` : `enqueue_push` alimente la cloche ET le
-- push, respecte les préférences et la plage de silence, et isole ses erreurs.
create or replace function public.notify_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quoi text;
begin
  v_quoi := case new.kind
              when 'manquant' then 'Karting manquant'
              when 'ferme'    then 'Karting fermé'
              else 'Fiche à corriger'
            end;
  -- Type 'report', PAS un type inédit : l'Edge Function d'envoi ne connaît
  -- que quatre types et REJETTE les autres — un type 'circuit_suggestion'
  -- aurait rempli la cloche mais jamais déclenché de push, en silence. Et
  -- c'est sémantiquement juste : comme un signalement, cette notification de
  -- modération est toujours envoyée, sans interrupteur de préférence.
  -- « ?circuits » : la boîte déduplique les non-lus sur (type, url, acteur),
  -- et notify_report émet exactement ('report', 'settings/moderation',
  -- auteur). Sans discriminant, un pilote qui signale un comportement PUIS un
  -- karting voyait sa seconde alerte silencieusement avalée — et trois
  -- kartings signalés d'affilée ne faisaient qu'une ligne de cloche. Le
  -- paramètre ne change rien à la navigation : l'écran de modération l'ignore.
  perform public.enqueue_push('report', p.id,
      'Référentiel à mettre à jour 🏁',
      v_quoi || ' : ' || new.name || coalesce(' (' || new.city || ')', '') || '.',
      'settings/moderation?circuits',
      new.author_id)
  from profiles p
  where p.is_moderator
    and p.id <> new.author_id     -- pas de notification à soi-même
    and p.deleted_at is null
    and p.suspended_at is null;
  return new;
end $$;

drop trigger if exists circuit_suggestions_notify on public.circuit_suggestions;
create trigger circuit_suggestions_notify after insert on public.circuit_suggestions
  for each row execute function public.notify_suggestion();

-- ═══ 4. Écriture et lecture ═══════════════════════════════════════════════
/**
 * Signale un karting manquant, fermé, ou dont la fiche est fausse.
 *
 * `security definer` pour poser `author_id` côté serveur : le client ne
 * choisit pas au nom de qui il signale.
 */
create or replace function public.suggest_circuit(
  p_kind text, p_name text, p_city text default null, p_circuit_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if p_kind not in ('manquant', 'ferme', 'erreur') then
    raise exception 'Type de signalement inconnu : %', p_kind;
  end if;
  -- Une correction doit désigner une fiche existante, sinon le modérateur
  -- reçoit « le nom est faux » sans savoir de quoi on parle. La vérification
  -- d'existence évite aussi qu'un identifiant forgé ne remonte l'erreur de
  -- clé étrangère de Postgres, brute, jusqu'à l'écran du pilote.
  if p_kind <> 'manquant' then
    if p_circuit_id is null then
      raise exception 'Indique le karting concerné';
    end if;
    if not exists (select 1 from public.circuits c where c.id = p_circuit_id) then
      raise exception 'Fiche introuvable — elle a peut-être été retirée';
    end if;
  end if;

  insert into public.circuit_suggestions (author_id, kind, name, city, circuit_id)
  values (auth.uid(), p_kind, p_name, p_city,
          -- Le CHECK `suggestion_cible` exige qu'un « manquant » n'ait pas de
          -- cible : on neutralise plutôt que de rejeter un appel bien
          -- intentionné où le client aurait laissé traîner l'identifiant.
          case when p_kind = 'manquant' then null else p_circuit_id end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.suggest_circuit(text, text, text, uuid) from public, anon;
grant execute on function public.suggest_circuit(text, text, text, uuid) to authenticated;

/** Les signalements à traiter (modération uniquement). */
create or replace function public.list_circuit_suggestions(p_only_open boolean default true)
returns table (
  id uuid, kind text, name text, city text, status text, created_at timestamptz,
  author_id uuid, author_name text, circuit_id uuid, circuit_name text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.city, s.status, s.created_at,
         s.author_id, a.username, s.circuit_id, c.name
  from circuit_suggestions s
  join profiles a on a.id = s.author_id
  left join circuits c on c.id = s.circuit_id
  where public.is_moderator(auth.uid())
    and (not coalesce(p_only_open, true) or s.status = 'open')
  order by s.created_at desc
  limit 200;
$$;
revoke all on function public.list_circuit_suggestions(boolean) from public, anon;
grant execute on function public.list_circuit_suggestions(boolean) to authenticated;

/** Classe un signalement (traité ou écarté). */
create or replace function public.resolve_circuit_suggestion(p_id uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then
    raise exception 'Réservé à la modération';
  end if;
  update public.circuit_suggestions
     set status = case when p_done then 'done' else 'rejected' end,
         resolved_at = now(), resolved_by = auth.uid()
   where id = p_id and status = 'open';
end $$;
revoke all on function public.resolve_circuit_suggestion(uuid, boolean) from public, anon;
grant execute on function public.resolve_circuit_suggestion(uuid, boolean) to authenticated;

-- ═══ 5. RGPD ══════════════════════════════════════════════════════════════
-- Le `on delete cascade` du schéma ne suffit PAS : delete_my_account ANONYMISE
-- le profil sans supprimer la ligne (l'Elo des autres en dépend), donc la
-- cascade ne se déclenche jamais — c'est le test qui l'a montré, six
-- signalements survivaient à la suppression du compte. La purge doit être
-- explicite. Reprise FIDÈLE de la fonction du lot A7 (avatars) + une ligne.
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
  -- Un signalement de circuit porte le pseudo et une démarche personnelle :
  -- il part avec le compte. Le circuit créé à partir de lui, s'il l'a été,
  -- reste — il n'appartient à personne.
  delete from public.circuit_suggestions where author_id = uid;

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
