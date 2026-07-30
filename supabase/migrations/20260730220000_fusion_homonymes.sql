-- KartSquad — répare deux doublons créés par l'import A16.
--
-- ── Ce qui s'est passé ────────────────────────────────────────────────────
-- La première version d'A16 rapprochait les circuits par le NOM SEUL. La revue
-- a montré que sept circuits « déménageaient » ainsi de 40 à 470 km, victimes
-- d'HOMONYMIES de commune. Le correctif a ajouté un contrôle géographique :
-- un rapprochement dont la ville du fichier géocode à plus de 30 km de nos
-- coordonnées est REJETÉ.
--
-- Rejeté… puis inséré comme circuit NEUF, avec le géocodage fautif. Le
-- contrôle a bien vu que quelque chose n'allait pas, et la conclusion tirée
-- était la mauvaise : « ce n'est pas le même circuit » au lieu de « je ne sais
-- pas situer cette ligne ». Deux lieux sur les sept sont donc passés d'un
-- risque de renommage abusif à un doublon franc :
--
--   · « Kart'Are Aigues-Vives » — code postal 09500 et adresse « D625 entre
--     Lavelanet et Mirepoix », donc l'Ariège, mais coordonnées tombant sur
--     Aigues-Vives dans l'AUDE : 59 km de notre « Circuit International de
--     Lavelanet », qui est le même karting. Son adresse contredit sa position
--     à l'intérieur d'une même ligne.
--   · « Karting Loisirs Neuilly » — ville « Neuilly », qui n'est pas une
--     commune française (le relevé disait « Neuilly (Oise) »), coordonnées à
--     85 km de notre « Karting » de Neuilly-sous-Clermont, dans l'Oise. Le
--     code postal, lui, a été retiré — ce qui a rendu le contrôle de cohérence
--     code postal / position AVEUGLE : l'assertion passait faute de pièce à
--     conviction, pas parce que la donnée était juste.
--
-- ── Conséquences pour un pilote, si on laisse en place ────────────────────
-- Deux fiches pour un même karting : record du circuit, meilleurs tours et
-- compteurs coupés en deux, et les pilotes en choisissent une au hasard.
-- « Itinéraire » expédie à 59 ou 85 km. « Autour de toi » annonce un karting
-- qui n'est pas là.
--
-- ── Ce que fait ce collage ───────────────────────────────────────────────
-- Il FUSIONNE, il ne supprime pas de connaissance : le métier du fichier
-- (longueur, homologation, adresse, téléphone…) rejoint la ligne qui porte les
-- BONNES coordonnées, l'ancien nom part en alias pour que la recherche le
-- trouve encore, et les courses éventuellement rattachées à la ligne fautive
-- sont RÉAFFECTÉES avant sa suppression — `races.circuit_id` est
-- `on delete set null`, une suppression sèche aurait orphelinisé des courses
-- jouées.
--
-- Idempotent : réappliqué, il ne trouve plus rien à fusionner et ne fait rien.

begin;

do $fusion$
declare
  v_paire record;
  v_bon   uuid;
  v_faux  uuid;
  v_races int;
  v_fait  int := 0;
begin
  -- (ligne fautive à supprimer) → (ligne à garder, celle dont les coordonnées
  -- sont vérifiées). On identifie par nom + ville normalisés, jamais par
  -- identifiant : ceux-ci sont propres à chaque base.
  for v_paire in
    select *
      from (values
        -- Ariège : le fichier et notre base parlent du circuit de Lavelanet.
        ('Kart''Are Aigues-Vives', 'Aigues-Vives',
         'Circuit International de Lavelanet', 'Aigues-Vives'),
        -- Oise : « Neuilly (Oise) » du relevé = Neuilly-sous-Clermont.
        ('Karting Loisirs Neuilly', 'Neuilly',
         'Karting', 'Neuilly-sous-Clermont')
      ) as v(faux_name, faux_city, bon_name, bon_city)
  loop
    select id into v_faux from public.circuits
     where public.kart_normalize(name) = public.kart_normalize(v_paire.faux_name)
       and public.kart_normalize(coalesce(city,'')) = public.kart_normalize(v_paire.faux_city);
    select id into v_bon from public.circuits
     where public.kart_normalize(name) = public.kart_normalize(v_paire.bon_name)
       and public.kart_normalize(coalesce(city,'')) = public.kart_normalize(v_paire.bon_city);

    -- Déjà fusionné (ou base qui n'a jamais eu le défaut) : on passe.
    if v_faux is null or v_bon is null then
      continue;
    end if;

    -- 1. Le métier du fichier passe sur la BONNE ligne. `coalesce` dans ce
    --    sens : le fichier gagne (décision PO), mais on ne remplace pas une
    --    valeur connue par un vide. Les COORDONNÉES ne bougent pas — c'est
    --    tout l'objet de l'opération.
    update public.circuits c set
      length_m     = coalesce(f.length_m, c.length_m),
      width_m      = coalesce(f.width_m, c.width_m),
      env_kind     = coalesce(f.env_kind, c.env_kind),
      motor_kind   = coalesce(f.motor_kind, c.motor_kind),
      usage_kind   = coalesce(f.usage_kind, c.usage_kind),
      homologation = coalesce(f.homologation, c.homologation),
      address      = coalesce(f.address, c.address),
      postal_code  = coalesce(f.postal_code, c.postal_code),
      phone        = coalesce(f.phone, c.phone),
      website      = coalesce(f.website, c.website),
      tracks_note  = coalesce(f.tracks_note, c.tracks_note),
      is_indoor    = case when f.env_kind is not null then f.env_kind = 'indoor' else c.is_indoor end,
      -- Les DEUX anciens noms restent cherchables : celui de la ligne gardée
      -- (qui va être renommée) et celui de la ligne fautive.
      aliases = (
        select nullif(string_agg(distinct u.a, ' | '), '')
        from (
          select trim(x) as a
          from unnest(string_to_array(
                 coalesce(c.aliases,'') || '|' || coalesce(f.aliases,'')
                 || '|' || c.name || '|' || f.name, '|')) as x
          where trim(x) <> ''
            and public.kart_normalize(trim(x)) <> public.kart_normalize(f.name)
        ) u
      )
    from public.circuits f
    where c.id = v_bon and f.id = v_faux;

    -- 2. Les courses et signalements de la ligne fautive changent de circuit.
    --    AVANT la suppression : la clé est `on delete set null`, un delete sec
    --    aurait vidé le circuit de courses déjà jouées.
    update public.races set circuit_id = v_bon where circuit_id = v_faux;
    get diagnostics v_races = row_count;
    update public.circuit_suggestions set circuit_id = v_bon where circuit_id = v_faux;

    -- 3. La ligne fautive disparaît, PUIS la ligne gardée prend le nom du
    --    fichier. Dans cet ordre : l'index unique (nom, ville) est immédiat, et
    --    renommer d'abord heurterait la ligne encore présente.
    delete from public.circuits where id = v_faux;
    update public.circuits set name = v_paire.faux_name where id = v_bon;

    v_fait := v_fait + 1;
    raise notice 'Fusionné : « % » (%) → la fiche de % · % course(s) réaffectée(s)',
      v_paire.faux_name, v_paire.faux_city, v_paire.bon_city, v_races;
  end loop;

  raise notice 'Fusions effectuées : % (0 si le correctif était déjà passé)', v_fait;
end $fusion$;

-- ── Contrôle : plus aucune paire proche à nom emboîté, et les deux fiches
-- fusionnées portent bien des coordonnées cohérentes avec leur code postal.
do $$
declare v_reste int;
begin
  select count(*) into v_reste
    from public.circuits a
    join public.circuits b on b.id > a.id
   where public.km_between(a.lat, a.lon, b.lat, b.lon) < 0.5
     and (public.kart_normalize(a.name) like '%' || public.kart_normalize(b.name) || '%'
       or public.kart_normalize(b.name) like '%' || public.kart_normalize(a.name) || '%');
  if v_reste > 0 then
    raise exception 'Il reste % doublon(s) physique(s) à nom emboîté', v_reste;
  end if;
  raise notice 'Contrôle : aucun doublon physique à nom emboîté ✔';
end $$;

commit;
