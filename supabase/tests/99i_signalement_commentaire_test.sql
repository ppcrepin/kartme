-- Le champ libre des signalements de karting (C3, décision PO 2026-08-01).
--
-- Le lot d'origine avait REFUSÉ ce champ, et pour une bonne raison : « un texte
-- ouvert est une porte d'entrée pour les insultes ». L'arbitrage lève
-- l'objection à une condition — le commentaire n'est JAMAIS public. Ces tests
-- sont là pour que cette condition reste vraie : ils échouent si le champ
-- devient lisible par un tiers, s'il échappe au filtre de mots, ou s'il
-- contourne le plafond horaire.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

/**
 * Vérifie que l'appel est refusé POUR LA BONNE RAISON.
 *
 * `when others` seul ne discrimine rien : le scénario passerait au vert si
 * `contains_banned_word` disparaissait (« fonction inexistante » est aussi une
 * exception). On exige donc que le message contienne l'extrait attendu.
 */
create function tests.refuse(sql text, attendu text, msg text) returns void language plpgsql as $$
declare v_err text;
begin
  begin
    execute sql;
  exception when others then
    v_err := sqlerrm;
    if position(attendu in v_err) = 0 then
      raise exception 'ÉCHEC : % (refusé, mais pour « % » au lieu de « % »)', msg, v_err, attendu;
    end if;
    return;
  end;
  raise exception 'ÉCHEC : % (aucune erreur levée)', msg;
end $$;

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-0000000000a1', 'auteur@t'),
  ('e0000000-0000-0000-0000-0000000000a2', 'tiers@t'),
  ('e0000000-0000-0000-0000-0000000000a3', 'modo@t');
insert into public.profiles (id, username, elo, is_moderator) values
  ('e0000000-0000-0000-0000-0000000000a1', 'Auteur_C', 1000, false),
  ('e0000000-0000-0000-0000-0000000000a2', 'Tiers_C', 1000, false),
  ('e0000000-0000-0000-0000-0000000000a3', 'Modo_C', 1000, true);

-- ═══ Scénario 1 : le commentaire est enregistré, nettoyé, plafonné ═══
do $$
declare
  auteur uuid := 'e0000000-0000-0000-0000-0000000000a1';
  v_id uuid;
begin
  perform tests.as_uid(auteur);

  v_id := public.suggest_circuit('manquant', 'Karting du Bocage', 'Vire', null,
                                 '   La piste a rouvert en mai, elle n''est pas sur la carte.   ');
  perform tests.eq((select count(*) from public.circuit_suggestions
                     where id = v_id and comment = 'La piste a rouvert en mai, elle n''est pas sur la carte.'), 1,
                   'le commentaire est enregistré, débarrassé de ses espaces');

  -- Un commentaire fait d'espaces devient NULL, pas une chaîne vide : le CHECK
  -- de longueur rejetterait celle-ci avec une erreur Postgres brute à l'écran.
  v_id := public.suggest_circuit('manquant', 'Karting des Prés', 'Laval', null, '     ');
  perform tests.eq((select count(*) from public.circuit_suggestions
                     where id = v_id and comment is null), 1,
                   'un commentaire vide de sens vaut pas de commentaire');

  -- Coupé à 200, pas rejeté : refuser un signalement pour deux caractères de
  -- trop ferait perdre le seul message qu'un pilote a pris la peine d'écrire.
  v_id := public.suggest_circuit('manquant', 'Karting Long', 'Rennes', null, repeat('a', 500));
  perform tests.eq((select char_length(comment) from public.circuit_suggestions where id = v_id), 200,
                   'un commentaire trop long est coupé à 200, le signalement passe');

  -- Et il reste facultatif : le formulaire d'origine n'en avait pas.
  v_id := public.suggest_circuit('manquant', 'Karting Muet', 'Brest');
  perform tests.eq((select count(*) from public.circuit_suggestions
                     where id = v_id and comment is null), 1,
                   'le commentaire reste facultatif');
  raise notice 'Scénario 1 (enregistrement, nettoyage, plafond) ✔';
end $$;

-- ═══ Scénario 2 : le filtre de mots couvre AUSSI le commentaire ═══
do $$
declare auteur uuid := 'e0000000-0000-0000-0000-0000000000a1';
begin
  perform tests.as_uid(auteur);
  -- Le champ le plus ouvert du formulaire serait sinon le seul à ne pas passer
  -- le filtre — exactement l'objection qui avait fait refuser ce champ.
  perform tests.refuse(
    $q$ select public.suggest_circuit('manquant', 'Karting Propre', 'Tours', null,
                                      'le patron est un connard') $q$,
    'Nom ou ville non conforme', 'un commentaire injurieux est refusé');
  -- Et le contournement espacé, que la première passe du filtre attrape sur la
  -- forme collée : sans lui, « c o n n a r d » passerait.
  perform tests.refuse(
    $q$ select public.suggest_circuit('manquant', 'Karting Propre', 'Tours', null,
                                      'c o n n a r d') $q$,
    'Nom ou ville non conforme', 'un commentaire injurieux espacé est refusé lui aussi');
  raise notice 'Scénario 2 (filtre de mots sur le commentaire) ✔';
end $$;

-- ═══ Scénario 3 : le commentaire n'est JAMAIS public ═══
do $$
declare
  auteur uuid := 'e0000000-0000-0000-0000-0000000000a1';
  tiers  uuid := 'e0000000-0000-0000-0000-0000000000a2';
  modo   uuid := 'e0000000-0000-0000-0000-0000000000a3';
  v_tiers bigint; v_file_tiers bigint; v_auteur bigint; v_modo bigint;
begin
  -- C'est LA condition de l'arbitrage. Si ce scénario tombe, le champ doit
  -- être retiré, pas rafistolé.
  --
  -- `set local role authenticated` est INDISPENSABLE : les tests tournent en
  -- superutilisateur, qui CONTOURNE la RLS. Sans ce basculement, l'assertion
  -- « un tiers ne voit rien » compte les quatre lignes de tout le monde et
  -- passerait au vert le jour où la policy disparaîtrait.
  -- Les compteurs se PRENNENT sous le rôle, les assertions se font après :
  -- le schéma `tests` n'est pas lisible par `authenticated`.
  perform tests.as_uid(tiers);
  set local role authenticated;
  select count(*) into v_tiers from public.circuit_suggestions;
  select count(*) into v_file_tiers from public.list_circuit_suggestions(true);
  reset role;
  perform tests.eq(v_tiers, 0, 'un tiers ne voit AUCUN signalement, donc aucun commentaire');
  perform tests.eq(v_file_tiers, 0, 'et la file de modération lui est fermée');

  perform tests.as_uid(auteur);
  set local role authenticated;
  select count(*) into v_auteur from public.circuit_suggestions where comment is not null;
  reset role;
  perform tests.eq(v_auteur, 2, 'l''auteur relit ses propres signalements');

  perform tests.as_uid(modo);
  set local role authenticated;
  select count(*) into v_modo from public.list_circuit_suggestions(true) where comment is not null;
  reset role;
  perform tests.eq(v_modo, 2, 'le modérateur reçoit le commentaire — c''est à ça qu''il sert');
  raise notice 'Scénario 3 (jamais public) ✔';
end $$;

-- ═══ Scénario 4 : le plafond horaire tient toujours ═══
do $$
declare auteur uuid := 'e0000000-0000-0000-0000-0000000000a1';
begin
  perform tests.as_uid(auteur);
  -- Quatre signalements déjà passés ci-dessus : le cinquième passe, le sixième
  -- non. Un champ libre rend le harcèlement de la file plus tentant, pas moins.
  perform public.suggest_circuit('manquant', 'Karting Cinq', 'Angers', null, 'cinquième');
  perform tests.refuse(
    $q$ select public.suggest_circuit('manquant', 'Karting Six', 'Nantes', null, 'sixième') $q$,
    'Trop de signalements en une heure', 'le sixième signalement en une heure est refusé');
  raise notice 'Scénario 4 (plafond horaire préservé) ✔';
end $$;

rollback;
