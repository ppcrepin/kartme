-- KartSquad — le BORNAGE ne casse plus la somme nulle.
--
-- Dette relevée par le vérificateur, mesurée avant correctif : une course à
-- quatre pilotes dont deux au plancher (100) CRÉE 14 points d'Elo à partir de
-- rien. Les deux au plancher finissent derniers, devraient perdre, et ne
-- peuvent pas — mais leurs adversaires encaissent quand même leurs gains.
--
-- L'arrondi à somme nulle porte sur `delta`. Or ce n'est pas `delta` qui est
-- appliqué : c'est `clamp(elo_before + delta, 100, 2500)`. Tout l'écart entre
-- les deux est du point créé (au plancher) ou détruit (au plafond), et c'est
-- lui qui est écrit dans `results.elo_delta` et `elo_history.delta`.
--
-- La somme nulle entre inscrits n'est pas une élégance : c'est le socle de
-- l'anti-triche. Sans elle, garder un ami au plancher et le battre chaque
-- semaine fait monter tout un groupe avec des points que personne ne paie —
-- dans un classement Global qui mélange les groupes.
--
-- ── La règle retenue ─────────────────────────────────────────────────────
-- Le résidu est absorbé par les pilotes À L'AISE dans le barème ; jamais par
-- ceux déjà collés à la borne vers laquelle on les pousserait.
--
-- Un premier essai, strictement à somme nulle, s'est révélé pire que le mal :
-- avec deux pilotes au plancher, le vainqueur ne gagnait plus rien (le perdant
-- ne pouvant pas payer, la somme nulle exigeait d'annuler son gain), et un
-- groupe entier au plancher restait GELÉ à vie. Un test du lot 1.3 l'a dit
-- immédiatement, ce qui est précisément son rôle.
--
-- L'abus visé est bien fermé : celui qui garde un ami au plancher pour le
-- battre est, lui, au milieu du barème — il absorbe donc le résidu. Ce qui
-- subsiste, ce sont les plateaux ENTIÈREMENT au bout de l'échelle, où aucune
-- redistribution n'aurait de sens et où il n'y a de toute façon rien à gagner.
--
-- `correct_race_results` n'a pas besoin d'être retouchée : elle rembobine puis
-- rappelle ce moteur.
--
-- Corps repris de sa DERNIÈRE définition (lot A6 abandons) ; seul le bloc de
-- redistribution est ajouté, juste avant les écritures.

begin;

create or replace function public.submit_race_results(
  p_race_id uuid, p_order uuid[], p_dnf uuid[] default '{}'::uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid;
  v_status text;
  n int;
  n_reg int;                          -- comptes inscrits dans la course
  v_residu int;                       -- points créés (>0) ou détruits (<0) par le bornage
  v_tour int;
  n_fin int;                          -- pilotes ayant TERMINÉ
  K_STD constant numeric := 64;       -- pilote installé
  K_CAL constant numeric := 128;      -- pilote en calibration (< CAL_RACES courses)
  CAL_RACES constant int := 5;
  DIV constant numeric := 800;
begin
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then
    raise exception 'Seul l''admin peut saisir le classement';
  end if;
  if v_status not in ('upcoming', 'locked') then raise exception 'Classement déjà saisi'; end if;

  n := array_length(p_order, 1);
  if n is null or n < 2 then raise exception 'Il faut au moins 2 pilotes'; end if;

  -- Doublon dans le classement : à deux pilotes, le self-join ne produit aucune
  -- ligne → course marquée « terminée », zéro résultat, un pilote effacé de
  -- l'histoire, et plus rejouable. À trois ou plus, erreur de contrainte brute.
  if (select count(distinct o.id) from unnest(p_order) as o(id)) <> n then
    raise exception 'Classement invalide (un pilote figure deux fois)';
  end if;

  if (select count(*) from participations where race_id = p_race_id) <> n
     or exists (
       select 1 from unnest(p_order) as o(id)
       where not exists (select 1 from participations pp where pp.id = o.id and pp.race_id = p_race_id)
     ) then
    raise exception 'Classement invalide (pilotes incohérents)';
  end if;

  -- Liste d'abandons bien formée. Un NULL ou un doublon fausserait `n_fin`
  -- (count(*) les compte) : le rang égalisé descendrait d'un cran et un pilote
  -- ARRIVÉ se retrouverait ex æquo avec un abandon — un transfert d'Elo
  -- déclenché par un champ que le serveur est censé valider.
  if array_position(p_dnf, null) is not null
     or (select count(*) from unnest(p_dnf)) is distinct from
        (select count(distinct id) from unnest(p_dnf) as d(id)) then
    raise exception 'Liste d''abandons invalide (doublon ou valeur vide)';
  end if;

  -- Un abandon doit faire partie du classement soumis.
  if exists (select 1 from unnest(coalesce(p_dnf, '{}'::uuid[])) as d(id)
             where not (d.id = any(p_order))) then
    raise exception 'Abandon invalide (pilote hors classement)';
  end if;

  -- …et être placé DERRIÈRE tous les pilotes à l'arrivée. Le rang d'affichage
  -- (`results.position`) est pris tel quel dans p_order : sans ce contrôle, un
  -- abandon envoyé en tête serait « ABD » sur l'écran course mais position 1
  -- partout ailleurs — podium, partage, badge « Champagne », victoires du
  -- profil. Un appel direct à l'API suffirait à se fabriquer des victoires.
  if exists (
    select 1 from unnest(p_order) with ordinality as o(pid, rk)
    where o.pid = any(coalesce(p_dnf, '{}'::uuid[]))
      and o.rk < (select max(o2.rk) from unnest(p_order) with ordinality as o2(pid, rk)
                  where not (o2.pid = any(coalesce(p_dnf, '{}'::uuid[]))))
  ) then
    raise exception 'Un abandon ne peut pas être classé devant un pilote à l''arrivée';
  end if;
  -- Une course où personne ne finit n'a pas de sens : elle ne classe rien et
  -- ferait 100 % d'ex æquo (aucun point échangé, mais un compteur de courses
  -- incrémenté pour rien).
  if (select count(*) from unnest(coalesce(p_dnf, '{}'::uuid[]))) >= n then
    raise exception 'Il faut au moins un pilote à l''arrivée';
  end if;

  -- …et, dès que l'Elo est en jeu (au moins deux INSCRITS), au moins un inscrit
  -- doit avoir fini. Le contrôle ci-dessus compte les participants fantômes
  -- compris : sans celui-ci, deux inscrits pouvaient tous deux abandonner
  -- derrière un invité, se retrouver ex æquo, et s'échanger des points.
  if (select count(*) from participations pp
      where pp.race_id = p_race_id and pp.profile_id is not null) >= 2
     and not exists (
       select 1 from participations pp
       where pp.race_id = p_race_id and pp.profile_id is not null
         and not (pp.id = any(coalesce(p_dnf, '{}'::uuid[])))
     ) then
    raise exception 'Il faut au moins un pilote inscrit à l''arrivée';
  end if;

  n_fin := n - (select count(distinct id) from unnest(coalesce(p_dnf, '{}'::uuid[])) as d(id)
                where d.id is not null);

  create temp table _calc on commit drop as
  select
    ord.rank::int as rank,                       -- rang D'AFFICHAGE (unique)
    -- Rang DE CALCUL : tous les abandons partagent la place suivant le dernier
    -- pilote à l'arrivée → ils sont ex æquo entre eux, et derrière tout le monde.
    (case when ord.pid = any(coalesce(p_dnf, '{}'::uuid[]))
          then n_fin + 1 else ord.rank::int end) as crank,
    (ord.pid = any(coalesce(p_dnf, '{}'::uuid[]))) as is_dnf,
    pp.id as participation_id, pp.profile_id, pp.ghost_id,
    coalesce(pr.elo, gh.elo) as elo_before,
    case when pr.id is null then null
         when pr.races < CAL_RACES then K_CAL
         else K_STD end as k
  from unnest(p_order) with ordinality as ord(pid, rank)
  join participations pp on pp.id = ord.pid
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id;

  select count(*) into n_reg from _calc where profile_id is not null;

  -- Contribution brute : seuls les DUELS entre inscrits comptent (fantômes
  -- figés). K appliqué à un duel = MOYENNE des K des deux pilotes. Le score
  -- vaut 1 / 0,5 / 0 — l'égalité (deux abandons) est symétrique, donc la somme
  -- globale reste nulle.
  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.is_dnf, a.elo_before,
    case when a.profile_id is null or n_reg < 2 then 0
    else (1.0 / (n_reg - 1)) * sum(
           ((a.k + b.k) / 2.0) *
           ((case when a.crank < b.crank then 1.0
                  when a.crank = b.crank then 0.5
                  else 0.0 end)
            - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / DIV)))
         ) filter (where b.profile_id is not null)
    end as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.is_dnf, a.elo_before, a.k;

  -- Arrondi à somme nulle (plus grand reste) UNIQUEMENT sur les inscrits ;
  -- les fantômes reçoivent delta 0.
  create temp table _delta on commit drop as
  with reg as (
    select * from _raw where profile_id is not null
  ),
  -- Décision PO 2026-07-28 : **un abandon ne rapporte JAMAIS de points**.
  -- L'égalité entre abandons pouvait faire GAGNER de l'Elo au plus faible
  -- (0,5 face à un adversaire dont l'espérance frôlait 0,95) : « ABD Kevin +4 »
  -- partagé sur WhatsApp est indéfendable. On plafonne donc son gain à 0 et on
  -- rend ce qu'il aurait pris aux pilotes qui ont FINI — la somme reste nulle,
  -- et la phrase tient en une ligne pour la FAQ.
  surplus as (
    select coalesce(sum(greatest(raw, 0)) filter (where is_dnf), 0) as s,
           count(*) filter (where not is_dnf) as n_fin_reg
    from reg
  ),
  adj as (
    select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before,
      case when is_dnf then least(raw, 0)
           else raw + (select case when n_fin_reg > 0 then s / n_fin_reg else 0 end
                       from surplus)
      end as raw
    from reg
  ),
  r as (
    select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before, raw,
           round(raw)::int as base, (round(raw) - raw) as up_err
    from adj
  ),
  resid as (select coalesce(sum(base), 0)::int as s from r),
  ranked as (
    select r.*,
      row_number() over (order by up_err desc, elo_before asc, participation_id) as rn_up,
      row_number() over (order by up_err asc, elo_before asc, participation_id) as rn_down
    from r
  )
  select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before,
    base
      - (case when (select s from resid) > 0 and rn_up <= (select s from resid) then 1 else 0 end)
      + (case when (select s from resid) < 0 and rn_down <= -(select s from resid) then 1 else 0 end)
      as delta
  from ranked
  union all
  select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before, 0 as delta
  from _raw where profile_id is null;

  -- ── Le BORNAGE ne doit pas créer ni détruire de points ──────────────────
  -- L'arrondi ci-dessus rend une somme de `delta` nulle. Mais ce n'est pas
  -- `delta` qui est appliqué : c'est `clamp(elo_before + delta, 100, 2500)`,
  -- et l'écart entre les deux est précisément ce que le classement gagne ou
  -- perd. Un pilote AU PLANCHER qui devrait perdre ne perd pas — ses
  -- adversaires encaissent pourtant leurs gains. Mesuré avant correctif :
  -- +14 points créés sur UNE course à quatre, dont deux au plancher.
  --
  -- Ce n'est pas une coquetterie d'arrondi. La somme nulle entre inscrits est
  -- le socle de l'anti-triche : sans elle, il suffit de garder un ami au
  -- plancher et de le battre chaque semaine pour que le groupe gagne des
  -- points que personne ne paie — dans un classement Global qui mélange les
  -- groupes.
  --
  -- On redistribue donc le résidu, un point à la fois, à ceux qui peuvent
  -- RÉELLEMENT l'absorber : un pilote déjà collé à une borne ne compte pas,
  -- puisque bouger son `delta` ne bougerait pas son Elo. On prélève d'abord
  -- sur les plus gros gains (résidu positif) et on rend d'abord aux plus
  -- grosses pertes (résidu négatif) — le correctif se voit le moins là où il
  -- pèse le moins.
  for v_tour in 1..100 loop
    select coalesce(sum(greatest(100, least(2500, elo_before + delta)) - elo_before), 0)
      into v_residu
      from _delta where profile_id is not null;
    exit when v_residu = 0;

    with candidats as (
      select participation_id,
             row_number() over (
               order by case when v_residu > 0 then -delta else delta end,
                        elo_before, participation_id) as rn
      from _delta
      where profile_id is not null
        -- Le mouvement doit changer l'Elo pour de vrai : sinon on tournerait
        -- en rond en déplaçant un `delta` que le bornage annule aussitôt.
        and case when v_residu > 0 then elo_before + delta - 1 >= 100
                 else elo_before + delta + 1 <= 2500 end
        -- ⚠️ Et le correctif n'est JAMAIS porté par un pilote déjà collé à la
        -- borne vers laquelle on le pousserait. Sans cette clause, la règle
        -- devenait absurde là où elle comptait le plus : deux pilotes au
        -- plancher, le vainqueur ne gagnait plus rien — puisque le perdant ne
        -- pouvait pas payer, la somme nulle exigeait d'annuler le gain. Et un
        -- groupe entier au plancher se retrouvait GELÉ à vie, incapable de
        -- remonter. Un test du lot 1.3 l'a dit avant moi.
        --
        -- La règle retenue : ceux qui sont à l'aise dans le barème absorbent,
        -- ceux qui sont au bout ne paient pas. L'abus visé — garder un ami au
        -- plancher et le battre chaque semaine — est bien fermé, parce que le
        -- groupe qui en profite est, lui, en plein milieu du barème. Ce qui
        -- subsiste, ce sont les plateaux ENTIÈREMENT collés à une borne, où
        -- aucune redistribution n'a de sens et où il n'y a rien à gagner.
        and case when v_residu > 0 then elo_before > 100
                 else elo_before < 2500 end
    )
    update _delta d set delta = d.delta - sign(v_residu)
    from candidats c
    where c.participation_id = d.participation_id and c.rn <= abs(v_residu);

    -- Plus personne ne peut absorber (tout le monde collé à la même borne) :
    -- le résidu devient alors mathématiquement inévitable. On sort plutôt que
    -- de boucler — c'est le seul cas où la somme nulle cède, et il suppose un
    -- plateau entier au plancher ou au plafond.
    exit when not found;
  end loop;

  perform set_config('kartsquad.elo_engine', '1', true);

  update profiles p set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.profile_id = p.id;

  update ghost_profiles g set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.ghost_id = g.id;

  insert into results (race_id, participation_id, position, dnf, elo_before, elo_after, elo_delta)
  select p_race_id, d.participation_id, d.rank, d.is_dnf, d.elo_before,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  insert into elo_history (profile_id, ghost_id, race_id, elo, delta)
  select d.profile_id, d.ghost_id, p_race_id,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  -- Compteur de courses : +1 par inscrit (aligné sur elo_history). Un abandon
  -- reste une course jouée : il était sur la piste.
  update profiles p set races = p.races + 1
  from _delta d where d.profile_id = p.id;

  update races set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_race_id;

  drop table _calc;
  drop table _raw;
  drop table _delta;

  perform public.award_badges(p_race_id);
end;
$$;
revoke all on function public.submit_race_results(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.submit_race_results(uuid, uuid[], uuid[]) to authenticated;

commit;
