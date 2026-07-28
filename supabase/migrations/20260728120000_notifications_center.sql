-- KartSquad — A5 : centre de notifications in-app (cloche + boîte de réception).
--
-- Jusqu'ici, un événement (invitation, classement, demande d'ami, signalement)
-- ne partait QU'EN PUSH. Trois trous :
--   · le push web n'existe pas sur iOS hors PWA installée, et beaucoup de
--     pilotes refusent l'autorisation → l'événement est perdu, définitivement ;
--   · une notification poussée puis balayée n'est plus consultable ;
--   · aucun repère « il s'est passé quelque chose depuis ma dernière visite ».
--
-- On persiste donc chaque événement dans une BOÎTE DE RÉCEPTION. Point
-- d'injection unique : enqueue_push(), déjà appelée par TOUS les déclencheurs —
-- aucun trigger n'a besoin de connaître la boîte.
--
-- Choix produit : la boîte enregistre TOUT, y compris les types désactivés dans
-- les préférences. Les préférences gouvernent l'INTRUSION (push sur l'écran de
-- verrouillage), pas la consultation passive. Couper « résultats » ne doit pas
-- effacer l'historique de ses propres courses. L'interface le dit explicitement
-- (écran Réglages → « Ce que tu reçois »).
--
-- ⚠️ Passer du push éphémère au stockage persistant change le modèle de menace :
-- ce qui n'était qu'une notification de trop devient une ligne en base que la
-- victime ne peut pas faire disparaître, et une identité que l'anonymisation
-- RGPD ne rattrape pas. D'où, ci-dessous, `actor_id`, la déduplication, le
-- plafond horaire et l'isolation transactionnelle.

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- ÉMETTEUR de l'événement. Indispensable, et pas seulement décoratif :
  --   · l'anonymisation RGPD doit pouvoir effacer les notifications ÉMISES par
  --     un compte supprimé (son pseudo est figé dans `body` chez les autres) ;
  --   · le blocage doit fermer ce canal comme il ferme les autres ;
  --   · la déduplication doit distinguer deux demandes d'amis de deux pilotes.
  actor_id    uuid references public.profiles(id) on delete set null,
  type        text not null,
  title       text not null,
  body        text not null,
  -- Destination in-app (ex. « race/<uuid> », « amis »). Null = pas de cible.
  url         text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Colonne ajoutée après coup sur une base déjà migrée.
alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

-- Index de la boîte : « mes notifications, récentes d'abord ».
create index if not exists notifications_inbox
  on public.notifications (profile_id, created_at desc);
-- Index partiel : le compteur de la cloche est appelé à chaque ouverture
-- d'écran — il doit rester une lecture d'index, pas un scan.
create index if not exists notifications_unread
  on public.notifications (profile_id) where read_at is null;
create index if not exists notifications_actor
  on public.notifications (actor_id) where actor_id is not null;
-- Purge globale : balayage par date, sans passer par profile_id.
create index if not exists notifications_age
  on public.notifications (created_at);

-- ── 1bis. Anti-inondation ──────────────────────────────────────────────────
-- Une seule notification NON LUE par (destinataire, type, cible, émetteur).
-- Sans ça, un pilote peut rejoindre/quitter une course en boucle (join_race est
-- ouvert à tout authentifié, et « quitter » aussi) et remplir la boîte de
-- l'admin de centaines de lignes identiques — que l'admin ne peut ni prévenir
-- ni faire disparaître. L'émetteur fait partie de la clé : deux demandes d'amis
-- de deux pilotes différents pointent la même URL et doivent coexister.
create unique index if not exists notifications_dedup
  on public.notifications (
    profile_id, type, coalesce(url, ''),
    coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where read_at is null;

alter table public.notifications enable row level security;

-- Lecture : les siennes uniquement.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (profile_id = auth.uid());

-- Marquage « lu » : autorisé sur les siennes. Le contenu reste figé (trigger
-- ci-dessous) — sans quoi un client pourrait réécrire title/body et se
-- fabriquer un faux message d'apparence officielle en vue d'une capture d'écran.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Suppression : on peut vider sa propre boîte.
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (profile_id = auth.uid());

-- Droits de table (la RLS restreint ensuite aux SIENNES). Pas d'INSERT :
-- seules les fonctions SECURITY DEFINER écrivent ici — sans quoi n'importe
-- quel client pourrait se forger un message d'allure officielle.
grant select, update, delete on public.notifications to authenticated;
revoke insert on public.notifications from authenticated, anon;
revoke all on public.notifications from anon;

-- ── 2. Immuabilité du contenu ──────────────────────────────────────────────
-- Seul read_at est modifiable par le destinataire ; le reste appartient au
-- serveur — **y compris la clé primaire** (toute logique indexée sur l'id
-- s'effondrerait si un client pouvait la réécrire).
--
-- Le verrou vise les RÔLES CLIENT, identifiés par `current_user` — que le
-- client ne peut pas falsifier. On NE parse PAS `request.jwt.claims` : posé
-- puis vidé, le GUC vaut la chaîne vide et `''::jsonb` fait échouer TOUT
-- UPDATE, y compris un marquage « lu » parfaitement légitime. Et une session
-- `postgres` (éditeur SQL, migration, pg_cron) doit pouvoir corriger une ligne
-- — sinon la modération n'a aucun moyen d'effacer un pseudo insultant figé.
create or replace function public.guard_notification_update() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  new.id         := old.id;
  new.profile_id := old.profile_id;
  new.actor_id   := old.actor_id;
  new.type       := old.type;
  new.title      := old.title;
  new.body       := old.body;
  new.url        := old.url;
  new.created_at := old.created_at;
  -- « Lu » est irréversible et jamais antidaté : sinon read_at n'est pas un
  -- repère fiable et la déduplication (index partiel) redevient contournable.
  new.read_at := case
                   when new.read_at is null then old.read_at
                   else greatest(coalesce(old.read_at, now()), now())
                 end;
  return new;
end $$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update before update on public.notifications
  for each row execute function public.guard_notification_update();

-- ── 3. Point d'injection unique : enqueue_push écrit AUSSI dans la boîte ───
-- (Reprise fidèle de la fonction du lot 2.4, + l'écriture en boîte et le
--  paramètre `p_actor`, optionnel pour ne casser aucun appelant.)
create or replace function public.enqueue_push(
  p_type text, p_recipient uuid, p_title text, p_body text, p_url text,
  p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_recent int;
begin
  -- Boîte de réception (in-app) — inconditionnelle : c'est justement le canal
  -- des pilotes qui ont refusé le push.
  --
  -- Tout le bloc est protégé : enqueue_push est appelée depuis des triggers
  -- AFTER INSERT, donc une écriture en boîte qui échoue (quota disque, futur
  -- CHECK, timeout) annulerait l'ACTION MÉTIER — une inscription à une course
  -- perdue parce qu'une notification n'a pas pu s'écrire. Une notification
  -- n'est pas une donnée critique ; elle ne doit jamais faire échouer le reste.
  begin
    -- Plafond horaire par destinataire : dernière digue si un nouveau chemin
    -- d'événement contourne la déduplication.
    select count(*) into v_recent from (
      select 1 from public.notifications
      where profile_id = p_recipient and created_at > now() - interval '1 hour'
      limit 60
    ) capped;

    if v_recent < 60 then
      -- On ignore les destinataires supprimés/anonymisés.
      -- `on conflict do nothing` : l'index de déduplication absorbe les
      -- répétitions (rejoindre/quitter en boucle) sans lever d'erreur.
      insert into public.notifications (profile_id, actor_id, type, title, body, url)
      select p_recipient, p_actor, p_type, p_title, p_body, p_url
      from public.profiles pr
      where pr.id = p_recipient and pr.deleted_at is null
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'enqueue_push : écriture en boîte impossible pour % (%)', p_recipient, sqlerrm;
  end;

  -- Push (intrusif) — seulement si l'Edge Function est configurée.
  select function_url, hook_secret into v_url, v_secret from public.push_config where id = 1;
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', coalesce(v_secret, '')),
    body := jsonb_build_object(
      'type', p_type, 'recipient', p_recipient,
      'title', p_title, 'body', p_body, 'url', p_url
    )
  );
end $$;
revoke all on function public.enqueue_push(text, uuid, text, text, text, uuid) from public, anon, authenticated;
-- L'ancienne signature à 5 arguments n'a plus d'appelant : la retirer évite
-- qu'un futur `perform enqueue_push(...)` tombe silencieusement sur la version
-- sans émetteur (donc sans purge RGPD ni blocage).
drop function if exists public.enqueue_push(text, uuid, text, text, text);

-- ── 4. Compteur de la cloche ───────────────────────────────────────────────
-- Plafonné à 100 (la pastille affiche « 99+ » au-delà — inutile de compter
-- 4 000 lignes). Les émetteurs bloqués sont exclus : bloquer quelqu'un doit
-- fermer TOUS ses canaux, y compris rétroactivement.
create or replace function public.unread_notifications_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select 1 from public.notifications n
    where n.profile_id = auth.uid()
      and n.read_at is null
      and (n.actor_id is null or not public.is_blocked(n.actor_id, auth.uid()))
    limit 100
  ) capped;
$$;
revoke all on function public.unread_notifications_count() from public, anon;
grant execute on function public.unread_notifications_count() to authenticated;

-- ── 5. Marquer comme lues DES notifications précises ───────────────────────
-- Volontairement pas de « tout marquer » : la boîte n'affiche que 50 lignes à
-- la fois, un marquage global rendrait invisibles — et donc définitivement
-- introuvables — les notifications au-delà de la page affichée.
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language sql volatile security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where profile_id = auth.uid() and read_at is null and id = any(p_ids);
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
drop function if exists public.mark_notifications_read();

-- ── 6. Lecture de la boîte ─────────────────────────────────────────────────
-- STABLE : aucune écriture sur le chemin de lecture. Une purge intégrée ici
-- ferait échouer la fonction sur un réplica en lecture seule, bloquerait une
-- seconde ouverture concurrente derrière ses verrous, et — surtout — ne
-- purgerait que les comptes ACTIFS, laissant les boîtes dormantes éternelles.
-- La rétention est donc traitée au point 7, globalement.
--
-- `p_before` : curseur de pagination (created_at de la dernière ligne reçue).
create or replace function public.list_notifications(p_before timestamptz default null)
returns table (id uuid, type text, title text, body text, url text,
               read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.title, n.body, n.url, n.read_at, n.created_at
  from public.notifications n
  where n.profile_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and (n.actor_id is null or not public.is_blocked(n.actor_id, auth.uid()))
  order by n.created_at desc
  limit 50;
$$;
revoke all on function public.list_notifications(timestamptz) from public, anon;
grant execute on function public.list_notifications(timestamptz) to authenticated;
drop function if exists public.list_notifications();

-- ── 7. Rétention : purge globale, hors chemin de lecture ──────────────────
-- Effacée à 90 jours pour TOUT LE MONDE (y compris les comptes dormants —
-- eux seuls rendaient l'engagement RGPD faux), plus les liens morts vers des
-- courses supprimées entre-temps.
create or replace function public.purge_notifications() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  -- Deux étapes INDÉPENDANTES : un bloc d'exception commun annulerait la
  -- rétention (l'étape qui compte) à cause d'un incident sur le nettoyage des
  -- liens morts — un DELETE déjà effectué est défait quand l'exception remonte.
  begin
    delete from public.notifications where created_at < now() - interval '90 days';
  exception when others then
    raise warning 'purge_notifications (rétention) : %', sqlerrm;
  end;

  begin
    -- `url` n'est pas une clé étrangère (elle vise une route, pas une table) :
    -- les cibles disparues se nettoient ici. Le motif UUID est vérifié AVANT le
    -- cast — une URL malformée ne doit pas faire tomber la purge.
    delete from public.notifications n
    where n.url ~ '^race/[0-9a-fA-F-]{36}$'
      and not exists (
        select 1 from public.races r
        where r.id = substring(n.url from 6)::uuid
      );
  exception when others then
    raise warning 'purge_notifications (liens morts) : %', sqlerrm;
  end;
end $$;
revoke all on function public.purge_notifications() from public, anon, authenticated;

-- Planification quotidienne quand pg_cron est disponible (Supabase : à activer
-- dans Database → Extensions). Sans lui, la purge reste appelable à la main.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-notifications')
      where exists (select 1 from cron.job where jobname = 'purge-notifications');
    perform cron.schedule('purge-notifications', '17 3 * * *',
                          'select public.purge_notifications()');
  else
    raise notice 'pg_cron absent : purge_notifications() à planifier manuellement.';
  end if;
end $$;

-- ── 8. RGPD : la boîte disparaît avec le compte, DANS LES DEUX SENS ───────
-- delete_my_account ANONYMISE en place (le profil SURVIT — le supprimer
-- cascaderait sur les résultats des autres pilotes et fausserait leur Elo) →
-- la cascade FK de notifications ne se déclenche JAMAIS.
--
-- Et il ne suffit pas d'effacer les notifications REÇUES : le pseudo est figé
-- dans le corps des notifications ÉMISES (« Anna t'a mis sur la grille »), qui
-- dorment dans les boîtes des autres. Sans `actor_id`, l'anonymisation serait
-- purement cosmétique — n'importe quel destinataire pourrait ré-identifier
-- l'admin d'une course.
-- (Reprise fidèle de la fonction du lot 2.5 + une ligne au point 2.)
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
  delete from public.notifications where profile_id = uid or actor_id = uid;
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
    -- On NE masque PAS l'échec en silence : on le journalise. L'accès est déjà
    -- coupé (deleted_at + garde AuthProvider), mais un échec de purge de la PII
    -- e-mail/OAuth doit être visible dans les logs pour être corrigé (droits auth).
    raise warning 'delete_my_account : nettoyage de l''identité auth impossible pour % (%). deleted_at fait foi ; vérifier les droits sur le schéma auth.', uid, sqlerrm;
  end;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── 9. Modération : effacer les notifications d'un pseudo abusif ──────────
-- moderate_rename_pilot écrase un pseudo insultant sur le profil, mais le
-- pseudo reste figé dans le corps des notifications déjà distribuées. Sans ce
-- balai, l'outil de modération est cosmétique.
-- (Reprise fidèle de la fonction du lot 3.1b + la purge.)
create or replace function public.moderate_rename_pilot(p_profile_id uuid, p_new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if p_profile_id is null then raise exception 'Pilote introuvable'; end if;
  update profiles set username = p_new_name where id = p_profile_id;
  -- Le corps des notifications est figé : on ne le réécrit pas, on le retire.
  delete from public.notifications where actor_id = p_profile_id;
end $$;
revoke all on function public.moderate_rename_pilot(uuid, text) from public, anon;
grant execute on function public.moderate_rename_pilot(uuid, text) to authenticated;

-- ── 10. Les déclencheurs déclarent leur ÉMETTEUR ──────────────────────────
-- (Reprises fidèles des fonctions des lots 2.4 / 2.6 / 3.1b / join_race ;
--  seul l'argument `p_actor` est ajouté — et l'URL de modération corrigée.)

-- Invitation / auto-inscription.
create or replace function public.notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_circuit text; v_admin_name text; v_joiner text;
begin
  if new.profile_id is null then return new; end if;                -- fantôme : pas de compte
  select r.admin_id, c.name into v_admin, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = new.race_id;
  if new.profile_id = v_admin then return new; end if;             -- l'admin s'ajoute lui-même
  if new.profile_id = auth.uid() then
    -- Auto-inscription (join_race) : prévenir l'admin, pas le joignant.
    select username into v_joiner from profiles where id = new.profile_id;
    perform public.enqueue_push(
      'invite', v_admin,
      'Nouveau pilote 🏎️',
      coalesce(v_joiner, 'Un pilote') || ' a rejoint ta course'
        || coalesce(' à ' || v_circuit, '') || '.',
      'race/' || new.race_id,
      new.profile_id);
    return new;
  end if;
  -- Cas classique : l'admin a ajouté un pilote → on prévient ce pilote.
  select username into v_admin_name from profiles where id = v_admin;
  perform public.enqueue_push(
    'invite', new.profile_id,
    'Nouvelle course 🏁',
    coalesce(v_admin_name, 'Un pilote') || ' t’a mis sur la grille'
      || coalesce(' à ' || v_circuit, '') || '.',
    'race/' || new.race_id,
    v_admin);
  return new;
end $$;

-- Classement validé.
create or replace function public.notify_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_profile uuid; v_circuit text;
begin
  select pp.profile_id into v_profile from participations pp where pp.id = new.participation_id;
  if v_profile is null then return new; end if;                  -- fantôme
  select r.admin_id, c.name into v_admin, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = new.race_id;
  if v_profile = v_admin then return new; end if;                -- l'admin a saisi, il sait déjà
  perform public.enqueue_push(
    'result', v_profile,
    'Classement tombé 🏁',
    coalesce(v_circuit, 'Ta course') || ' : ton Elo vient de bouger, viens voir.',
    'race/' || new.race_id,
    v_admin);
  return new;
end $$;

-- Demandes d'amis.
create or replace function public.notify_friend() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select username into v_name from profiles where id = new.requester_id;
    perform public.enqueue_push(
      'friend_request', new.addressee_id,
      'Demande d’ami', coalesce(v_name, 'Un pilote') || ' veut t’ajouter à son garage.', 'amis',
      new.requester_id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    select username into v_name from profiles where id = new.addressee_id;
    perform public.enqueue_push(
      'friend_request', new.requester_id,
      'Ami confirmé 🤝', coalesce(v_name, 'Un pilote') || ' a accepté ta demande.', 'amis',
      new.addressee_id);
  end if;
  return new;
end $$;

-- Signalement → modérateurs. L'URL était « moderation », qui ne correspond à
-- AUCUNE route de l'app : la vraie est « settings/moderation ». Invisible tant
-- que le push était éphémère ; une boîte persistante en aurait fait un lien
-- mort pendant 90 jours.
create or replace function public.notify_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat text;
begin
  v_cat := case new.category
             when 'comportement' then 'Comportement'
             when 'fausse_course' then 'Fausse course'
             when 'classement' then 'Classement truqué'
             when 'usurpation' then 'Usurpation'
             else 'Signalement'
           end;
  perform public.enqueue_push('report', p.id,
      'Nouveau signalement 🚩',
      v_cat || ' à examiner.',
      'settings/moderation',
      new.reporter_id)
  from profiles p
  where p.is_moderator and p.id <> new.reporter_id;
  return new;
end $$;

-- Rattrapage des lignes déjà distribuées avec l'ancienne URL.
update public.notifications set url = 'settings/moderation' where url = 'moderation';

-- Rappel « course bientôt » (lot 2.6) : l'émetteur est l'admin.
create or replace function public.lock_race(p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid; v_status text; v_when timestamptz; v_circuit text;
  v_reminded timestamptz; v_label text;
begin
  select r.admin_id, r.status, r.scheduled_at, r.reminded_at, c.name
    into v_admin, v_status, v_when, v_reminded, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then raise exception 'Seul l''admin peut clôturer'; end if;
  if v_status <> 'upcoming' then raise exception 'Course déjà clôturée'; end if;
  if (select count(*) from participations where race_id = p_race_id) < 2 then
    raise exception 'Il faut au moins 2 pilotes';
  end if;

  update races set status = 'locked', reminded_at = coalesce(reminded_at, now())
    where id = p_race_id;

  -- Rappel envoyé une seule fois (à la PREMIÈRE clôture). Re-clôturer après une
  -- réouverture ne renvoie rien.
  if v_reminded is null then
    v_label := coalesce(' pour ' || v_circuit, '')
      || coalesce(' le ' || to_char(v_when at time zone 'Europe/Paris', 'DD/MM à HH24hMI'), '');
    perform public.enqueue_push('invite', pp.profile_id,
        'Course bientôt 🏁',
        'Tu es sur la grille' || v_label || '.',
        'race/' || p_race_id,
        v_admin)
    from participations pp
    where pp.race_id = p_race_id and pp.profile_id is not null and pp.profile_id <> v_admin;
  end if;
end $$;
revoke all on function public.lock_race(uuid) from public, anon;
grant execute on function public.lock_race(uuid) to authenticated;
