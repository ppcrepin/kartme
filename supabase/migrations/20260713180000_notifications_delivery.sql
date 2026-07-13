-- KartSquad — lot 2.4, Temps 2 : livraison des notifications.
--
-- À chaque événement notifiable, un déclencheur compose le message (FR, ton
-- « jeu de mots ») et appelle l'Edge Function « push » via pg_net, UNE fois
-- par destinataire. Le respect des préférences et des heures de silence est
-- fait par la fonction (elle relit prefs + silence) — ici on ne fait
-- qu'émettre l'événement.
--
-- pg_net n'existe que sur Supabase : sur le Postgres de test local, le schéma
-- « net » est émulé (stub qui capture les appels) par 00_bootstrap.sql.

-- Active pg_net quand il est disponible (Supabase) ; sinon on s'appuie sur le
-- stub de test — jamais d'erreur « extension introuvable ».
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- Config interne : URL de l'Edge Function + secret partagé. UNE seule ligne,
-- renseignée par l'éditeur. Aucune policy RLS → invisible aux clients ; seul le
-- code SECURITY DEFINER (enqueue_push) et le service_role y accèdent.
create table if not exists public.push_config (
  id            int primary key default 1,
  function_url  text,
  hook_secret   text,
  constraint push_config_singleton check (id = 1)
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- Émet un push (asynchrone). Silencieux tant que la config n'est pas remplie.
create or replace function public.enqueue_push(
  p_type text, p_recipient uuid, p_title text, p_body text, p_url text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
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
-- revoke from public NE retire PAS les grants par défaut de Supabase à anon /
-- authenticated : on les cite explicitement pour qu'un client ne puisse pas
-- appeler /rpc/enqueue_push et forger un push au texte arbitraire.
revoke all on function public.enqueue_push(text, uuid, text, text, text) from public, anon, authenticated;

-- ── Invitation à une course : un participant inscrit vient d'être ajouté ────
create or replace function public.notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_circuit text; v_admin_name text;
begin
  if new.profile_id is null then return new; end if;              -- fantôme : pas de compte
  select r.admin_id, c.name into v_admin, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = new.race_id;
  if new.profile_id = v_admin then return new; end if;           -- l'admin s'ajoute lui-même
  select username into v_admin_name from profiles where id = v_admin;
  perform public.enqueue_push(
    'invite', new.profile_id,
    'Nouvelle course 🏁',
    coalesce(v_admin_name, 'Un pilote') || ' t’a mis sur la grille'
      || coalesce(' à ' || v_circuit, '') || '.',
    'race/' || new.race_id
  );
  return new;
end $$;

create trigger participations_notify_invite after insert on public.participations
  for each row execute function public.notify_invite();

-- ── Résultat de course : classement validé (une ligne results par pilote) ───
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
    'race/' || new.race_id
  );
  return new;
end $$;

create trigger results_notify after insert on public.results
  for each row execute function public.notify_result();

-- ── Demandes d'amis : reçue (INSERT pending) et acceptée (UPDATE → accepted) ─
create or replace function public.notify_friend() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select username into v_name from profiles where id = new.requester_id;
    perform public.enqueue_push(
      'friend_request', new.addressee_id,
      'Demande d’ami', coalesce(v_name, 'Un pilote') || ' veut t’ajouter à son garage.', 'amis'
    );
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    select username into v_name from profiles where id = new.addressee_id;
    perform public.enqueue_push(
      'friend_request', new.requester_id,
      'Ami confirmé 🤝', coalesce(v_name, 'Un pilote') || ' a accepté ta demande.', 'amis'
    );
  end if;
  return new;
end $$;

create trigger friendships_notify after insert or update on public.friendships
  for each row execute function public.notify_friend();
