-- KartSquad — A15 : fil d'actualité (« Ça bouge »).
--
-- Le PO veut « une sorte de scrolling à la Strava » : voir que ses amis ont
-- couru, qu'il a été rétrogradé, etc. L'étude préalable a mesuré le volume
-- réel — une course est un événement PARTAGÉ par tout le groupe, donc environ
-- 5 à 8 nouvelles par mois pour un pilote qui a 9 amis, et plus de 20 jours
-- par mois sans rien. Ce chiffre commande deux décisions structurantes :
--   · le fil est un BANDEAU de 3 items en tête de l'accueil, pas un écran
--     entier (un écran entier serait le premier écran de l'app et son plus
--     vide) ;
--   · pas de scroll infini à construire : la fenêtre de 90 jours et la limite
--     de page suffisent, et le fil n'atteindra jamais la page 3.
--
-- ── Pourquoi un fil CALCULÉ, et pas une table d'événements ────────────────
-- Décision structurante, spécifique à ce dépôt : `delete_my_account`
-- ANONYMISE sans supprimer la ligne (leçon acquise deux fois, A5 puis A13 :
-- « la purge RGPD ne pouvait PAS venir du on delete cascade »). Une table
-- d'événements nous obligerait à recoder la purge RGPD dans les deux sens, la
-- purge de modération, les liens morts et la rétention — tout ce qui existe
-- déjà et fonctionne. Un fil calculé à la lecture applique les filtres AU
-- MOMENT DE LA LECTURE : un compte supprimé, un pseudo renommé par la
-- modération, un pilote suspendu ou un blocage sont donc pris en compte
-- rétroactivement, par construction, sans une ligne de code de plus.
-- Contrepartie assumée : chaque page rejoue l'agrégation. Acceptable ici, et
-- réversible d'un `create or replace` si le volume change un jour.
--
-- ── Décisions PO (2026-07-30), appliquées telles quelles ──────────────────
--   · 5 types : course à venir d'un ami · résultat d'une course d'un ami ·
--     changement de grade d'un ami · MON changement de grade · badge d'un ami.
--   · Les RÉTROGRADATIONS des amis SONT annoncées (montées et chutes), et dès
--     la première course — le PO a tranché contre la recommandation inverse,
--     qui invoquait le bruit (tout le monde démarre à 1000, pile sur une
--     frontière de grade) et le coût social. Aucun filtre de calibration.
--   · Visibilité RÉTROACTIVE : accepter une amitié donne accès aux 90 jours
--     d'activité déjà écoulés de cette personne. Pas de plancher à la date
--     d'amitié.
--   · Portée : amis ACCEPTÉS uniquement (ni amis d'amis, ni global).
--   · Invités sans compte : COMPTÉS, jamais nommés (ils n'ont ni compte, ni
--     réglage de confidentialité, ni moyen de se retirer, et ne peuvent pas
--     lire le fil). Même règle que les tableaux de meilleurs tours.
--
-- ⚠️ Note de sécurité consignée : le fil ne révèle aucune donnée qui ne soit
-- déjà lisible par API (results/participations sont en RLS `using (true)`
-- depuis le lot 0.3 — dette consignée dans la roadmap). Mais il change le
-- MODE DE DIFFUSION : ce qui exigeait une intention technique arrive
-- désormais sous les yeux de gens qui n'ont rien demandé. Le durcissement
-- RLS+RPC recommandé par la revue A11 devient plus urgent, pas moins.

begin;

-- ── 1. « Depuis ma dernière visite » ──────────────────────────────────────
-- Un fil calculé n'a pas de ligne à marquer « lue » : une seule date par
-- pilote suffit pour compter les nouveautés.
--
-- `default now()` remplit les profils EXISTANTS à la date de la migration :
-- le fil s'ouvre donc avec les 90 derniers jours déjà consultables (utile —
-- sinon il serait vide au lancement), mais aucun de ces items anciens n'est
-- compté comme « nouveau ». Sans cela, la pastille afficherait d'emblée un
-- paquet d'archives présentées comme des nouvelles.
alter table public.profiles
  add column if not exists feed_seen_at timestamptz not null default now();

-- ── 2. Index de lecture du fil ───────────────────────────────────────────
-- Les quatre sources sont balayées par date décroissante sur une fenêtre de
-- 90 jours. Sans ces index, chaque ouverture de l'accueil ferait un scan
-- complet de races/results/user_badges (la fiche circuit a déjà payé cette
-- facture : ~8 s à l'échelle, ~90 ms avec l'index — roadmap A11).
create index if not exists races_created_idx on public.races (created_at desc);
create index if not exists races_completed_idx on public.races (completed_at desc)
  where completed_at is not null;
create index if not exists user_badges_unlocked_idx
  on public.user_badges (unlocked_at desc);

-- ── 3. Qui est mon ami ? ─────────────────────────────────────────────────
-- Extrait en fonction : la condition est reprise cinq fois dans get_feed, et
-- la recopier cinq fois est le meilleur moyen d'en oublier une le jour où
-- elle change. `accepted` UNIQUEMENT — piège documenté : `profiles_select`
-- ouvre le profil dès qu'une demande est `pending` (« envoyer une demande,
-- c'est consentir à être vu »), ce qui donnerait un fil à quiconque a envoyé
-- une demande non encore acceptée. `get_leaderboard`, `user_badges_select` et
-- `search_pilots.elo_exact` s'en tiennent tous à `accepted` : le fil aussi.
create or replace function public.feed_is_friend(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_other and f.addressee_id = auth.uid())
        or (f.addressee_id = p_other and f.requester_id = auth.uid()))
  );
$$;
revoke all on function public.feed_is_friend(uuid) from public, anon;
grant execute on function public.feed_is_friend(uuid) to authenticated;

-- ── 4. Un pilote est-il nommable pour moi ? ──────────────────────────────
-- Moi, les profils publics, et mes amis acceptés. Un ami qui court avec cinq
-- inconnus donne « Martin a couru à Sologne Karting (6 pilotes) » — jamais
-- les noms des inconnus.
create or replace function public.feed_can_name(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile = auth.uid()
      or public.feed_is_friend(p_profile)
      or exists (select 1 from profiles p where p.id = p_profile and not p.is_private);
$$;
revoke all on function public.feed_can_name(uuid) from public, anon;
grant execute on function public.feed_can_name(uuid) to authenticated;

-- ── 5. Le fil ────────────────────────────────────────────────────────────
-- STABLE, security definer : aucune écriture sur le chemin de lecture (une
-- purge ou un marquage ici échouerait sur un réplica en lecture seule et se
-- bloquerait derrière ses propres verrous sur deux ouvertures concurrentes —
-- leçon de list_notifications).
--
-- Le TEXTE n'est pas fabriqué ici : la fonction renvoie des faits (type,
-- acteur, course, nombres) et l'application les met en français. Deux raisons :
-- un libellé figé en base gèlerait un pseudo et un Elo (le dépôt s'est déjà
-- brûlé deux fois là-dessus), et changer une formulation ne doit pas demander
-- une migration collée à la main par le PO.
--
-- `p_before` : curseur de pagination (le `at` de la dernière ligne reçue).
create or replace function public.get_feed(
  p_before timestamptz default null,
  p_limit int default 20
)
returns table (
  kind text,              -- race_upcoming | race_result | grade_friend | grade_me | badge_friend
  at timestamptz,
  actor_id uuid,
  actor_username text,
  actor_avatar_path text,
  race_id uuid,
  circuit_id uuid,
  circuit_name text,
  circuit_city text,
  scheduled_at timestamptz,
  pilots_count int,       -- inscrits au compte (hors invités)
  guests_count int,       -- invités : comptés, jamais nommés
  winner_username text,   -- null si je n'ai pas le droit de le nommer
  my_position int,        -- ma place dans cette course, si j'y étais
  my_elo_delta int,
  badge_key text,
  band_from int,
  band_to int,
  elo int
)
language sql stable security definer set search_path = public as $$
  with moi as (select auth.uid() as id),
  -- Fenêtre dure : au-delà, ce n'est plus de l'actualité. Elle plafonne aussi
  -- le coût de la requête quelle que soit la taille de l'historique.
  fenetre as (select now() - interval '90 days' as depuis),

  -- (1) Course à venir créée par un ami. Le seul item AU FUTUR et le seul
  --     réellement actionnable : je peux décider d'y aller. Exclut les
  --     courses que J'AI créées (je les connais) — même règle que
  --     notify_invite, qui saute son propre auteur.
  courses_a_venir as (
    select 'race_upcoming'::text as kind, r.created_at as at,
           r.admin_id as actor_id, r.id as race_id, r.circuit_id, r.scheduled_at
    from races r, moi, fenetre
    where r.status = 'upcoming'
      and r.scheduled_at >= now()
      and r.created_at >= fenetre.depuis
      and r.admin_id <> moi.id
      and public.feed_is_friend(r.admin_id)
  ),

  -- (2) Résultat d'une course où un ami a couru. Un item PAR COURSE (pas par
  --     pilote) : sinon une course à 6 amis produirait 6 lignes identiques.
  --     Exclut les courses dont je suis l'admin : c'est moi qui ai saisi le
  --     classement, l'annoncer m'informerait de ce que je viens de faire.
  courses_finies as (
    select 'race_result'::text as kind, r.completed_at as at,
           r.admin_id as actor_id, r.id as race_id, r.circuit_id,
           r.scheduled_at
    from races r, moi, fenetre
    where r.status = 'completed'
      and r.completed_at is not null
      and r.completed_at >= fenetre.depuis
      and r.admin_id <> moi.id
      and exists (
        select 1 from participations pa
        join profiles p on p.id = pa.profile_id
        where pa.race_id = r.id
          and pa.profile_id is not null
          and p.deleted_at is null and p.suspended_at is null
          and public.feed_is_friend(pa.profile_id)
      )
  ),

  -- (3+4) Changement de GRADE, dérivé d'elo_history : la bande de l'Elo après
  --     la course diffère de celle de l'Elo d'avant (`elo - delta`). Aucune
  --     table à créer.
  --     Décision PO : montées ET chutes, dès la première course — donc aucun
  --     filtre de calibration, alors que K y est doublé et qu'une seule course
  --     peut traverser une bande entière. Les oscillations autour de 1000 (Elo
  --     de départ de tout le monde, et frontière de grade) sont assumées.
  grades as (
    select case when eh.profile_id = moi.id then 'grade_me' else 'grade_friend' end as kind,
           eh.created_at as at, eh.profile_id as actor_id, eh.race_id,
           public.grade_band(eh.elo - eh.delta) as band_from,
           public.grade_band(eh.elo) as band_to,
           eh.elo
    from elo_history eh, moi, fenetre
    where eh.profile_id is not null
      and eh.created_at >= fenetre.depuis
      and public.grade_band(eh.elo) <> public.grade_band(eh.elo - eh.delta)
      and (eh.profile_id = moi.id or public.feed_is_friend(eh.profile_id))
  ),

  -- (5) Badge débloqué par un ami. Décision PO, contre la recommandation :
  --     l'étude a mesuré un plafond de 12 badges par personne, donc ~25-30
  --     items les deux premiers mois puis presque plus jamais. Mon propre
  --     badge n'entre pas dans mon fil (l'app me l'annonce déjà par un toast
  --     au moment du déblocage).
  badges as (
    select 'badge_friend'::text as kind, ub.unlocked_at as at,
           ub.profile_id as actor_id, ub.race_id, ub.badge_key
    from user_badges ub, moi, fenetre
    where ub.unlocked_at >= fenetre.depuis
      and ub.profile_id <> moi.id
      and public.feed_is_friend(ub.profile_id)
  ),

  -- Les quatre sources ramenées à une forme commune. Types posés
  -- EXPLICITEMENT sur la première branche : sans cela, une colonne dont la
  -- première branche est `null` prend le type `text` et la comparaison de
  -- dates du curseur échouerait à l'exécution, pas à la création.
  brut as (
    select kind, at, actor_id, race_id, circuit_id, scheduled_at,
           null::text as badge_key, null::int as band_from,
           null::int as band_to, null::int as elo
    from courses_a_venir
    union all
    select kind, at, actor_id, race_id, circuit_id, scheduled_at,
           null::text, null::int, null::int, null::int
    from courses_finies
    union all
    select kind, at, actor_id, race_id, null::uuid, null::timestamptz,
           null::text, band_from, band_to, elo
    from grades
    union all
    select kind, at, actor_id, race_id, null::uuid, null::timestamptz,
           badge_key, null::int, null::int, null::int
    from badges
  ),

  -- Filtres d'exclusion, recopiés à l'identique de get_leaderboard et
  -- get_circuit_top_times (décisions PO 2026-07-29). Ne PAS les réinventer :
  -- la roadmap enregistre une régression née d'une fonction reprise d'une
  -- version antérieure à ces règles.
  filtre as (
    select b.* from brut b
    join profiles a on a.id = b.actor_id
    where a.deleted_at is null
      and a.suspended_at is null
      and not public.is_blocked(b.actor_id, (select id from moi))
      and (p_before is null or b.at < p_before)
    order by b.at desc
    limit greatest(coalesce(p_limit, 20), 0)
  )

  select f.kind, f.at, f.actor_id,
         a.username as actor_username, a.avatar_path as actor_avatar_path,
         f.race_id, c.id as circuit_id, c.name as circuit_name, c.city as circuit_city,
         f.scheduled_at,
         -- Inscrits au compte : le nombre est public, les noms non.
         (select count(*)::int from participations pa
          where pa.race_id = f.race_id and pa.profile_id is not null) as pilots_count,
         (select count(*)::int from participations pa
          where pa.race_id = f.race_id and pa.ghost_id is not null) as guests_count,
         -- Vainqueur : nommé seulement si j'ai le droit de le voir.
         (select case when public.feed_can_name(p.id) then p.username end
          from results re
          join participations pa on pa.id = re.participation_id
          join profiles p on p.id = pa.profile_id
          where re.race_id = f.race_id and re.position = 1
            and pa.profile_id is not null
          limit 1) as winner_username,
         -- Ma place et mon delta : ce qui transforme un fait en enjeu.
         (select re.position from results re
          join participations pa on pa.id = re.participation_id
          where re.race_id = f.race_id and pa.profile_id = (select id from moi)
          limit 1) as my_position,
         (select re.elo_delta from results re
          join participations pa on pa.id = re.participation_id
          where re.race_id = f.race_id and pa.profile_id = (select id from moi)
          limit 1) as my_elo_delta,
         f.badge_key, f.band_from, f.band_to, f.elo
  from filtre f
  join profiles a on a.id = f.actor_id
  left join races r on r.id = f.race_id
  left join circuits c on c.id = coalesce(f.circuit_id, r.circuit_id)
  order by f.at desc;
$$;
revoke all on function public.get_feed(timestamptz, int) from public, anon;
grant execute on function public.get_feed(timestamptz, int) to authenticated;

-- ── 6. Le compteur « ça bouge » ──────────────────────────────────────────
-- SÉPARÉ du compteur de la boîte, décision de conception assumée : chaque
-- ligne de « Ta boîte » veut dire « quelqu'un t'attend » (invitation,
-- classement à saisir, demande d'ami). C'est le signal le plus précieux de
-- l'app. Le noyer sous 5 à 10 fois plus de nouvelles ambiantes le rendrait
-- ignorable — et une pastille qui a menti une fois est morte pour de bon.
--
-- Plafonné à 20 : au-delà, « 20+ » suffit et on évite de compter une longue
-- traîne à chaque ouverture d'écran.
create or replace function public.unread_feed_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select 1 from public.get_feed(null, 20) f
    where f.at > coalesce(
      (select p.feed_seen_at from profiles p where p.id = auth.uid()),
      now() - interval '90 days'
    )
    limit 20
  ) capped;
$$;
revoke all on function public.unread_feed_count() from public, anon;
grant execute on function public.unread_feed_count() to authenticated;

-- ── 7. « J'ai vu le fil » ────────────────────────────────────────────────
-- Appelée à l'ouverture de l'écran Actu. Jamais en arrière : deux onglets
-- ouverts en parallèle ne doivent pas faire réapparaître des nouveautés
-- déjà vues.
create or replace function public.mark_feed_seen()
returns void
language sql volatile security definer set search_path = public as $$
  update public.profiles
     set feed_seen_at = greatest(feed_seen_at, now())
   where id = auth.uid();
$$;
revoke all on function public.mark_feed_seen() from public, anon;
grant execute on function public.mark_feed_seen() to authenticated;

commit;
